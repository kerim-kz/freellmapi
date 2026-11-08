import { config } from './config.js';
import { hashPassword } from './lib/auth.js';
import { many, one, q, tx } from './lib/db.js';
import { LOGIN_RE } from './lib/util.js';
import { SEED_UNITS } from './data/questions.js';

// Платформа иесін (бас әкімшіні) ортаның айнымалыларынан жасау.
// Иесі бар болса, ештеңе өзгертілмейді — құпиясөзді әкімші панелінен ауыстырыңыз.
export async function ensureOwner() {
  const owner = await one('SELECT id FROM users WHERE is_owner');
  if (owner) return;
  const { login, password, name } = config.owner;
  if (!login || !password) {
    console.warn('ЕСКЕРТУ: ADMIN_LOGIN және ADMIN_PASSWORD орнатылмаған — платформа иесі әлі жасалмады.');
    return;
  }
  if (!LOGIN_RE.test(login) || password.length < 10) {
    console.warn('ЕСКЕРТУ: ADMIN_LOGIN латынша 3–32 таңба, ADMIN_PASSWORD кемінде 10 таңба болуы керек.');
    return;
  }
  const taken = await one('SELECT id, role FROM users WHERE lower(login) = lower($1)', [login]);
  if (taken) {
    await q(`UPDATE users SET role = 'admin', is_owner = true, status = 'active' WHERE id = $1`, [taken.id]);
  } else {
    await q(`INSERT INTO users(role, login, password_hash, full_name, status, is_owner)
             VALUES ('admin', $1, $2, $3, 'active', true)`, [login, await hashPassword(password), name]);
  }
  console.log(`Платформа иесі жасалды: ${login}`);
}

// Емтихан сұрақтарының бастапқы банкі (seed_key бойынша бір рет қана қосылады).
export async function seedQuestions() {
  const existing = new Set((await many('SELECT seed_key FROM exam_units WHERE seed_key IS NOT NULL')).map((r) => r.seed_key));
  let added = 0;
  for (const u of SEED_UNITS) {
    if (existing.has(u.key)) continue;
    await tx(async (c) => {
      const unit = await c.query(
        `INSERT INTO exam_units(exam, title, grade, section, context, seed_key) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [u.exam, u.title || '', u.grade || 0, u.section || '', u.context || '', u.key]);
      let ord = 0;
      for (const qn of u.questions) {
        const kind = qn.correct.length > 1 ? 'multi' : 'single';
        await c.query(
          `INSERT INTO exam_questions(unit_id, ord, kind, stem, options, correct, explanation, points)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [unit.rows[0].id, ord++, kind, qn.stem, JSON.stringify(qn.options), JSON.stringify(qn.correct), qn.explain || '', kind === 'multi' ? 2 : 1]);
      }
    });
    added++;
  }
  if (added) console.log(`Емтихан банкіне ${added} блок қосылды.`);
}

export async function bootstrap() {
  await ensureOwner();
  await seedQuestions();
  await q(`DELETE FROM sessions WHERE expires_at < now()`);
}
