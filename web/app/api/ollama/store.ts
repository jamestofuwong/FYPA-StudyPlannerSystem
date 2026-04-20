// Module-level singleton — shared across all API route invocations in the same
// Node.js process (works correctly in Electron where Next.js runs in-process).

export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = 'deepseek-r1:1.5b';

export type OllamaAvailability = 'unknown' | 'available' | 'unavailable';
export type ModelStatus = 'unknown' | 'ready' | 'pulling' | 'unavailable';

type OllamaState = {
  ollama: OllamaAvailability;
  model: ModelStatus;
  pullProgress: number; // 0–100
  pullError: string | null;
};

export const ollamaStore: OllamaState = {
  ollama: 'unknown',
  model: 'unknown',
  pullProgress: 0,
  pullError: null,
};
