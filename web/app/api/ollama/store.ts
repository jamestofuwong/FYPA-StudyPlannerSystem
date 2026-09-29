// Module-level singleton — shared across all API route invocations in the same
// Node.js process (works correctly in Electron where Next.js runs in-process).
import { OLLAMA_URL as _OLLAMA_URL, COPILOT_MODEL } from '../../../../core/config/ollama';

export const OLLAMA_URL = _OLLAMA_URL;
export const OLLAMA_MODEL = COPILOT_MODEL;

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
