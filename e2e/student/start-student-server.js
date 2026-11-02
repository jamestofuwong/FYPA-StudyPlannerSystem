// Starts a throw-away PostgreSQL with the real student seed, builds the student app for production, and serves it.
// Playwright runs this as the `webServer` of the student project. A production build is needed on purpose: the problems
// that a Content-Security-Policy causes (scripts without a nonce, pages prerendered without one) do not show in `next dev`.
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { startEmbeddedDb } = require('../../tests/helpers/embeddedDb');

const ROOT = path.resolve(__dirname, '..', '..');
const STUDENT = path.join(ROOT, 'student');
const PORT = process.env.E2E_STUDENT_PORT || '3101';
const CMS = { CMS_JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e', CMS_SEED_EMAIL: 'e2e@example.com', CMS_SEED_PASSWORD: 'e2e-password-123', CMS_SEED_NAME: 'E2E' };

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { cwd: STUDENT, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with status ${r.status}`);
}

(async () => {
  const db = await startEmbeddedDb({ student: true });
  const env = { ...CMS, DATABASE_URL: db.studentUrl, DATABASE_URL_UNPOOLED: db.studentUrl, NEXT_TELEMETRY_DISABLED: '1' };
  run('npx', ['tsx', 'prisma/seed.ts'], env);
  run('npx', ['next', 'build'], env);

  const next = spawn('npx', ['next', 'start', '-p', PORT], { cwd: STUDENT, stdio: 'inherit', env: { ...process.env, ...env } });
  const stop = async () => { next.kill('SIGTERM'); await db.stop().catch(() => {}); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  next.on('exit', stop);
})().catch((e) => { console.error(e); process.exit(1); });
