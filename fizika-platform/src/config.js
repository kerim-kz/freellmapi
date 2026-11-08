import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  port: Number(env.PORT) || 3000,
  isProd,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres@localhost:5432/fizika',
  pgSsl: env.PGSSL === '1',
  uploadDir: path.resolve(env.UPLOAD_DIR || './data/uploads'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 50,
  siteName: env.SITE_NAME || 'Ғылым Ордасы',
  owner: {
    login: env.ADMIN_LOGIN || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Платформа иесі',
  },
  // Платформа иесі + 3 көмекші әкімші.
  maxAdmins: 4,
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : isProd,
  sessionDays: 30,
};

if (isProd && !env.DATABASE_URL) {
  console.error('DATABASE_URL орнатылмаған. Railway-да PostgreSQL қосып, айнымалыны сервиске байланыстырыңыз.');
  process.exit(1);
}
