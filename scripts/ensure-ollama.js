#!/usr/bin/env node
/**
 * Checks if the Ollama binary exists in resources/ollama/.
 * If missing, downloads it via download-ollama.js.
 * Used as a pre-step in npm run dev.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ext = process.platform === 'win32' ? '.exe' : '';
const binary = path.join(__dirname, '..', 'resources', 'ollama', `ollama${ext}`);

if (fs.existsSync(binary)) {
  console.log('[ensure-ollama] Ollama binary found, skipping download.');
  process.exit(0);
}

console.log('[ensure-ollama] Ollama binary not found, attempting download...');
try {
  execSync(`node "${path.join(__dirname, 'download-ollama.js')}"`, { stdio: 'inherit' });
} catch (err) {
  console.warn('[ensure-ollama] Download failed — AI Review will be unavailable until the binary is present.');
  console.warn('[ensure-ollama] Run "npm run download:ollama" manually when network access is available,');
  console.warn('[ensure-ollama] or copy the Ollama binary to resources/ollama/ollama' + (process.platform === 'win32' ? '.exe' : '') + ' manually.');
  // Do not exit with error — the app can still run without Ollama.
}
