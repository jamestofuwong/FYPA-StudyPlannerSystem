// Owns every server and database used by this suite. Never reads application .env values.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const EmbeddedPostgres = require('embedded-postgres').default;
const { planner, transcript, plannerPdf } = require('./fixtures.cjs');
const root = path.resolve(__dirname, '../../..');
const children = [];
let pg, client;
let failed = false;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'study-core-e2e-'));
const buildDir = `.next-e2e-core-${randomBytes(6).toString('hex')}`;
// Next rewrites these on startup when distDir changes. Restore only if nobody else edited them.
const generatedFiles = ['web/tsconfig.json', 'web/next-env.d.ts', 'student/tsconfig.json', 'student/next-env.d.ts']
  .map(name => ({ path: path.join(root, name), before: fs.readFileSync(path.join(root, name), 'utf8') }));

async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
function start(script, args, env, cwd = root) {
  const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-12000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-12000); });
  child.report = () => output;
  return child;
}
async function command(script, args, env, cwd) {
  const child = start(script, args, env, cwd);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error(child.report());
}
async function ready(url, child) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(child.report());
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready: ${url}\n${child.report()}`);
}
async function main() {
  const dbPort = await port();
  const password = randomBytes(16).toString('hex');
  pg = new EmbeddedPostgres({ databaseDir: path.join(temp, 'pg'), port: dbPort, user: 'e2e', password,
    persistent: true, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('desktop_e2e');
  await pg.createDatabase('student_e2e');
  const url = name => `postgresql://e2e:${password}@127.0.0.1:${dbPort}/${name}`;
  const desktopEnv = { DATABASE_URL: url('desktop_e2e'), APP_DATA_DIR: path.join(temp, 'app-data'), REAL_E2E_TEMP: temp, E2E_BUILD_DIR: buildDir, NEXT_TELEMETRY_DISABLED: '1' };
  const python = process.env.E2E_PYTHON || path.join(root, 'core/services/plannerImport/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(python)) throw new Error('Set E2E_PYTHON to a Python interpreter with the planner extractor requirements installed.');
  desktopEnv.PYTHON_EXECUTABLE = python;
  const studentEnv = { DATABASE_URL: url('student_e2e'), DATABASE_URL_UNPOOLED: url('student_e2e'),
    CMS_JWT_SECRET: randomBytes(32).toString('hex'), REAL_E2E_TEMP: temp, E2E_BUILD_DIR: buildDir, NEXT_TELEMETRY_DISABLED: '1' };
  console.log('Preparing disposable desktop and student databases…');
  await command(path.join(root, 'node_modules/prisma/build/index.js'), ['migrate', 'deploy', '--schema', 'core/db/prisma/schema'], desktopEnv);
  await command(path.join(root, 'student/node_modules/prisma/build/index.js'), ['db', 'push', '--schema', 'prisma/schema.prisma'], studentEnv, path.join(root, 'student'));
  const { Client } = require('pg');
  client = new Client({ connectionString: studentEnv.DATABASE_URL });
  await client.connect();
  const cmsPassword = randomBytes(18).toString('hex');
  const bcrypt = require(path.join(root, 'student/node_modules/bcryptjs'));
  await client.query('INSERT INTO cms_users (id,email,password_hash,name,updated_at) VALUES (gen_random_uuid(),$1,$2,$3,now())',
    ['e2e@example.invalid', await bcrypt.hash(cmsPassword, 4), 'Synthetic Editor']);
  const desktopURL = `http://127.0.0.1:${await port()}`;
  const studentURL = `http://127.0.0.1:${await port()}`;
  const server = path.join(__dirname, 'serve-app.cjs');
  const desktop = start(server, [], { ...desktopEnv, E2E_APP_KIND: 'desktop', E2E_APP_PORT: new URL(desktopURL).port });
  const student = start(server, [], { ...studentEnv, E2E_APP_KIND: 'student', E2E_APP_PORT: new URL(studentURL).port });
  await Promise.all([ready(`${desktopURL}/api/planners`, desktop), ready(`${studentURL}/cms/login`, student)]);
  for (const file of generatedFiles) file.generated = fs.readFileSync(file.path, 'utf8');
  async function post(endpoint, data) {
    const res = await fetch(`${desktopURL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json();
    if (!res.ok) throw new Error(`Test setup ${endpoint}: ${JSON.stringify(body)}`);
    return body;
  }
  await post('/api/privacy/acknowledge', { presented_at: new Date().toISOString() });
  const softwareId = (await post('/api/planners/save', { planner: planner() })).plannerId;
  await post('/api/planners/save', { planner: planner('E2E Cybersecurity') });
  fs.writeFileSync(path.join(temp, 'planner.pdf'), plannerPdf());
  fs.writeFileSync(path.join(temp, 'synthetic-dpa.xlsx'), transcript());
  fs.writeFileSync(path.join(temp, 'synthetic-cohort.xlsx'), transcript(true));
  const testEnv = { REAL_DESKTOP_URL: desktopURL, REAL_STUDENT_URL: studentURL,
    REAL_CMS_PASSWORD: cmsPassword, REAL_E2E_TEMP: temp, REAL_SOFTWARE_ID: softwareId, E2E_BASE_URL: desktopURL };
  console.log('Running real browser/API/database workflows…', desktopURL, studentURL);
  const features = ['planners', 'dashboard', 'class-estimation', 'cms'];
  const requested = process.argv.find(arg => arg.startsWith('--feature='))?.slice('--feature='.length);
  if (requested && !features.includes(requested)) throw new Error(`Unknown feature: ${requested}`);
  const files = (requested ? [requested] : features).map(name => path.join(__dirname, '..', `${name}.test.cjs`));
  const tests = start('--test', ['--test-concurrency=1', ...files], testEnv);
  tests.stdout.on('data', data => process.stdout.write(data));
  tests.stderr.on('data', data => process.stderr.write(data));
  const result = await new Promise(resolve => tests.once('exit', resolve));
  if (result !== 0) { console.error(desktop.report(), student.report()); failed = true; }
}
async function cleanup() {
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      await new Promise(resolve => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('exit', resolve); killer.once('error', resolve);
      });
    } else child.kill('SIGTERM');
  }
  if (client) await client.end();
  if (pg) await pg.stop();
  for (const file of generatedFiles) {
    if (file.generated && fs.readFileSync(file.path, 'utf8') === file.generated) fs.writeFileSync(file.path, file.before);
  }
  // Retain the owned temp directory on failure for diagnosis; never touch user databases.
  console.log('Disposable services stopped. Test workspace:', temp);
}
main().catch(error => { console.error(error.message); failed = true; }).finally(async () => {
  await cleanup();
  process.exit(failed ? 1 : 0);
});
