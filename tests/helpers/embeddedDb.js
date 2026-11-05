// Starts a throw-away PostgreSQL (the same embedded-postgres package the app ships) in a temp folder, creates one
// database for the desktop schema and one for the student schema, and applies each schema's migrations.
//
// Used by the integration and end-to-end tests. Plain CommonJS so Jest's global setup and Playwright can both load it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

function prismaMigrate(prismaCli, schema, cwd, url) {
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', `--schema=${schema}`], {
    cwd, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe',
  });
}

/**
 * @param {{ desktop?: boolean, student?: boolean }} what  which schemas to create
 * @returns {Promise<{ port: number, desktopUrl?: string, studentUrl?: string, stop: () => Promise<void> }>}
 */
async function startEmbeddedDb(what = { desktop: true, student: true }) {
  const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fypa-testdb-'));
  const port = await freePort();
  const user = 'tester', password = 'tester';
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user, password, port, persistent: false, initdbFlags: ['--locale=C', '--encoding=UTF8'] });
  await pg.initialise();
  await pg.start();
  const urlFor = (db) => `postgresql://${user}:${password}@127.0.0.1:${port}/${db}`;
  const out = { port, dir };

  if (what.desktop) {
    await pg.createDatabase('desktop_test');
    out.desktopUrl = urlFor('desktop_test');
    prismaMigrate(path.join(ROOT, 'node_modules/prisma/build/index.js'), path.join(ROOT, 'core/db/prisma/schema/base.prisma'), path.join(ROOT, 'core/db'), out.desktopUrl);
  }
  if (what.student) {
    await pg.createDatabase('student_test');
    out.studentUrl = urlFor('student_test');
    prismaMigrate(path.join(ROOT, 'student/node_modules/prisma/build/index.js'), path.join(ROOT, 'student/prisma/schema.prisma'), path.join(ROOT, 'student'), out.studentUrl);
  }
  out.stop = async () => { try { await pg.stop(); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
  return out;
}

module.exports = { startEmbeddedDb };
