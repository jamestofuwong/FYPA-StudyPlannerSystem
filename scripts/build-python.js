#!/usr/bin/env node
/**
 * Compiles plannerStructureService.py into a standalone binary using PyInstaller.
 * The binary is written to resources/python/ and bundled into the Electron app
 * via extraResources in the electron-builder config (package.json).
 *
 * Run before packaging:
 *   npm run build:python
 *
 * The PYTHON_EXECUTABLE env var overrides the Python interpreter used.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'core', 'services', 'plannerImport');
const ENTRY = path.join(SRC_DIR, 'plannerStructureService.py');
const DIST_DIR = path.join(ROOT, 'resources', 'python');
const WORK_DIR = path.join(ROOT, 'build', 'pyinstaller');
const BINARY_NAME = 'plannerStructureService';

const isWin = process.platform === 'win32';

// Load PYTHON_EXECUTABLE from web/.env if not already set in the environment
if (!process.env.PYTHON_EXECUTABLE) {
  const envPath = path.join(ROOT, 'web', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^PYTHON_EXECUTABLE\s*=\s*["']?(.+?)["']?\s*$/m);
    if (match) process.env.PYTHON_EXECUTABLE = match[1].trim();
  }
}

const python = process.env.PYTHON_EXECUTABLE?.trim() || (isWin ? 'python' : 'python3');

// Ensure output dirs exist
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

// Verify PyInstaller is available
try {
  execSync(`"${python}" -m PyInstaller --version`, { stdio: 'pipe' });
} catch {
  console.error(
    `[build-python] PyInstaller not found for interpreter: ${python}\n` +
    `  Install it with: pip install pyinstaller\n` +
    `  Or set PYTHON_EXECUTABLE to point to the correct interpreter.`
  );
  process.exit(1);
}

// PyInstaller bundles plannerPdfExtractor automatically because it is a
// local import in the same directory. --paths ensures it is on sys.path.
const args = [
  `"${python}"`, '-m', 'PyInstaller',
  '--onefile',
  '--name', BINARY_NAME,
  '--distpath', `"${DIST_DIR}"`,
  '--workpath', `"${WORK_DIR}"`,
  '--specpath', `"${WORK_DIR}"`,
  '--paths', `"${SRC_DIR}"`,
  `"${ENTRY}"`,
];

console.log(`[build-python] Compiling Python binary for ${process.platform}...`);
console.log(`[build-python] ${args.join(' ')}\n`);

try {
  execSync(args.join(' '), { stdio: 'inherit', cwd: SRC_DIR });
} catch (err) {
  console.error('[build-python] PyInstaller failed.');
  process.exit(1);
}

const ext = isWin ? '.exe' : '';
const output = path.join(DIST_DIR, `${BINARY_NAME}${ext}`);

if (fs.existsSync(output)) {
  const sizeMb = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
  console.log(`\n[build-python] Binary ready: ${output} (${sizeMb} MB)`);
} else {
  console.error(`[build-python] Binary not found at expected path: ${output}`);
  process.exit(1);
}
