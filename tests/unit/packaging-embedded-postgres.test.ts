/**
 * The packaged app must be able to start its database.
 *
 * In a packaged app (asar: true) the embedded PostgreSQL programs are unpacked to app.asar.unpacked, and the package must
 * look there first. If it does not, the database fails with "spawn ENOTDIR" and the app has no data. This happened on macOS
 * (only the Windows package was patched). `npm install` runs scripts/apply-patches.js, which fixes every installed package.
 */
import fs from 'node:fs';
import path from 'node:path';

const scope = path.resolve(__dirname, '../../node_modules/@embedded-postgres');
const packages = fs.existsSync(scope) ? fs.readdirSync(scope).filter((p) => fs.existsSync(path.join(scope, p, 'dist', 'index.js'))) : [];

describe('embedded PostgreSQL in a packaged app', () => {
  test('a platform package is installed', () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  test.each(packages)('%s looks in app.asar.unpacked first', (pkg) => {
    const source = fs.readFileSync(path.join(scope, pkg, 'dist', 'index.js'), 'utf8');
    expect(source).toContain('app.asar.unpacked');
    expect(source).toContain('process.resourcesPath');
  });

  test('electron-builder unpacks these packages from the archive', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    expect(pkg.build.asar).toBe(true);
    expect(pkg.build.asarUnpack).toEqual(expect.arrayContaining(['node_modules/embedded-postgres/**', 'node_modules/@embedded-postgres/**']));
  });

  test('the release workflow applies the patches on every platform', () => {
    const wf = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release-local.yml'), 'utf8');
    const step = wf.slice(wf.indexOf('name: Apply patches'));
    expect(step.split('\n').slice(0, 3).join('\n')).toContain('node scripts/apply-patches.js');
    expect(step.split('\n').slice(0, 3).join('\n')).not.toMatch(/if:\s*matrix\.platform/);
  });
});

/**
 * The first start of the packaged app runs `prisma migrate deploy` in a separate Node process. That process cannot read
 * inside app.asar, so the Prisma command-line tool, every package that it needs, and core/db must be unpacked. If one
 * package is missing, the first start fails ("Cannot find module 'effect'") and a new installation has no tables.
 */
describe('first-start migration in a packaged app', () => {
  const root = path.resolve(__dirname, '../..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const unpack: string[] = pkg.build.asarUnpack;
  // a package is unpacked when a pattern names it, in the project or at any depth (the packager moves nested packages)
  const covered = (name: string) => unpack.some((p) => p === `node_modules/${name}/**` || p === `**/node_modules/${name}/**`);

  function closure(): string[] {
    const seen = new Set<string>();
    const find = (from: string, name: string): string | null => {
      for (let d = from; ; d = path.dirname(d)) {
        const p = path.join(d, 'node_modules', name);
        if (fs.existsSync(path.join(p, 'package.json'))) return p;
        if (path.dirname(d) === d) return null;
      }
    };
    const walk = (name: string, from: string) => {
      const dir = find(from, name);
      if (!dir) return;
      const real = fs.realpathSync(dir);
      if (seen.has(real)) return;
      seen.add(real);
      const pj = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8'));
      for (const d of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) walk(d, real);
    };
    walk('prisma', root);
    return [...seen].map((d) => JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name as string);
  }

  test('prisma is a runtime dependency, so that it is packaged', () => {
    expect(pkg.dependencies.prisma).toBeDefined();
    expect(pkg.devDependencies?.prisma).toBeUndefined();
  });

  test('core/db (the schema and the migrations) is unpacked', () => {
    expect(unpack).toContain('core/db/**');
  });

  test('the Prisma command-line tool and everything it needs are unpacked', () => {
    // @prisma/engines and the other scoped packages are covered by their scope: @prisma/**
    const missing = closure().filter((name) => !covered(name) && !covered(name.split('/')[0]));
    expect(missing).toEqual([]);
  });
});
