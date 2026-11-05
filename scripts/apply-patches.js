// Applies the patches in patches/ for the packages that are installed on this computer.
//
// patch-package fails (and on CI exits with an error) when a patch is for a package that is not installed. The patch for
// @embedded-postgres/windows-x64 is for a Windows-only optional package, so on macOS and Linux it is never installed.
// This script copies only the patches that apply to a temporary folder and runs patch-package on that folder.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const patchDir = path.join(root, 'patches');
if (!fs.existsSync(patchDir)) process.exit(0);

// "@scope+name+1.2.3.patch" or "name+1.2.3.patch", and nested "a++b+1.0.0.patch"
function packagePath(file) {
  const base = file.replace(/\.patch$/, '').replace(/\+[^+]+$/, '');   // drop the version
  return base.split('++')[0].replace('+', '/');
}

// patch-package accepts only a patch folder that is relative to the project, so the copy lives inside the project.
const tmpName = `.patches-applicable-${process.pid}`;
const tmp = path.join(root, tmpName);
fs.mkdirSync(tmp, { recursive: true });
let applied = 0;
for (const file of fs.readdirSync(patchDir).filter((f) => f.endsWith('.patch'))) {
  const pkg = packagePath(file);
  if (fs.existsSync(path.join(root, 'node_modules', pkg))) {
    fs.copyFileSync(path.join(patchDir, file), path.join(tmp, file));
    applied++;
  } else {
    console.log(`apply-patches: skip ${file} (${pkg} is not installed on this platform)`);
  }
}

let status = 0;
if (applied > 0) {
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'patch-package.cmd' : 'patch-package');
  status = spawnSync(bin, ['--patch-dir', tmpName], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
}
fs.rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------------------------------------------------------------
// The embedded PostgreSQL programs in a packaged app.
//
// Each @embedded-postgres/<platform> package finds its programs (initdb, pg_ctl, postgres) from import.meta.url. In the
// packaged app (asar: true) that path is inside app.asar, where the operating system cannot run a program: the database
// fails with "spawn ENOTDIR" and the whole app has no data. electron-builder unpacks the programs to
// app.asar.unpacked, so the package must look there first.
//
// This rewrites dist/index.js of every installed platform package (macOS, Linux, Windows) in the same way. It does not
// need a patch file for each platform, and it can run more than once.
// ---------------------------------------------------------------------------------------------------------------------
const pgScope = path.join(root, 'node_modules', '@embedded-postgres');
if (fs.existsSync(pgScope)) {
  for (const pkg of fs.readdirSync(pgScope)) {
    const file = path.join(pgScope, pkg, 'dist', 'index.js');
    if (!fs.existsSync(file)) continue;
    const current = fs.readFileSync(file, 'utf8');
    if (current.includes('app.asar.unpacked')) continue;          // already done (for example by the Windows patch)
    const ext = pkg.startsWith('windows') ? '.exe' : '';
    fs.writeFileSync(file, `import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
// Written by scripts/apply-patches.js. In a packaged Electron app (asar: true), import.meta.url is inside app.asar, where
// the operating system cannot run a program. Look in app.asar.unpacked first.
function resolvedBinDir() {
  var rp = (typeof process !== 'undefined') && process.resourcesPath;
  if (rp) {
    var unpacked = path.join(rp, 'app.asar.unpacked', 'node_modules', '@embedded-postgres', '${pkg}', 'native', 'bin');
    if (existsSync(unpacked)) return unpacked;
  }
  var __dirname_fallback = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname_fallback, '..', 'native', 'bin');
}
var _binDir = resolvedBinDir();
export const pg_ctl = path.join(_binDir, 'pg_ctl${ext}');
export const initdb = path.join(_binDir, 'initdb${ext}');
export const postgres = path.join(_binDir, 'postgres${ext}');
`);
    console.log(`apply-patches: ${pkg} now looks in app.asar.unpacked first`);
  }
}

process.exit(status);
