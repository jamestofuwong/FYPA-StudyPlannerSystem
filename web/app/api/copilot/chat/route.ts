import type { ChatMessage, WorkflowContext } from '../../../../../core/services/copilot/types';
import { routeAndExtract } from '../../../../../core/services/copilot/copilotService';
import { streamResponse } from '../../../../../core/services/copilot/responseFormatter';
import { workflowRegistry, allWorkflows } from '../../../../../core/services/copilot/workflowRegistry';
import { ollamaStore } from '../../ollama/store';
import { getStatus } from '../../../../../core/services/portal/portalSessionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANNOT_HANDLE =
  "Sorry, I'm not able to help with that. I can answer questions about the currently loaded student's major, graduation status, and completed units, check system status, and list available study planners.";

function validateParams(
  workflow: ReturnType<typeof workflowRegistry.get>,
  params: Record<string, unknown>
): string[] {
  if (!workflow) return [];
  return workflow.params
    .filter((p) => p.required && !(p.name in params))
    .map((p) => p.name);
}

function workflowLabel(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ type: 'reply', content: 'Invalid JSON body' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ type: 'reply', content: 'messages array is required' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  const ctx: WorkflowContext = {
    ollamaStatus: {
      ollama: ollamaStore.ollama,
      model: ollamaStore.model,
    },
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      }

      try {
        // ── Phase 1: Route & Extract ────────────────────────────────────────
        emit({ type: 'status', message: 'Thinking…' });

        // If the model is cold (not yet loaded in memory), the first Ollama
        // call can stall for several seconds. Emit a dedicated message after
        // 3 s so the user knows the app hasn't frozen.
        const coldStartTimer = setTimeout(
          () => emit({ type: 'status', message: 'Warming up AI model…' }),
          3000,
        );

        let route;
        try {
          route = await routeAndExtract(messages, allWorkflows);
        } catch (err) {
          clearTimeout(coldStartTimer);
          console.error('[Copilot] routeAndExtract failed:', err);
          emit({ type: 'reply', content: 'The AI service is currently unavailable. Make sure Ollama is running and the model is ready.' });
          controller.close();
          return;
        }
        clearTimeout(coldStartTimer);

        if (!route.canHandle) {
          emit({ type: 'reply', content: CANNOT_HANDLE });
          controller.close();
          return;
        }

        if (route.missingParams.length > 0) {
          emit({ type: 'reply', content: `To do that, I need a bit more information. Could you provide: ${route.missingParams.join(', ')}?` });
          controller.close();
          return;
        }

        const workflow = workflowRegistry.get(route.workflowId!);
        if (!workflow) {
          emit({ type: 'reply', content: CANNOT_HANDLE });
          controller.close();
          return;
        }

        const stillMissing = validateParams(workflow, route.params);
        if (stillMissing.length > 0) {
          emit({ type: 'reply', content: `I need a bit more information to continue. Could you provide: ${stillMissing.join(', ')}?` });
          controller.close();
          return;
        }

        // ── Portal session check ────────────────────────────────────────────
        // Workflows that include a studentId param require live portal data.
        const needsPortal = workflow.params.some((p) => p.name === 'studentId');
        if (needsPortal && getStatus().sessionStatus !== 'logged-in') {
          emit({ type: 'reply', content: 'This requires access to the student portal. Please log in to the portal first, then try again.' });
          controller.close();
          return;
        }

        // ── Phase 2: Execute Workflow ───────────────────────────────────────
        emit({ type: 'status', message: `Calling ${workflowLabel(route.workflowId!)}…` });

        const result = await workflow.execute(route.params, ctx);

        if (!result.ok) {
          console.warn(`[Copilot] Workflow "${route.workflowId}" returned error:`, result.error);
          emit({ type: 'reply', content: `I wasn't able to complete that. ${result.error}` });
          controller.close();
          return;
        }

        // ── Phase 3: Stream Response ────────────────────────────────────────
        emit({ type: 'status', message: 'Generating response…' });

        try {
          let full = '';
          for await (const token of streamResponse(messages, workflow, result)) {
            full += token;
            emit({ type: 'token', content: token });
          }
          emit({ type: 'reply', content: full, workflowId: route.workflowId });
        } catch (err) {
          console.error(`[Copilot] streamResponse failed for workflow "${route.workflowId}":`, err);
          emit({ type: 'reply', content: `Here is what I found:\n\`\`\`\n${JSON.stringify(result.data, null, 2)}\n\`\`\``, workflowId: route.workflowId });
        }
        controller.close();
      } catch (err) {
        console.error('[Copilot] Unhandled error in chat stream:', err);
        emit({ type: 'reply', content: 'An unexpected error occurred. Please try again.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
