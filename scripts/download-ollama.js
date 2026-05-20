#!/usr/bin/env node
/**
 * Downloads the Ollama binary for the current platform into resources/ollama/.
 * Run before packaging:
 *   npm run download:ollama
 *
 * Assets used per platform:
 *   macOS   → ollama-darwin.tgz     (extracted: bin/ollama or ollama)
 *   Windows → ollama-windows-amd64.zip (extracted: ollama.exe)
 *   Linux   → ollama-linux-amd64.tar.zst (requires zstd on PATH)
 */

'use strict';

const https = require('https'); // used for JSON API calls only
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'resources', 'ollama');
const RELEASES_API = 'https://api.github.com/repos/ollama/ollama/releases/latest';

const ASSET_MAP = {
  darwin: 'ollama-darwin.tgz',
  win32:  'ollama-windows-amd64.zip',
  linux:  'ollama-linux-amd64.tar.zst',
};

const BINARY_NAME = process.platform === 'win32' ? 'ollama.exe' : 'ollama';

fs.mkdirSync(OUT_DIR, { recursive: true });

function httpsGetJson(url) {
  const headers = { 'User-Agent': 'study-planner-build-script' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(httpsGetJson(res.headers.location));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const json = JSON.parse(body);
        if (res.statusCode !== 200) {
          return reject(new Error(
            `GitHub API returned HTTP ${res.statusCode}: ${json.message || body}`
          ));
        }
        resolve(json);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  console.log(`[download-ollama] Downloading to ${dest}...`);
  execSync(`curl -L --progress-bar -o "${dest}" "${url}"`, { stdio: 'inherit' });
}

function extractTgz(archive, destDir) {
  execSync(`tar -xzf "${archive}" -C "${destDir}"`, { stdio: 'inherit' });
}

function extractZip(archive, destDir) {
  if (process.platform === 'win32') {
    execSync(
      `powershell -Command "Expand-Archive -Force -Path '${archive}' -DestinationPath '${destDir}'"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`unzip -o "${archive}" -d "${destDir}"`, { stdio: 'inherit' });
  }
}

function extractZst(archive, destDir) {
  execSync(`tar --use-compress-program=zstd -xf "${archive}" -C "${destDir}"`, { stdio: 'inherit' });
}

function findBinary(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findBinary(full, name);
      if (found) return found;
    } else if (e.name === name) {
      return full;
    }
  }
  return null;
}

async function main() {
  const platform = process.platform;
  const assetName = ASSET_MAP[platform];

  if (!assetName) {
    console.error(`[download-ollama] Unsupported platform: ${platform}`);
    process.exit(1);
  }

  console.log(`[download-ollama] Fetching latest Ollama release info...`);
  const release = await httpsGetJson(RELEASES_API);
  console.log(`[download-ollama] Latest release: ${release.tag_name}`);

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    console.error(`[download-ollama] Asset "${assetName}" not found in release ${release.tag_name}`);
    process.exit(1);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollama-download-'));
  const archivePath = path.join(tmpDir, assetName);

  try {
    console.log(`[download-ollama] Asset: ${assetName} (${release.tag_name})`);
    downloadFile(asset.browser_download_url, archivePath);

    console.log(`[download-ollama] Extracting...`);
    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir);

    if (assetName.endsWith('.tgz')) {
      extractTgz(archivePath, extractDir);
    } else if (assetName.endsWith('.zip')) {
      extractZip(archivePath, extractDir);
    } else if (assetName.endsWith('.tar.zst')) {
      extractZst(archivePath, extractDir);
    }

    const binary = findBinary(extractDir, BINARY_NAME);
    if (!binary) {
      console.error(`[download-ollama] Could not find "${BINARY_NAME}" in extracted archive.`);
      process.exit(1);
    }

    const dest = path.join(OUT_DIR, BINARY_NAME);
    fs.copyFileSync(binary, dest);

    if (platform !== 'win32') {
      fs.chmodSync(dest, 0o755);
    }

    const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
    console.log(`\n[download-ollama] Ollama binary ready: ${dest} (${sizeMb} MB)`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[download-ollama] Failed:', err.message);
  process.exit(1);
});
