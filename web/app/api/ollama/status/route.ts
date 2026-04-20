import { NextResponse } from 'next/server';
import { ollamaStore, OLLAMA_URL, OLLAMA_MODEL } from '../store';

export const runtime = 'nodejs';

export async function GET() {
  // Check if Ollama server is reachable
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('non-ok');

    ollamaStore.ollama = 'available';

    // Only check model status if not already pulling
    if (ollamaStore.model !== 'pulling') {
      const data = await res.json() as { models: Array<{ name: string }> };
      const modelReady = data.models.some((m) => m.name.startsWith(OLLAMA_MODEL));
      ollamaStore.model = modelReady ? 'ready' : 'unavailable';
    }
  } catch {
    ollamaStore.ollama = 'unavailable';
    if (ollamaStore.model !== 'pulling') {
      ollamaStore.model = 'unavailable';
    }
  }

  return NextResponse.json({
    ollama: ollamaStore.ollama,
    model: ollamaStore.model,
    pullProgress: ollamaStore.pullProgress,
    pullError: ollamaStore.pullError,
  });
}
