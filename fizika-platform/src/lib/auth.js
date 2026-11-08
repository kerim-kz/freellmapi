import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { q, one } from './db.js';
import { setFlash } from './util.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(key, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cookieOpts = (maxAge) => ({ httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge });

export async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const maxAge = config.sessionDays * 86400_000;
  await q('INSERT INTO sessions(token_hash, user_id, csrf, expires_at) VALUES ($1,$2,$3,$4)',
    [sha256(token), userId, csrf, new Date(Date.now() + maxAge)]);
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  res.cookie('sid', token, cookieOpts(maxAge));
}

export async function endSession(req, res) {
  if (req.cookies.sid) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(req.cookies.sid)]);
  res.clearCookie('sid', { path: '/' });
}

export const dropUserSessions = (userId) => q('DELETE FROM sessions WHERE user_id = $1', [userId]);

// Әр сұранымда: сессияны оқу және CSRF белгісін дайындау.
export async function loadUser(req, res, next) {
  try {
    req.user = null;
    const sid = req.cookies.sid;
    if (sid) {
      const row = await one(
        `SELECT s.csrf, u.id, u.role, u.login, u.full_name, u.school_id, u.class_id, u.status, u.is_owner,
                u.must_change_password, sc.name AS school_name, c.grade AS class_grade, c.letter AS class_letter
           FROM sessions s
           JOIN users u ON u.id = s.user_id
      LEFT JOIN schools sc ON sc.id = u.school_id
      LEFT JOIN classes c ON c.id = u.class_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [sha256(sid)],
      );
      if (row && row.status !== 'blocked') {
        req.user = row;
        req.csrfToken = row.csrf;
      } else {
        res.clearCookie('sid', { path: '/' });
      }
    }
    if (!req.user) {
      // Қонақтар үшін — double-submit cookie.
      let anon = req.cookies.csrf;
      if (!anon || anon.length < 20) {
        anon = crypto.randomBytes(24).toString('base64url');
        res.cookie('csrf', anon, cookieOpts(12 * 3600_000));
      }
      req.csrfToken = anon;
    }
    res.locals.user = req.user;
    res.locals.csrf = req.csrfToken;
    next();
  } catch (err) {
    next(err);
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfOk(req) {
  const sent = String((req.body && req.body._csrf) || req.get('x-csrf-token') || '');
  const want = String(req.csrfToken || '');
  if (!sent || sent.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(want));
}

// Multipart формалардан басқасының бәрі осында тексеріледі; файл жүктеу маршруттары
// multer-ден кейін csrfAfterUpload-ты өздері шақырады.
export function csrfGuard(req, res, next) {
  if (!UNSAFE.has(req.method)) return next();
  if (req.is('multipart/form-data')) return next();
  if (csrfOk(req)) return next();
  res.status(403).send('Қауіпсіздік белгісі сәйкес келмеді. Бетті жаңартып, қайталап көріңіз.');
}
export function csrfAfterUpload(req, res, next) {
  if (csrfOk(req)) return next();
  res.status(403).send('Қауіпсіздік белгісі сәйкес келмеді. Бетті жаңартып, қайталап көріңіз.');
}

// Кіру әрекеттерін шектеу (жадта).
const attempts = new Map();
export function tooManyAttempts(key, limit = 10, windowMs = 15 * 60_000) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.reset < now) {
    attempts.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  rec.count += 1;
  return rec.count > limit;
}
export const clearAttempts = (key) => attempts.delete(key);
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
}, 10 * 60_000).unref();

// ---- қол жеткізу шарттары ----
export function requireUser(req, res, next) {
  if (req.user) return next();
  setFlash(res, 'info', 'Бұл бетті көру үшін платформаға кіріңіз.');
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}
export const isAdmin = (u) => !!u && u.role === 'admin';
export const isActiveTeacher = (u) => !!u && u.role === 'teacher' && u.status === 'active';

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return requireUser(req, res, next);
    if (roles.includes(req.user.role)) return next();
    res.status(403).send('Бұл бөлімге рұқсатыңыз жоқ.');
  };
}
export function requireActiveTeacher(req, res, next) {
  if (!req.user) return requireUser(req, res, next);
  if (isActiveTeacher(req.user) || isAdmin(req.user)) return next();
  if (req.user.role === 'teacher') {
    setFlash(res, 'info', 'Мұғалім аккаунтыңыз әкімшінің растауын күтуде.');
    return res.redirect('/cabinet');
  }
  res.status(403).send('Бұл бөлім мұғалімдерге арналған.');
}
export function requireAdmin(req, res, next) {
  if (!req.user) return requireUser(req, res, next);
  if (isAdmin(req.user)) return next();
  res.status(403).send('Бұл бөлім тек әкімшілерге арналған.');
}
export function requireOwner(req, res, next) {
  if (req.user && req.user.is_owner) return next();
  res.status(403).send('Бұл әрекетті тек платформа иесі жасай алады.');
}
