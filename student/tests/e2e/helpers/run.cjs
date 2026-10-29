// Student-only, disposable databases and test-owned servers. No app source edits.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const EmbeddedPostgres = require('embedded-postgres').default;
const { Client } = require('pg');
const root = path.resolve(__dirname, '../../../..');
const student = path.join(root, 'student');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'student-full-e2e-'));
const children = [];
const declarations = ['next-env.d.ts', 'tsconfig.json'].map(name => ({ path: path.join(student, name), original: fs.readFileSync(path.join(student, name), 'utf8') }));
let pg, client, failed = false;
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function start(script, args, env, forward = false) {
  const child = spawn(process.execPath, [script, ...args], { cwd: student, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-20000); if (forward) process.stdout.write(data); });
  child.report = () => output;
  return child;
}
async function completed(child) {
  return new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
}
async function command(script, args, env, forward = false) {
  const child = start(script, args, env, forward);
  if (await completed(child) !== 0) throw new Error(child.report());
}
async function ready(url, child) {
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(child.report());
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Student test server did not become ready.\n${child.report()}`);
}
async function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') await new Promise(resolve => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.once('exit', resolve); killer.once('error', resolve);
  });
  else { child.kill('SIGTERM'); await completed(child); }
}
async function main() {
  console.log('Preparing isolated student E2E database…');
  const port = await freePort();
  const password = randomBytes(16).toString('hex');
  pg = new EmbeddedPostgres({ databaseDir: path.join(temp, 'pg'), port, user: 'e2e', password, persistent: true, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('student_full_e2e');
  const database = `postgresql://e2e:${password}@127.0.0.1:${port}/student_full_e2e`;
  const env = { DATABASE_URL: database, DATABASE_URL_UNPOOLED: database,
    CMS_JWT_SECRET: randomBytes(32).toString('hex'), CMS_SEED_EMAIL: 'student-e2e@example.invalid', CMS_SEED_PASSWORD: randomBytes(18).toString('hex'),
    CMS_SEED_NAME: 'Synthetic E2E Editor', STUDENT_FULL_E2E: '1', REAL_E2E_TEMP: temp, NEXT_TELEMETRY_DISABLED: '1',
    E2E_APP_KIND: 'student', E2E_BUILD_DIR: `.next-e2e-core-student-${randomBytes(6).toString('hex')}` };
  await command(path.join(student, 'node_modules/prisma/build/index.js'), ['db', 'push', '--schema', 'prisma/schema.prisma'], env);
  await command(path.join(student, 'node_modules/tsx/dist/cli.mjs'), ['prisma/seed.ts'], env);
  client = new Client({ connectionString: database }); await client.connect();
  const seeded = await client.query('SELECT (SELECT count(*) FROM units)::int AS units, (SELECT count(*) FROM planner_templates)::int AS planners, (SELECT count(*) FROM cms_users)::int AS users');
  if (seeded.rows[0].units < 30 || seeded.rows[0].planners < 2 || seeded.rows[0].users !== 1) throw new Error('Isolated seed did not finish successfully.');
  const serverScript = path.join(root, 'tests/e2e/helpers/serve-app.cjs');
  const cli = path.join(student, 'node_modules/@playwright/test/cli.js');
  const passthrough = process.argv.slice(2).filter(arg => !['--dev-only', '--production-only'].includes(arg));
  for (const phase of ['development', 'production']) {
    if (phase === 'production' && process.argv.includes('--dev-only')) continue;
    if (phase === 'development' && process.argv.includes('--production-only')) continue;
    const baseURL = `http://127.0.0.1:${await freePort()}`;
    const phaseEnv = { ...env, NODE_ENV: phase, E2E_APP_PORT: new URL(baseURL).port, STUDENT_E2E_BASE_URL: baseURL, STUDENT_E2E_PHASE: phase };
    const preloader = path.join(__dirname, 'next-config.cjs').replace(/\\/g, '/');
    const serverEnv = phase === 'production' ? { ...phaseEnv,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require "${preloader}"`].filter(Boolean).join(' ') } : phaseEnv;
    if (phase === 'production') {
      console.log('Building production app for CSP/hydration checks…');
      await command(serverScript, [], { ...serverEnv, E2E_APP_MODE: 'build' }, true);
    }
    const server = start(serverScript, [], { ...serverEnv, E2E_APP_MODE: phase });
    await ready(`${baseURL}/cms/login`, server);
    for (const file of declarations) file.generated = fs.readFileSync(file.path, 'utf8');
    console.log(`Running student ${phase} browser tests…`);
    const tests = start(cli, ['test', '--config=playwright.full.config.ts', ...passthrough], phaseEnv, true);
    if (await completed(tests) !== 0) { failed = true; console.error(server.report()); }
    await stop(server);
  }
}
async function cleanup() {
  for (const child of children.reverse()) await stop(child);
  if (client) await client.end();
  if (pg) await pg.stop();
  for (const file of declarations) {
    const current = fs.readFileSync(file.path, 'utf8');
    const withoutGeneratedRoute = text => text.replace(/^import ["'][^"']*types\/routes\.d\.ts["'];?\r?\n/m, '');
    const onlyGeneratedRouteChanged = file.path.endsWith('next-env.d.ts') && current.includes('.next-e2e-core-student-') && withoutGeneratedRoute(current) === withoutGeneratedRoute(file.original);
    if ((file.generated && current === file.generated) || onlyGeneratedRouteChanged) fs.writeFileSync(file.path, file.original);
  }
  console.log('Student E2E services stopped. Synthetic test workspace:', temp);
}
main().catch(error => { failed = true; console.error(error.message); }).finally(async () => { await cleanup(); process.exit(failed ? 1 : 0); });
