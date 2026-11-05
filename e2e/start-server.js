// Starts a throw-away PostgreSQL, loads the real seed data, then runs the advisor UI (Next.js) against it.
// Playwright runs this as its `webServer`, so every E2E run starts from the same clean database.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Client } = require('pg');
const { startEmbeddedDb } = require('../tests/helpers/embeddedDb');

const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'runtime/postgres/scripts/seed');
const PORT = process.env.E2E_PORT || '3100';

(async () => {
  const db = await startEmbeddedDb({ desktop: true });
  const c = new Client({ connectionString: db.desktopUrl });
  await c.connect();
  for (const f of fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.sql')).sort()) await c.query(fs.readFileSync(path.join(SEED_DIR, f), 'utf8'));
  await c.end();

  const next = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'dev', 'web', '--webpack', '-p', PORT], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: db.desktopUrl, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' },
  });
  const stop = async () => { next.kill('SIGTERM'); await db.stop().catch(() => {}); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  next.on('exit', stop);
})().catch((e) => { console.error(e); process.exit(1); });
