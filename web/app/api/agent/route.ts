import { NextResponse } from 'next/server';
import { runAgentTurn } from '../../../../core/services/agent/agentService';
import { getAgentStore } from './store';
import { prisma } from '../../../../core/db/client';
import { OLLAMA_MODEL } from '../ollama/store';

async function getAgentModel(): Promise<string> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: 'agent_model' } });
    const model = row?.value ?? OLLAMA_MODEL;
    console.log(`[Agent] agent_model DB row: ${JSON.stringify(row)}`);
    console.log(`[Agent] resolved model: ${model} (OLLAMA_MODEL constant: ${OLLAMA_MODEL})`);
    return model;
  } catch (e) {
    console.error(`[Agent] getAgentModel error: ${e}`);
    return OLLAMA_MODEL;
  }
}

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const modelName = await getAgentModel();
    const store = getAgentStore();

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      ?? process.env.NEXT_DEV_SERVER_URL
      ?? 'http://localhost:3000';

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const { reply, updatedHistory } = await runAgentTurn(
            message,
            Array.isArray(history) ? history : store.history,
            { baseUrl, store, modelName },
            (event) => send(event),
          );

          store.history = updatedHistory;

          const pendingExport = store.pendingExport;
          if (pendingExport) store.pendingExport = null;

          send({ type: 'reply', reply, history: updatedHistory, pendingExport });
        } catch (err: any) {
          send({ type: 'error', error: err.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[Agent] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  const { resetAgentSession } = await import('./store');
  resetAgentSession();
  return NextResponse.json({ ok: true });
}
