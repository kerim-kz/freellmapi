import express from 'express';
import { REGIONS } from '../data/catalog.js';
import { many } from '../lib/db.js';
import { html, sel } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { emptyBox, page, vhead } from '../lib/layout.js';
import { asyncH, cleanText } from '../lib/util.js';

export const router = express.Router();

router.get('/schools', asyncH(async (req, res) => {
  const region = REGIONS.includes(req.query.region) ? req.query.region : '';
  const term = cleanText(req.query.q, 80);
  const params = [];
  let where = `s.status = 'active'`;
  if (region) { params.push(region); where += ` AND s.region = $${params.length}`; }
  if (term) { params.push(`%${term}%`); where += ` AND (s.name ILIKE $${params.length} OR s.locality ILIKE $${params.length})`; }
  const schools = await many(
    `SELECT s.id, s.name, s.region, s.locality,
            count(*) FILTER (WHERE u.role = 'teacher' AND u.status = 'active') AS teachers,
            count(*) FILTER (WHERE u.role = 'student') AS students
       FROM schools s LEFT JOIN users u ON u.school_id = s.id
      WHERE ${where} GROUP BY s.id ORDER BY s.region, s.name LIMIT 500`, params);

  await page(req, res, {
    title: 'Мектептер', active: 'schools',
    body: html`
      <div class="view">
        ${vhead('Мектептер', 'Платформаға тіркелген мектептер. Мектебіңіз тізімде жоқ болса, мұғалім тіркелгенде жаңа мектепті ұсынады, ал әкімші тексеріп қосады.',
          html`<a class="btn" href="/register/teacher">Мұғалім ретінде тіркелу</a>`)}
        <form class="filters" method="get" action="/schools" data-autosubmit>
          <label class="fl">Өңір<select name="region"><option value="">Барлық өңір</option>${REGIONS.map((r) => html`<option${sel(r === region)}>${r}</option>`)}</select></label>
          <label class="search">${icon('search', 16)}<input type="search" name="q" value="${term}" placeholder="Мектеп атауы немесе елді мекен" aria-label="Мектеп іздеу"></label>
          <button class="btn ghost" type="submit">Іздеу</button>
        </form>
        <div class="resline">${schools.length} мектеп</div>
        ${schools.length ? html`<div class="list">${schools.map((s) => html`
          <div class="row">
            <span class="glyph">${icon('school')}</span>
            <div class="grow"><b>${s.name}</b><span>${s.region}${s.locality ? ` · ${s.locality}` : ''}</span></div>
            <span class="pill">${s.teachers} мұғалім</span>
            <span class="pill">${s.students} оқушы</span>
          </div>`)}</div>` : emptyBox('Мектеп табылмады', 'Сүзгіні өзгертіп көріңіз.')}
      </div>`,
  });
}));
