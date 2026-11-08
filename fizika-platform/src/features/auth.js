import express from 'express';
import {
  clearAttempts, dropUserSessions, endSession, hashPassword, requireUser, startSession, tooManyAttempts, verifyPassword,
} from '../lib/auth.js';
import { REGIONS } from '../data/catalog.js';
import { many, one, q, tx } from '../lib/db.js';
import { html, sel } from '../lib/html.js';
import { csrfField, page } from '../lib/layout.js';
import { asyncH, cleanText, LOGIN_RE, setFlash, toInt, validFullName } from '../lib/util.js';

export const router = express.Router();

// Қайта бағыттауды тек өз сайтымыздың ішіндегі жолға рұқсат етеміз.
const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : '');
const homeFor = (u) => (u.role === 'admin' ? '/admin' : '/cabinet');

function errBox(errors) {
  if (!errors || !errors.length) return '';
  return html`<div class="flash error" role="alert"><div>${errors.map((e) => html`<div>${e}</div>`)}</div></div>`;
}

// ---------- Кіру ----------
function loginView(req, res, { errors = [], login = '' } = {}) {
  const next = safeNext(req.query.next || req.body?.next);
  return page(req, res, {
    title: 'Кіру',
    body: html`
      <div class="panel narrow">
        <h2>Платформаға кіру</h2>
        <p class="muted">Логин мен құпиясөзіңізді енгізіңіз. Құпиясөзді ұмытсаңыз, оқушы өз мұғаліміне, мұғалім әкімшіге хабарласады.</p>
        ${errBox(errors)}
        <form class="form" method="post" action="/login">
          ${csrfField(req)}
          <input type="hidden" name="next" value="${next}">
          <label class="fl">Логин<input type="text" name="login" value="${login}" autocomplete="username" autocapitalize="none" required></label>
          <label class="fl">Құпиясөз<input type="password" name="password" autocomplete="current-password" required></label>
          <div class="formfoot"><a class="linkbtn" href="/register">Тіркелу</a><button class="btn" type="submit">Кіру</button></div>
        </form>
      </div>`,
  });
}

router.get('/login', asyncH(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  await loginView(req, res);
}));

router.post('/login', asyncH(async (req, res) => {
  const login = cleanText(req.body.login, 40);
  const password = String(req.body.password || '');
  const ipKey = `ip:${req.ip}`;
  const loginKey = `login:${login.toLowerCase()}`;
  if (tooManyAttempts(ipKey, 30) || tooManyAttempts(loginKey, 8)) {
    res.status(429);
    return loginView(req, res, { login, errors: ['Тым көп сәтсіз әрекет. 15 минуттан кейін қайталаңыз.'] });
  }
  const user = await one('SELECT id, role, status, password_hash FROM users WHERE lower(login) = lower($1)', [login]);
  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) {
    res.status(401);
    return loginView(req, res, { login, errors: ['Логин немесе құпиясөз қате.'] });
  }
  if (user.status === 'blocked') {
    res.status(403);
    return loginView(req, res, { login, errors: ['Аккаунт бұғатталған. Әкімшіге хабарласыңыз.'] });
  }
  clearAttempts(loginKey);
  await startSession(res, user.id);
  res.redirect(safeNext(req.body.next) || homeFor(user));
}));

router.post('/logout', asyncH(async (req, res) => {
  await endSession(req, res);
  res.redirect('/');
}));

// ---------- Тіркелу: рөл таңдау ----------
router.get('/register', asyncH(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  await page(req, res, {
    title: 'Тіркелу',
    body: html`
      <div class="vhead"><div><h1>Тіркелу</h1><p>Оқушылар мұғалім берген сынып кодымен тіркеледі. Мұғалім аккаунтын әкімші растайды. Әкімші аккаунттары тіркеу арқылы ашылмайды.</p></div></div>
      <div class="rolepick">
        <a class="rolecard" href="/register/student">
          <span class="glyph">${'Оқ'}</span>
          <b>Мен оқушымын</b>
          <p>Физика мұғаліміңіз берген 6 таңбалы сынып коды керек. Мектебің мен сыныбың өздігінен белгіленеді.</p>
        </a>
        <a class="rolecard" href="/register/teacher">
          <span class="glyph brass">${'Мұ'}</span>
          <b>Мен мұғаліммін</b>
          <p>Мектебіңізді тізімнен таңдаңыз немесе жаңасын ұсыныңыз. Әкімші растағаннан кейін сынып ашып, материал жүктей аласыз.</p>
        </a>
      </div>`,
  });
}));

// Логин мен құпиясөзді тексеру (екі тіркелу формасына ортақ).
async function checkCredentials(body, minLen, errors) {
  const login = cleanText(body.login, 40);
  const password = String(body.password || '');
  if (!LOGIN_RE.test(login)) errors.push('Логин 3–32 таңбадан тұрсын: латын әріптері, сандар, нүкте, сызықша.');
  else if (await one('SELECT 1 FROM users WHERE lower(login) = lower($1)', [login])) errors.push('Бұл логин бос емес, басқасын таңдаңыз.');
  if (password.length < minLen) errors.push(`Құпиясөз кемінде ${minLen} таңба болсын.`);
  if (password !== String(body.password2 || '')) errors.push('Құпиясөздер сәйкес келмеді.');
  return { login, password };
}

// ---------- Оқушы ----------
async function findOpenClass(code) {
  const c = cleanText(code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 6) return null;
  return one(
    `SELECT c.id, c.grade, c.letter, c.school_id, c.is_open, s.name AS school_name, u.full_name AS teacher_name
       FROM classes c JOIN users u ON u.id = c.teacher_id LEFT JOIN schools s ON s.id = c.school_id
      WHERE c.join_code = $1 AND u.status = 'active'`, [c]);
}

function studentView(req, res, { cls = null, code = '', errors = [], values = {} } = {}) {
  const step2 = cls && cls.is_open;
  return page(req, res, {
    title: 'Оқушыны тіркеу',
    body: html`
      <div class="panel narrow">
        <h2>Оқушыны тіркеу</h2>
        ${errBox(errors)}
        ${!step2 ? html`
          <p class="muted">Физика мұғаліміңіз берген сынып кодын енгізіңіз.</p>
          <form class="form" method="get" action="/register/student">
            <label class="fl">Сынып коды<input type="text" name="code" value="${code}" maxlength="8" autocapitalize="characters" placeholder="Мысалы: K7M2QX" required></label>
            <div class="formfoot"><a class="linkbtn" href="/register">Артқа</a><button class="btn" type="submit">Жалғастыру</button></div>
          </form>` : html`
          <div class="notice"><div><b>${cls.grade}${cls.letter} сынып</b> · ${cls.school_name || 'Мектеп көрсетілмеген'}<br>Мұғалім: ${cls.teacher_name}</div></div>
          <form class="form" method="post" action="/register/student">
            ${csrfField(req)}
            <input type="hidden" name="code" value="${code}">
            <label class="fl"><span class="req">Тегі, аты (және әкесінің аты)</span><input type="text" name="full_name" value="${values.full_name || ''}" maxlength="120" placeholder="Мысалы: Сейітов Нұрлан" required></label>
            <label class="fl"><span class="req">Логин</span><input type="text" name="login" value="${values.login || ''}" autocapitalize="none" autocomplete="username" placeholder="nurlan.s" required></label>
            <div class="row2">
              <label class="fl"><span class="req">Құпиясөз</span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
              <label class="fl"><span class="req">Құпиясөзді қайталаңыз</span><input type="password" name="password2" autocomplete="new-password" minlength="6" required></label>
            </div>
            <p class="hint">Электрондық пошта мен телефон сұралмайды. Құпиясөзді ұмытсаң, мұғалімің жаңа уақытша құпиясөз береді.</p>
            <div class="formfoot"><a class="linkbtn" href="/register/student">Басқа код</a><button class="btn" type="submit">Тіркелу</button></div>
          </form>`}
      </div>`,
  });
}

router.get('/register/student', asyncH(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  const code = cleanText(req.query.code, 12).toUpperCase();
  if (!code) return studentView(req, res);
  const cls = await findOpenClass(code);
  if (!cls) return studentView(req, res, { code, errors: ['Мұндай сынып коды табылмады. Мұғаліміңізден кодты қайта сұраңыз.'] });
  if (!cls.is_open) return studentView(req, res, { code, errors: ['Бұл сыныпқа тіркелу жабық. Мұғаліміңізге хабарласыңыз.'] });
  return studentView(req, res, { cls, code });
}));

router.post('/register/student', asyncH(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  const code = cleanText(req.body.code, 12).toUpperCase();
  const cls = await findOpenClass(code);
  if (!cls || !cls.is_open) return studentView(req, res, { code, errors: ['Сынып коды жарамсыз немесе тіркелу жабық.'] });
  const errors = [];
  const fullName = validFullName(req.body.full_name);
  if (!fullName) errors.push('Тегің мен атыңды толық жаз (кемінде екі сөз, тек әріптер).');
  const { login, password } = await checkCredentials(req.body, 6, errors);
  if (errors.length) {
    res.status(400);
    return studentView(req, res, { cls, code, errors, values: { full_name: req.body.full_name, login: req.body.login } });
  }
  const user = await one(
    `INSERT INTO users(role, login, password_hash, full_name, school_id, class_id, status)
     VALUES ('student', $1, $2, $3, $4, $5, 'active') RETURNING id`,
    [login, await hashPassword(password), fullName, cls.school_id, cls.id]);
  await startSession(res, user.id);
  setFlash(res, 'ok', `Қош келдің! Сен ${cls.grade}${cls.letter} сыныбына қосылдың.`);
  res.redirect('/cabinet');
}));

// ---------- Мұғалім ----------
async function teacherView(req, res, { errors = [], values = {} } = {}) {
  const schools = await many(`SELECT id, name, region, locality FROM schools WHERE status = 'active' ORDER BY region, name`);
  const byRegion = new Map();
  for (const s of schools) {
    if (!byRegion.has(s.region)) byRegion.set(s.region, []);
    byRegion.get(s.region).push(s);
  }
  const newSchool = values.school_id === 'new' || !schools.length;
  return page(req, res, {
    title: 'Мұғалімді тіркеу',
    body: html`
      <div class="panel narrow">
        <h2>Мұғалімді тіркеу</h2>
        <p class="muted">Өтініміңізді әкімші тексереді. Расталғанша платформаны қарай аласыз, бірақ сынып аша алмайсыз және материал жүктей алмайсыз.</p>
        ${errBox(errors)}
        <form class="form" method="post" action="/register/teacher">
          ${csrfField(req)}
          <label class="fl"><span class="req">Тегі, аты, әкесінің аты</span><input type="text" name="full_name" value="${values.full_name || ''}" maxlength="120" required></label>
          <label class="fl"><span class="req">Мектеп</span>
            <select name="school_id" id="schoolSel">
              <option value="">— таңдаңыз —</option>
              ${[...byRegion].map(([region, list]) => html`<optgroup label="${region}">${list.map((s) => html`<option value="${s.id}"${sel(String(values.school_id) === String(s.id))}>${s.name}${s.locality ? ` (${s.locality})` : ''}</option>`)}</optgroup>`)}
              <option value="new"${sel(newSchool)}>Мектебім тізімде жоқ — жаңасын ұсынамын</option>
            </select>
          </label>
          <fieldset class="checks" id="newSchool" style="display:grid;gap:10px">
            <legend>Жаңа мектеп (тізімде жоқ болса ғана толтырыңыз)</legend>
            <label class="fl">Мектептің толық атауы<input type="text" name="school_name" value="${values.school_name || ''}" maxlength="200" placeholder="№12 жалпы білім беретін мектеп"></label>
            <div class="row2">
              <label class="fl">Өңір<select name="school_region"><option value="">— таңдаңыз —</option>${REGIONS.map((r) => html`<option${sel(values.school_region === r)}>${r}</option>`)}</select></label>
              <label class="fl">Елді мекен<input type="text" name="school_locality" value="${values.school_locality || ''}" maxlength="120" placeholder="Қала, аудан, ауыл"></label>
            </div>
          </fieldset>
          <label class="fl"><span class="req">Логин</span><input type="text" name="login" value="${values.login || ''}" autocapitalize="none" autocomplete="username" required></label>
          <div class="row2">
            <label class="fl"><span class="req">Құпиясөз (кемінде 8 таңба)</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
            <label class="fl"><span class="req">Құпиясөзді қайталаңыз</span><input type="password" name="password2" autocomplete="new-password" minlength="8" required></label>
          </div>
          <div class="formfoot"><a class="linkbtn" href="/register">Артқа</a><button class="btn" type="submit">Өтінім жіберу</button></div>
        </form>
      </div>`,
  });
}

router.get('/register/teacher', asyncH(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  await teacherView(req, res);
}));

router.post('/register/teacher', asyncH(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  const errors = [];
  const fullName = validFullName(req.body.full_name);
  if (!fullName) errors.push('Аты-жөніңізді толық жазыңыз (кемінде екі сөз, тек әріптер).');
  let schoolId = null;
  let newSchool = null;
  if (req.body.school_id === 'new') {
    const name = cleanText(req.body.school_name, 200);
    const region = REGIONS.includes(req.body.school_region) ? req.body.school_region : '';
    if (name.length < 3) errors.push('Жаңа мектептің атауын жазыңыз.');
    if (!region) errors.push('Жаңа мектептің өңірін таңдаңыз.');
    newSchool = { name, region, locality: cleanText(req.body.school_locality, 120) };
  } else {
    const s = await one(`SELECT id FROM schools WHERE id = $1 AND status = 'active'`, [toInt(req.body.school_id)]);
    if (!s) errors.push('Мектепті тізімнен таңдаңыз.');
    else schoolId = s.id;
  }
  const { login, password } = await checkCredentials(req.body, 8, errors);
  if (errors.length) {
    res.status(400);
    return teacherView(req, res, { errors, values: req.body });
  }
  const hash = await hashPassword(password);
  const user = await tx(async (c) => {
    if (newSchool) {
      const s = await c.query(`INSERT INTO schools(name, region, locality, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
        [newSchool.name, newSchool.region, newSchool.locality]);
      schoolId = s.rows[0].id;
    }
    const u = await c.query(`INSERT INTO users(role, login, password_hash, full_name, school_id, status)
      VALUES ('teacher', $1, $2, $3, $4, 'pending') RETURNING id`, [login, hash, fullName, schoolId]);
    return u.rows[0];
  });
  await startSession(res, user.id);
  setFlash(res, 'ok', 'Өтінім қабылданды. Әкімші растағанда сынып ашып, материал жүктей аласыз.');
  res.redirect('/cabinet');
}));

// ---------- Құпиясөзді ауыстыру ----------
router.get('/password', requireUser, asyncH(async (req, res) => {
  const forced = req.user.must_change_password;
  await page(req, res, {
    title: 'Құпиясөзді ауыстыру',
    body: html`
      <div class="panel narrow">
        <h2>Құпиясөзді ауыстыру</h2>
        ${forced ? html`<div class="notice warn"><div>Сізге уақытша құпиясөз берілген. Жалғастыру үшін жаңа құпиясөз ойлап табыңыз.</div></div>` : ''}
        <form class="form" method="post" action="/password">
          ${csrfField(req)}
          <label class="fl">Қазіргі құпиясөз<input type="password" name="current" autocomplete="current-password" required></label>
          <div class="row2">
            <label class="fl">Жаңа құпиясөз<input type="password" name="password" autocomplete="new-password" required></label>
            <label class="fl">Жаңа құпиясөзді қайталаңыз<input type="password" name="password2" autocomplete="new-password" required></label>
          </div>
          <div class="formfoot"><button class="btn" type="submit">Сақтау</button></div>
        </form>
      </div>`,
  });
}));

router.post('/password', requireUser, asyncH(async (req, res) => {
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const min = req.user.role === 'student' ? 6 : 8;
  const pw = String(req.body.password || '');
  let err = '';
  if (!(await verifyPassword(String(req.body.current || ''), row.password_hash))) err = 'Қазіргі құпиясөз қате.';
  else if (pw.length < min) err = `Жаңа құпиясөз кемінде ${min} таңба болсын.`;
  else if (pw !== String(req.body.password2 || '')) err = 'Жаңа құпиясөздер сәйкес келмеді.';
  if (err) {
    setFlash(res, 'error', err);
    return res.redirect('/password');
  }
  await q('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [await hashPassword(pw), req.user.id]);
  await dropUserSessions(req.user.id);
  await startSession(res, req.user.id);
  setFlash(res, 'ok', 'Құпиясөз ауыстырылды.');
  res.redirect(homeFor(req.user));
}));
