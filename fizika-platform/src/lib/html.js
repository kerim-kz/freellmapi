// Қауіпсіз HTML үлгілері: ${} ішіндегі мәндердің бәрі автоматты түрде экрандалады.
// Сенімді HTML-ді ғана raw() арқылы өткізіңіз.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// JSON-ды <script type="application/json"> ішіне қауіпсіз салу.
export const jsonScript = (id, data) =>
  raw(`<script type="application/json" id="${esc(id)}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);

export const sel = (cond) => (cond ? raw(' selected') : '');
export const chk = (cond) => (cond ? raw(' checked') : '');
