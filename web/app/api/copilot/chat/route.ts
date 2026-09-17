import { NextResponse } from 'next/server';
import type { ChatMessage, WorkflowContext } from '../../../../core/services/copilot/types';
import { routeAndExtract } from '../../../../core/services/copilot/copilotService';
import { formatResponse } from '../../../../core/services/copilot/responseFormatter';
import { workflowRegistry, allWorkflows } from '../../../../core/services/copilot/workflowRegistry';
import { scraperStore } from '../../scraper/store';
import { ollamaStore } from '../../ollama/store';

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

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  // Build workflow context from stores (web layer injects this)
  const ctx: WorkflowContext = {
    currentStudent: scraperStore.result,
    scraperStatus: scraperStore.status,
    ollamaStatus: {
      ollama: ollamaStore.ollama,
      model: ollamaStore.model,
    },
  };

  // ── Phase 1: Route & Extract ──────────────────────────────────────────────
  let route;
  try {
    route = await routeAndExtract(messages, allWorkflows);
  } catch {
    return NextResponse.json({
      reply: 'The AI service is currently unavailable. Make sure Ollama is running and the model is ready.',
    });
  }

  if (!route.canHandle) {
    return NextResponse.json({ reply: CANNOT_HANDLE });
  }

  if (route.missingParams.length > 0) {
    return NextResponse.json({
      reply: `To do that, I need a bit more information. Could you provide: ${route.missingParams.join(', ')}?`,
    });
  }

  const workflow = workflowRegistry.get(route.workflowId!);
  if (!workflow) {
    return NextResponse.json({ reply: CANNOT_HANDLE });
  }

  // Safety net: re-validate params after routing
  const stillMissing = validateParams(workflow, route.params);
  if (stillMissing.length > 0) {
    return NextResponse.json({
      reply: `I need a bit more information to continue. Could you provide: ${stillMissing.join(', ')}?`,
    });
  }

  // ── Phase 2: Execute Workflow ─────────────────────────────────────────────
  const result = await workflow.execute(route.params, ctx);

  if (!result.ok) {
    return NextResponse.json({
      reply: `I wasn't able to complete that. ${result.error}`,
    });
  }

  // ── Phase 3: Format Response ──────────────────────────────────────────────
  let reply: string;
  try {
    reply = await formatResponse(messages, workflow, result);
  } catch {
    reply = `Here is what I found:\n\`\`\`\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
  }

  return NextResponse.json({ reply });
}
