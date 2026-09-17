import type { ChatMessage, Workflow, WorkflowResult } from './types';
import { OLLAMA_URL, COPILOT_MODEL } from './copilotService';

export async function formatResponse(
  messages: ChatMessage[],
  workflow: Workflow,
  result: WorkflowResult
): Promise<string> {
  const data = result.ok ? result.data : { error: (result as { ok: false; error: string }).error };

  const systemPrompt = `You are a helpful assistant for a university study planner system.
The system ran the "${workflow.id}" workflow to answer the user's question.
Write a clear, concise, plain-English response based only on the data below.
Do not use JSON or code blocks in your reply.

Data:
${JSON.stringify(data, null, 2)}`;

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
  let text = body.message.content.trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return text;
}
