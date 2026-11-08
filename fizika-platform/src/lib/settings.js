import { many, q } from './db.js';

let cache = null;
let cachedAt = 0;

export async function getSettings() {
  if (cache && Date.now() - cachedAt < 30_000) return cache;
  const rows = await many('SELECT key, value FROM settings');
  cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cachedAt = Date.now();
  return cache;
}

export async function saveSettings(values) {
  for (const [key, value] of Object.entries(values)) {
    await q(`INSERT INTO settings(key, value) VALUES ($1,$2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
  }
  cache = null;
}
