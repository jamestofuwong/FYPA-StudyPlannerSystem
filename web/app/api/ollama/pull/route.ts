import { NextResponse } from 'next/server';
import { ollamaStore, OLLAMA_URL, OLLAMA_MODEL } from '../store';

export const runtime = 'nodejs';

async function runPull(): Promise<void> {
  ollamaStore.model = 'pulling';
  ollamaStore.pullProgress = 0;
  ollamaStore.pullError = null;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: OLLAMA_MODEL, stream: true }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama pull returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as {
            status?: string;
            completed?: number;
            total?: number;
          };
          if (chunk.total && chunk.completed) {
            ollamaStore.pullProgress = Math.round((chunk.completed / chunk.total) * 100);
          }
        } catch {
          // Partial JSON line — ignore
        }
      }
    }

    ollamaStore.model = 'ready';
    ollamaStore.pullProgress = 100;
  } catch (err) {
    ollamaStore.model = 'unavailable';
    ollamaStore.pullError = err instanceof Error ? err.message : 'Pull failed';
    console.error('[Ollama] Pull error:', ollamaStore.pullError);
  }
}

export async function POST() {
  if (ollamaStore.ollama === 'unavailable') {
    return NextResponse.json({ error: 'Ollama is not running' }, { status: 503 });
  }
  if (ollamaStore.model === 'pulling') {
    return NextResponse.json({ started: false, message: 'Pull already in progress' });
  }
  if (ollamaStore.model === 'ready') {
    return NextResponse.json({ started: false, message: 'Model already ready' });
  }

  // Fire-and-forget — progress tracked in ollamaStore
  runPull().catch(console.error);

  return NextResponse.json({ started: true, message: `Pulling ${OLLAMA_MODEL}...` });
}
