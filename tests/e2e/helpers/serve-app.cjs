// Test-only Next server configuration: application config files stay untouched.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../../..');
async function main() {
  const kind = process.env.E2E_APP_KIND;
  const dir = path.join(root, kind === 'desktop' ? 'web' : 'student');
  let config;
  if (kind === 'desktop') config = (await import(pathToFileURL(path.join(dir, 'next.config.mjs')).href)).default;
  else {
    require('tsx/cjs');
    config = require(path.join(dir, 'next.config.ts')).default;
  }
  const tsconfig = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
  tsconfig.compilerOptions.baseUrl = dir;
  tsconfig.include = tsconfig.include.map(p => path.resolve(dir, p));
  tsconfig.exclude = tsconfig.exclude.map(p => path.resolve(dir, p));
  const configPath = path.join(process.env.REAL_E2E_TEMP, `${kind}-tsconfig.json`);
  fs.writeFileSync(configPath, JSON.stringify(tsconfig, null, 2));
  const nextDir = path.join(root, kind === 'desktop' ? 'node_modules/next' : 'student/node_modules/next');
  const overrides = { ...config, distDir: process.env.E2E_BUILD_DIR,
    typescript: { ...config.typescript, tsconfigPath: path.relative(dir, configPath) } };
  // Next 16's custom dev router reloads config without forwarding options.conf.
  // Override configuration loading only inside this test-owned process so every
  // dev worker uses the isolated build directory. All app handlers remain real.
  const loaderPath = require.resolve(path.join(nextDir, 'dist/server/config'));
  const originalLoader = require(loaderPath);
  require.cache[loaderPath].exports = { ...originalLoader, __esModule: true,
    default: (phase, appDir, options) => originalLoader.default(phase, appDir, { ...options, customConfig: overrides }) };
  const next = require(nextDir);
  delete process.env.TURBOPACK;
  if (process.env.E2E_APP_MODE === 'build') {
    const build = require(path.join(nextDir, 'dist/build')).default;
    const { Bundler } = require(path.join(nextDir, 'dist/lib/bundler'));
    await build(dir, false, false, false, false, false, false, Bundler.Webpack);
    return;
  }
  const app = next({ dev: process.env.E2E_APP_MODE !== 'production', webpack: true, dir, port: Number(process.env.E2E_APP_PORT), conf: overrides });
  await app.prepare();
  const handler = app.getRequestHandler();
  const server = http.createServer((req, res) => handler(req, res));
  server.listen(Number(process.env.E2E_APP_PORT), '127.0.0.1');
  process.on('SIGTERM', async () => { server.close(); await app.close(); process.exit(0); });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
