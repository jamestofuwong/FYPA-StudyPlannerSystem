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
process.exit(status);
