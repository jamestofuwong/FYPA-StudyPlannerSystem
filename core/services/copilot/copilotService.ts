import type { ChatMessage, RouteResult, Workflow } from './types';

export const OLLAMA_URL = 'http://127.0.0.1:11435';
export const COPILOT_MODEL = 'qwen2.5:3b';

function buildRoutingSystemPrompt(workflows: Workflow[]): string {
  const workflowDescriptions = workflows.map((w) => {
    const paramLines = w.params.length > 0
      ? w.params.map((p) =>
          `    - ${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}): ${p.description}`
        ).join('\n')
      : '    (no parameters needed)';
    return `- id: "${w.id}"\n  description: ${w.description}\n  params:\n${paramLines}`;
  }).join('\n\n');

  return `You are a routing assistant for a university study planner system.
Your only job is to read the user message and output a single JSON object. Output nothing else.

Available workflows:
${workflowDescriptions}

Output format when you can handle the request:
{"canHandle":true,"workflowId":"<id>","params":{},"missingParams":[]}

Output format when you cannot handle the request:
{"canHandle":false,"workflowId":null,"params":{},"missingParams":[]}

Rules:
- Set canHandle to false if no workflow matches the user intent.
- Only extract param values that are clearly stated in the user message.
- List required params absent from the message in missingParams.
- Omit optional params that are absent from params entirely.
- Never guess or invent param values.
- Output only raw JSON. No markdown fences, no explanation.`;
}

export async function routeAndExtract(
  messages: ChatMessage[],
  workflows: Workflow[]
): Promise<RouteResult> {
  const systemPrompt = buildRoutingSystemPrompt(workflows);

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: COPILOT_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const body = await response.json() as { message: { content: string } };
  let raw = body.message.content.trim();

  // Strip <think>...</think> blocks emitted by reasoning models
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // Strip markdown code fences
  raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return JSON.parse(raw) as RouteResult;
  } catch {
    return { canHandle: false, workflowId: null, params: {}, missingParams: [] };
  }
}
