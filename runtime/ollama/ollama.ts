import { app } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const OLLAMA_PORT = 11434;
export const OLLAMA_URL = `http://127.0.0.1:${OLLAMA_PORT}`;

let ollamaProcess: ChildProcess | null = null;
let startedByUs = false;

function getBinaryPath(): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';

  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, `ollama${ext}`);
    return fs.existsSync(p) ? p : null;
  }

  // Dev: binary downloaded into resources/ollama/ via npm run download:ollama
  const devPath = path.resolve(__dirname, '..', '..', 'resources', 'ollama', `ollama${ext}`);
  return fs.existsSync(devPath) ? devPath : null;
}

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isRunning()) return true;
  }
  return false;
}

export async function startOllama(): Promise<void> {
  if (await isRunning()) {
    console.log('[Ollama] Already running on port', OLLAMA_PORT);
    return;
  }

  const binary = getBinaryPath();
  if (!binary) {
    console.log('[Ollama] Binary not found — LLM review will be unavailable.');
    console.log('[Ollama] Run: npm run download:ollama');
    return;
  }

  const modelsDir = path.join(app.getPath('userData'), 'ollama-models');
  fs.mkdirSync(modelsDir, { recursive: true });

  console.log('[Ollama] Starting from', binary);
  console.log('[Ollama] Models directory:', modelsDir);

  ollamaProcess = spawn(binary, ['serve'], {
    env: {
      ...process.env,
      OLLAMA_HOST: `127.0.0.1:${OLLAMA_PORT}`,
      OLLAMA_MODELS: modelsDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  startedByUs = true;

  ollamaProcess.stdout?.on('data', (d: Buffer) =>
    console.log('[Ollama]', d.toString().trim())
  );
  ollamaProcess.stderr?.on('data', (d: Buffer) =>
    console.log('[Ollama]', d.toString().trim())
  );
  ollamaProcess.on('error', (err) =>
    console.error('[Ollama] Process error:', err)
  );
  ollamaProcess.on('exit', (code) => {
    console.log('[Ollama] Exited with code', code);
    ollamaProcess = null;
  });

  const ready = await waitUntilReady();
  if (ready) {
    console.log('[Ollama] Ready on port', OLLAMA_PORT);
  } else {
    console.warn('[Ollama] Did not become ready within 15s — LLM review may be unavailable');
  }
}

export async function stopOllama(): Promise<void> {
  if (!ollamaProcess || !startedByUs) return;

  console.log('[Ollama] Stopping...');
  ollamaProcess.kill('SIGTERM');
  await new Promise<void>((r) => setTimeout(r, 1_000));
  ollamaProcess = null;
  console.log('[Ollama] Stopped');
}
