import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { csrfGuard, loadUser } from './lib/auth.js';
import { migrate, pool } from './lib/db.js';
import { html } from './lib/html.js';
import { page } from './lib/layout.js';
import { parseCookies } from './lib/util.js';
import { bootstrap } from './seed.js';
import { router as adminRouter } from './features/admin.js';
import { router as authRouter } from './features/auth.js';
import { router as cabinetRouter } from './features/cabinet.js';
import { router as examsRouter } from './features/exams.js';
import { router as formulasRouter } from './features/formulas.js';
import { router as gamesRouter } from './features/games.js';
import { router as homeRouter } from './features/home.js';
import { router as labsRouter } from './features/labs.js';
import { router as materialsRouter } from './features/materials.js';
import { router as schoolsRouter } from './features/schools.js';
import { router as simsRouter } from './features/sims.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => path.join(root, 'node_modules', p);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  const staticOpts = { maxAge: config.isProd ? '7d' : 0, fallthrough: true };
  app.use(express.static(path.join(root, 'public'), staticOpts));
  app.use('/vendor/katex', express.static(nm('katex/dist'), staticOpts));
  app.use('/vendor/fonts/sans', express.static(nm('@fontsource/ibm-plex-sans'), staticOpts));
  app.use('/vendor/fonts/serif', express.static(nm('@fontsource/ibm-plex-serif'), staticOpts));
  app.use('/vendor/fonts/mono', express.static(nm('@fontsource/ibm-plex-mono'), staticOpts));

  app.get('/healthz', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use((req, res, next) => { req.cookies = parseCookies(req.headers.cookie); next(); });
  app.use(express.urlencoded({ extended: true, limit: '200kb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(loadUser);
  app.use(csrfGuard);

  // Уақытша құпиясөз берілсе — алдымен ауыстыру керек.
  app.use((req, res, next) => {
    if (req.user && req.user.must_change_password && !['/password', '/logout'].includes(req.path)) {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.redirect('/password');
      return res.status(403).json({ error: 'Алдымен құпиясөзді ауыстырыңыз.' });
    }
    next();
  });

  app.use(homeRouter);
  app.use(authRouter);
  app.use(cabinetRouter);
  app.use(schoolsRouter);
  app.use(materialsRouter);
  app.use(formulasRouter);
  app.use(gamesRouter);
  app.use(simsRouter);
  app.use(labsRouter);
  app.use(examsRouter);
  app.use('/admin', adminRouter);

  app.use(async (req, res) => {
    res.status(404);
    await page(req, res, {
      title: 'Бет табылмады',
      body: html`<div class="empty"><b>Бет табылмады</b>Сілтеме ескірген болуы мүмкін. <a href="/">Басты бетке</a> оралыңыз.</div>`,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use(async (err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(err);
    const text = err.code === 'LIMIT_FILE_SIZE'
      ? `Файл тым үлкен (ең көбі ${config.maxUploadMb} МБ).`
      : status >= 500 ? 'Серверде қате шықты. Сәлден кейін қайталаңыз.' : err.message;
    res.status(status);
    if (req.path.startsWith('/api/')) return res.json({ error: text });
    try {
      await page(req, res, { title: 'Қате', body: html`<div class="empty"><b>Қате</b>${text}</div>` });
    } catch {
      res.type('text').send(text);
    }
  });

  return app;
}

export async function start() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await migrate();
  await bootstrap();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Платформа іске қосылды: http://localhost:${config.port}`);
  });
  const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
