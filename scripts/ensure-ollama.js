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

console.log('[ensure-ollama] Ollama binary not found, downloading...');
execSync(`node "${path.join(__dirname, 'download-ollama.js')}"`, { stdio: 'inherit' });
