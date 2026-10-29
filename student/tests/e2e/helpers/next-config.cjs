// Preloaded into production build workers so they share the test-only config.
// No files under app/, lib/, core/, or next.config.ts are modified.
const fs = require('node:fs');
const path = require('node:path');
if (process.env.E2E_APP_KIND === 'student' && process.env.E2E_BUILD_DIR && process.env.REAL_E2E_TEMP) {
  const root = path.resolve(__dirname, '../../../..');
  const dir = path.join(root, 'student');
  require(path.join(root, 'node_modules/tsx/dist/cjs/index.cjs'));
  const config = require(path.join(dir, 'next.config.ts')).default;
  const configPath = path.join(process.env.REAL_E2E_TEMP, 'student-tsconfig.json');
  if (!fs.existsSync(configPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
    tsconfig.compilerOptions.baseUrl = dir;
    tsconfig.include = tsconfig.include.map(p => path.resolve(dir, p));
    tsconfig.exclude = tsconfig.exclude.map(p => path.resolve(dir, p));
    fs.writeFileSync(configPath, JSON.stringify(tsconfig, null, 2));
  }
  const overrides = { ...config, distDir: process.env.E2E_BUILD_DIR,
    experimental: { ...config.experimental, cpus: 2 },
    typescript: { ...config.typescript, tsconfigPath: path.relative(dir, configPath) } };
  const loaderPath = require.resolve(path.join(dir, 'node_modules/next/dist/server/config'));
  const originalLoader = require(loaderPath);
  require.cache[loaderPath].exports = { ...originalLoader, __esModule: true,
    default: (phase, appDir, options) => originalLoader.default(phase, appDir, { ...options, customConfig: overrides }) };
}
