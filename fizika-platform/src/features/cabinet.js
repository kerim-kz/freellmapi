import express from 'express';
import { dropUserSessions, hashPassword, isActiveTeacher, requireActiveTeacher, requireUser } from '../lib/auth.js';
import { GAMES } from '../data/games.js';
import { EXAM, GRADES, ROLE_NAME } from '../data/catalog.js';
import { many, one, q } from '../lib/db.js';
import { html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { csrfField, emptyBox, initials, page } from '../lib/layout.js';
import {
  asyncH, cleanText, fmtDate, fmtDateTime, fmtPrice, HttpError, newJoinCode, newTempPassword, setFlash, toCsv, toInt,
} from '../lib/util.js';
import { materialCard } from './materials.js';

export const router = express.Router();

const STATUS_PILL = {
  pending: html`<span class="pill pending">күтуде</span>`,
  published: html`<span class="pill ok">жарияланды</span>`,
  approved: html`<span class="pill ok">расталды</span>`,
  rejected: html`<span class="pill no">қабылданбады</span>`,
  active: html`<span class="pill ok">расталған</span>`,
  blocked: html`<span class="pill no">бұғатталған</span>`,
};
export const statusPill = (s) => STATUS_PILL[s] || html`<span class="pill">${s}</span>`;
const gameName = (k) => (GAMES.find((g) => g.k === k) || { name: k }).name;

function profileCard(user, extra = '') {
  const where = [user.school_name, user.role === 'student' && user.class_grade ? `${user.class_grade}${user.class_letter} сынып` : '']
    .filter(Boolean).join(' · ');
  return html`
    <section class="pcard">
      <span class="ava">${initials(user.full_name)}</span>
      <div class="grow">
        <h1>${user.full_name}</h1>
        <div class="sub">${ROLE_NAME[user.role]}${where ? ` · ${where}` : ''} · логин: <span class="mono">${user.login}</span></div>
      </div>
      <div class="vhead-act">${extra}<a class="btn ghost sm" href="/password">${icon('key', 15)} Құпиясөз</a></div>
    </section>`;
}

async function ordersBlock(userId) {
  const orders = await many(
    `SELECT o.id, o.status, o.amount, o.created_at, m.id AS material_id, m.title
       FROM orders o JOIN materials m ON m.id = o.material_id WHERE o.user_id = $1 ORDER BY o.created_at DESC`, [userId]);
  if (!orders.length) return '';
  return html`
    <section class="block">
      <div class="block-h"><h2>Сатып алу өтінімдерім</h2><span class="cnt">${orders.length}</span></div>
      <div class="list">${orders.map((o) => html`
        <div class="row">
          <div class="grow"><b><a href="/materials/${o.material_id}">${o.title}</a></b><span>${fmtPrice(o.amount)} · ${fmtDate(o.created_at)}</span></div>
          ${statusPill(o.status)}
          ${o.status === 'approved' ? html`<a class="open" href="/materials/${o.material_id}/download">${icon('download', 14)} Жүктеу</a>` : ''}
        </div>`)}</div>
    </section>`;
}

// ---------------- Оқушы кабинеті ----------------
async function studentCabinet(req, res) {
  const u = req.user;
  const teacher = u.class_id ? await one(
    `SELECT t.full_name FROM classes c JOIN users t ON t.id = c.teacher_id WHERE c.id = $1`, [u.class_id]) : null;
  const best = await many(
    `SELECT game, max(score) AS best, count(*) AS plays FROM game_scores WHERE user_id = $1 GROUP BY game ORDER BY plays DESC`, [u.id]);
  const attempts = await many(
    `SELECT exam, mode, score, max_score, correct_count, total, created_at FROM exam_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8`, [u.id]);
  const mats = u.class_grade ? await many(
    `SELECT * FROM materials WHERE status = 'published' AND (grade = $1 OR grade = 0) ORDER BY created_at DESC LIMIT 6`, [u.class_grade]) : [];

  await page(req, res, {
    title: 'Кабинет', active: 'cabinet',
    body: html`
      <div class="view">
        ${profileCard(u)}
        ${!u.class_id ? html`
          <section class="panel">
            <h2>Сыныпқа қосылу</h2>
            <p class="muted">Сен қазір ешбір сыныпқа тіркелмегенсің. Мұғалімің берген кодты енгіз.</p>
            <form class="filters" method="post" action="/cabinet/join">
              ${csrfField(req)}
              <label class="fl">Сынып коды<input type="text" name="code" maxlength="8" required></label>
              <button class="btn" type="submit">Қосылу</button>
            </form>
          </section>` : html`<div class="notice"><div>Сенің физика мұғалімің: <b>${teacher ? teacher.full_name : '—'}</b>. Зертханалық жұмыстың нәтиже кодын мұғаліміңе бер.</div></div>`}
        <section class="block">
          <div class="block-h"><h2>Ойындардағы нәтижелерім</h2><a class="more" href="/games">Ойнау</a></div>
          ${best.length ? html`<div class="tblwrap"><table><thead><tr><th>Ойын</th><th class="num">Ең жақсы ұпай</th><th class="num">Ойналды</th></tr></thead>
            <tbody>${best.map((b) => html`<tr><td>${gameName(b.game)}</td><td class="num">${b.best}</td><td class="num">${b.plays}</td></tr>`)}</tbody></table></div>`
            : emptyBox('Әзірге ойын жоқ', 'Формулаларды ойын арқылы жатта — нәтижең осында сақталады.')}
        </section>
        <section class="block">
          <div class="block-h"><h2>Тест нәтижелерім</h2><a class="more" href="/exams">Тест тапсыру</a></div>
          ${attempts.length ? html`<div class="tblwrap"><table><thead><tr><th>Емтихан</th><th>Режим</th><th class="num">Балл</th><th class="num">Дұрыс</th><th>Күні</th></tr></thead>
            <tbody>${attempts.map((a) => html`<tr><td>${EXAM[a.exam]?.name || a.exam}</td><td>${a.mode === 'exam' ? 'Сынақ' : 'Жаттығу'}</td>
              <td class="num">${a.score} / ${a.max_score}</td><td class="num">${a.correct_count} / ${a.total}</td><td>${fmtDateTime(a.created_at)}</td></tr>`)}</tbody></table></div>`
            : emptyBox('Әзірге тест жоқ', 'PISA, ББЖМ немесе ҰБТ форматындағы тестті тапсырып көр.')}
        </section>
        ${mats.length ? html`<section class="block"><div class="block-h"><h2>Менің сыныбыма арналған материалдар</h2><a class="more" href="/library?grade=${u.class_grade}">Барлығы</a></div>
          <div class="mgrid">${mats.map((m) => materialCard(m))}</div></section>` : ''}
        ${await ordersBlock(u.id)}
      </div>`,
  });
}

router.post('/cabinet/join', requireUser, asyncH(async (req, res) => {
  if (req.user.role !== 'student') throw new HttpError(403, 'Бұл әрекет оқушыларға арналған.');
  const code = cleanText(req.body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cls = await one(
    `SELECT c.id, c.school_id, c.grade, c.letter FROM classes c JOIN users t ON t.id = c.teacher_id
      WHERE c.join_code = $1 AND c.is_open AND t.status = 'active'`, [code]);
  if (!cls) {
    setFlash(res, 'error', 'Код табылмады немесе сыныпқа тіркелу жабық.');
    return res.redirect('/cabinet');
  }
  await q('UPDATE users SET class_id = $1, school_id = $2 WHERE id = $3', [cls.id, cls.school_id, req.user.id]);
  setFlash(res, 'ok', `Сен ${cls.grade}${cls.letter} сыныбына қосылдың.`);
  res.redirect('/cabinet');
}));

// ---------------- Мұғалім кабинеті ----------------
async function teacherCabinet(req, res) {
  const u = req.user;
  const active = isActiveTeacher(u);
  const classes = await many(
    `SELECT c.*, (SELECT count(*) FROM users s WHERE s.class_id = c.id AND s.role = 'student') AS n
       FROM classes c WHERE c.teacher_id = $1 ORDER BY c.grade, c.letter`, [u.id]);
  const mats = await many(
    `SELECT id, title, status, price, reject_reason, created_at, downloads FROM materials WHERE author_id = $1 ORDER BY created_at DESC`, [u.id]);
  const labsCount = await one('SELECT count(*) AS n FROM lab_results WHERE teacher_id = $1', [u.id]);

  await page(req, res, {
    title: 'Мұғалім кабинеті', active: 'cabinet',
    body: html`
      <div class="view">
        ${profileCard(u, active ? html`<a class="btn sm" href="/materials/new">${icon('upload', 15)} Материал жүктеу</a>` : '')}
        ${!active ? html`<div class="notice warn"><div><b>Аккаунтыңыз әкімшінің растауын күтуде.</b> Расталғаннан кейін сынып ашып, оқушыларды тіркеп, материал жүктей аласыз. Әзірге платформаның барлық ашық бөлімдері қолжетімді.</div></div>` : ''}
        ${active ? html`
          <section class="block">
            <div class="block-h"><h2>Менің сыныптарым</h2><span class="cnt">${classes.length}</span></div>
            <p class="muted small">Сынып ашып, кодын оқушыларға беріңіз. Оқушы тіркелгенде сіздің сыныбыңызға автоматты түрде қосылады. Тіркеу аяқталса, кодты жауып қойыңыз.</p>
            <div class="list">${classes.map((c) => html`
              <div class="row">
                <div class="grow"><b><a href="/teacher/classes/${c.id}">${c.grade}${c.letter} сынып</a></b><span>${c.n} оқушы · ашылған күні ${fmtDate(c.created_at)}</span></div>
                <span class="code-big">${c.join_code}</span>
                <button class="btn ghost sm" type="button" data-copy="${c.join_code}">Көшіру</button>
                ${c.is_open ? html`<span class="pill ok">тіркеу ашық</span>` : html`<span class="pill">тіркеу жабық</span>`}
                <form method="post" action="/teacher/classes/${c.id}/toggle">${csrfField(req)}<button class="btn ghost sm" type="submit">${c.is_open ? 'Жабу' : 'Ашу'}</button></form>
                <a class="open" href="/teacher/classes/${c.id}">Оқушылар ${icon('arrow', 14)}</a>
              </div>`)}</div>
            <form class="filters panel" method="post" action="/teacher/classes">
              ${csrfField(req)}
              <label class="fl">Сынып<select name="grade">${GRADES.map((g) => html`<option value="${g}">${g}-сынып</option>`)}</select></label>
              <label class="fl">Әрпі<input type="text" name="letter" maxlength="2" placeholder="А" style="width:90px"></label>
              <button class="btn" type="submit">Сынып ашу</button>
            </form>
          </section>
          <section class="feat">
            <a class="fcard" href="/teacher/labs"><span class="glyph">${icon('lab')}</span><b>Зертхана нәтижелері</b><p>Оқушы әкелген нәтиже кодын тексеріп, журналға жазу. Журналда ${labsCount.n} жазба.</p></a>
            <a class="fcard" href="/materials/new"><span class="glyph brass">${icon('upload')}</span><b>Материал жүктеу</b><p>PowerPoint презентация, Word ҚМЖ, PDF оқу құралы немесе тест. Әкімші тексеріп жариялайды.</p></a>
            <a class="fcard" href="/exams"><span class="glyph">${icon('exam')}</span><b>Емтиханға дайындық</b><p>PISA, ББЖМ, ҰБТ тестері. Оқушылардың нәтижесі сынып бетінде көрінеді.</p></a>
          </section>` : ''}
        <section class="block">
          <div class="block-h"><h2>Менің материалдарым</h2><span class="cnt">${mats.length}</span></div>
          ${mats.length ? html`<div class="list">${mats.map((m) => html`
            <div class="row">
              <div class="grow"><b><a href="/materials/${m.id}">${m.title}</a></b><span>${fmtDate(m.created_at)} · ${m.price ? fmtPrice(m.price) : 'тегін'} · ${m.downloads} рет жүктелді${m.status === 'rejected' && m.reject_reason ? ` · Себебі: ${m.reject_reason}` : ''}</span></div>
              ${statusPill(m.status)}
            </div>`)}</div>` : emptyBox('Әзірге материал жоқ', active ? 'Алғашқы презентацияңызды немесе ҚМЖ-ңызды жүктеңіз.' : 'Аккаунт расталғаннан кейін материал жүктей аласыз.')}
        </section>
        ${await ordersBlock(u.id)}
      </div>`,
  });
}

router.get('/cabinet', requireUser, asyncH(async (req, res) => {
  if (req.user.role === 'admin') return res.redirect('/admin');
  if (req.user.role === 'teacher') return teacherCabinet(req, res);
  return studentCabinet(req, res);
}));

// ---------------- Сыныптар ----------------
router.post('/teacher/classes', requireActiveTeacher, asyncH(async (req, res) => {
  const grade = toInt(req.body.grade);
  const letter = cleanText(req.body.letter, 2).toUpperCase();
  if (!GRADES.includes(grade) || !/^[\p{L}]{0,2}$/u.test(letter)) {
    setFlash(res, 'error', 'Сынып нөмірі 7–11 аралығында, әрпі бір-екі әріп болсын.');
    return res.redirect('/cabinet');
  }
  for (let i = 0; i < 5; i++) {
    try {
      await q('INSERT INTO classes(teacher_id, school_id, grade, letter, join_code) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, req.user.school_id, grade, letter, newJoinCode()]);
      setFlash(res, 'ok', `${grade}${letter} сыныбы ашылды. Кодты оқушыларға беріңіз.`);
      return res.redirect('/cabinet');
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new Error('join code collision');
}));

async function ownClass(req) {
  const c = await one('SELECT * FROM classes WHERE id = $1', [toInt(req.params.id)]);
  if (!c || (c.teacher_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Сынып табылмады.');
  return c;
}

router.post('/teacher/classes/:id/toggle', requireActiveTeacher, asyncH(async (req, res) => {
  const c = await ownClass(req);
  await q('UPDATE classes SET is_open = NOT is_open WHERE id = $1', [c.id]);
  res.redirect(req.get('referer')?.includes(`/teacher/classes/${c.id}`) ? `/teacher/classes/${c.id}` : '/cabinet');
}));

router.post('/teacher/classes/:id/delete', requireActiveTeacher, asyncH(async (req, res) => {
  const c = await ownClass(req);
  const n = await one(`SELECT count(*) AS n FROM users WHERE class_id = $1`, [c.id]);
  if (n.n > 0) {
    setFlash(res, 'error', 'Сыныпта оқушылар бар. Алдымен оларды сыныптан шығарыңыз.');
    return res.redirect(`/teacher/classes/${c.id}`);
  }
  await q('DELETE FROM classes WHERE id = $1', [c.id]);
  setFlash(res, 'ok', 'Сынып өшірілді.');
  res.redirect('/cabinet');
}));

async function classStudents(classId) {
  return many(
    `SELECT u.id, u.full_name, u.login, u.last_login_at, u.created_at,
            (SELECT count(*) FROM game_scores g WHERE g.user_id = u.id) AS games,
            (SELECT count(*) FROM exam_attempts a WHERE a.user_id = u.id) AS exams,
            (SELECT round(avg(100.0 * a.score / nullif(a.max_score, 0))) FROM exam_attempts a WHERE a.user_id = u.id) AS avg_pct
       FROM users u WHERE u.class_id = $1 AND u.role = 'student' ORDER BY u.full_name`, [classId]);
}

router.get('/teacher/classes/:id', requireActiveTeacher, asyncH(async (req, res) => {
  const c = await ownClass(req);
  const students = await classStudents(c.id);
  await page(req, res, {
    title: `${c.grade}${c.letter} сынып`, active: 'cabinet',
    body: html`
      <div class="view">
        <div class="crumbs"><a href="/cabinet">Кабинет</a><span>/</span><span>${c.grade}${c.letter} сынып</span></div>
        <div class="vhead">
          <div><h1>${c.grade}${c.letter} сынып</h1><p>${students.length} оқушы. Тіркелу коды: <span class="code-big">${c.join_code}</span> ${c.is_open ? '(ашық)' : '(жабық)'}</p></div>
          <div class="vhead-act">
            <form method="post" action="/teacher/classes/${c.id}/toggle">${csrfField(req)}<button class="btn ghost" type="submit">${c.is_open ? 'Тіркеуді жабу' : 'Тіркеуді ашу'}</button></form>
            <a class="btn ghost" href="/teacher/classes/${c.id}/export.csv">${icon('download', 15)} Excel (CSV)</a>
          </div>
        </div>
        ${students.length ? html`<div class="tblwrap"><table>
          <thead><tr><th>№</th><th>Аты-жөні</th><th>Логин</th><th>Соңғы кіру</th><th class="num">Ойын</th><th class="num">Тест</th><th class="num">Тест орташа, %</th><th></th></tr></thead>
          <tbody>${students.map((s, i) => html`<tr>
            <td class="num">${i + 1}</td><td>${s.full_name}</td><td class="mono">${s.login}</td>
            <td>${s.last_login_at ? fmtDateTime(s.last_login_at) : '—'}</td>
            <td class="num">${s.games}</td><td class="num">${s.exams}</td><td class="num">${s.avg_pct ?? '—'}</td>
            <td><div class="acts" style="display:flex;gap:6px">
              <form method="post" action="/teacher/students/${s.id}/reset" data-confirm="${s.full_name} үшін жаңа уақытша құпиясөз жасалсын ба?">${csrfField(req)}<button class="btn ghost sm" type="submit">Құпиясөзді жаңарту</button></form>
              <form method="post" action="/teacher/students/${s.id}/remove" data-confirm="${s.full_name} сыныптан шығарылсын ба?">${csrfField(req)}<button class="btn warn sm" type="submit">Шығару</button></form>
            </div></td></tr>`)}</tbody></table></div>`
          : html`${emptyBox('Сыныпта әзірге оқушы жоқ', `Оқушыларға ${c.join_code} кодын беріңіз: олар «Тіркелу → Мен оқушымын» бетінде енгізеді.`)}
            <form method="post" action="/teacher/classes/${c.id}/delete" data-confirm="Сынып өшірілсін бе?">${csrfField(req)}<button class="btn warn sm" type="submit">Сыныпты өшіру</button></form>`}
      </div>`,
  });
}));

router.get('/teacher/classes/:id/export.csv', requireActiveTeacher, asyncH(async (req, res) => {
  const c = await ownClass(req);
  const students = await classStudents(c.id);
  const rows = [['№', 'Аты-жөні', 'Логин', 'Соңғы кіру', 'Ойын саны', 'Тест саны', 'Тест орташа %']];
  students.forEach((s, i) => rows.push([i + 1, s.full_name, s.login, s.last_login_at ? fmtDateTime(s.last_login_at) : '', s.games, s.exams, s.avg_pct ?? '']));
  res.type('text/csv; charset=utf-8').attachment(`synyp-${c.grade}${c.letter}.csv`).send(toCsv(rows));
}));

async function ownStudent(req) {
  const s = await one(
    `SELECT u.id, u.full_name, u.login, u.class_id, c.teacher_id FROM users u JOIN classes c ON c.id = u.class_id
      WHERE u.id = $1 AND u.role = 'student'`, [toInt(req.params.id)]);
  if (!s || (s.teacher_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Оқушы табылмады.');
  return s;
}

router.post('/teacher/students/:id/reset', requireActiveTeacher, asyncH(async (req, res) => {
  const s = await ownStudent(req);
  const temp = newTempPassword();
  await q('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [await hashPassword(temp), s.id]);
  await dropUserSessions(s.id);
  setFlash(res, 'ok', `${s.full_name}: логин «${s.login}», уақытша құпиясөз «${temp}». Оқушы кіргенде өз құпиясөзін ойлап табады.`);
  res.redirect(`/teacher/classes/${s.class_id}`);
}));

router.post('/teacher/students/:id/remove', requireActiveTeacher, asyncH(async (req, res) => {
  const s = await ownStudent(req);
  await q('UPDATE users SET class_id = NULL WHERE id = $1', [s.id]);
  setFlash(res, 'ok', `${s.full_name} сыныптан шығарылды.`);
  res.redirect(`/teacher/classes/${s.class_id}`);
}));
