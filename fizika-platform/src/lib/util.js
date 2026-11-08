import crypto from 'node:crypto';

// Шатастыратын таңбаларсыз әліпби (0/O, 1/I/l жоқ).
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASS_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomFrom(abc, len) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += abc[bytes[i] % abc.length];
  return s;
}
export const newJoinCode = () => randomFrom(CODE_ABC, 6);
export const newTempPassword = () => randomFrom(PASS_ABC, 8);

export const LOGIN_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export function cleanText(v, max = 200) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
export function cleanMultiline(v, max = 4000) {
  return String(v ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}
export function toInt(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
export const asArray = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

// Аты-жөнін тексеру: кемінде екі сөз (тегі мен аты), тек әріптер, сызықша, апостроф.
export function validFullName(name) {
  const n = cleanText(name, 120);
  if (n.length < 4) return null;
  if (!/^[\p{L}\s'’-]+$/u.test(n)) return null;
  if (n.split(' ').filter(Boolean).length < 2) return null;
  return n;
}

const KZ_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
export function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getDate()} ${KZ_MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
export function fmtDateTime(d) {
  if (!d) return '';
  const x = new Date(d);
  const hh = String(x.getHours()).padStart(2, '0');
  const mm = String(x.getMinutes()).padStart(2, '0');
  return `${fmtDate(x)}, ${hh}:${mm}`;
}
export function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}
export const fmtPrice = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`;

export function plural(n, word) {
  return `${n} ${word}`;
}

// Excel кириллицаны дұрыс ашуы үшін BOM қосылған CSV.
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Қысқа хабарлама (flash) — келесі бетте бір рет көрсетіледі.
export function setFlash(res, type, text) {
  const v = Buffer.from(JSON.stringify({ type, text }), 'utf8').toString('base64url');
  res.cookie('flash', v, { httpOnly: true, sameSite: 'lax', maxAge: 60_000, path: '/' });
}
export function takeFlash(req, res) {
  const v = req.cookies.flash;
  if (!v) return null;
  res.clearCookie('flash', { path: '/' });
  try { return JSON.parse(Buffer.from(v, 'base64url').toString('utf8')); } catch { return null; }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
