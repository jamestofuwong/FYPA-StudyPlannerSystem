// Module-level singleton — shared across all API route invocations in the same
// Node.js process (works correctly in Electron where Next.js runs in-process).

export const OLLAMA_URL = 'http://127.0.0.1:11434';
// llama3.2:3b is required — it supports Ollama's tools/function-calling API.
// deepseek-r1 and similar reasoning models do NOT support tools and return a 400.
export const OLLAMA_MODEL = 'llama3.2:3b';

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
