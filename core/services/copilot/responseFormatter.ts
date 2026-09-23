import type { ChatMessage, Workflow, WorkflowResult } from './types';
import { OLLAMA_URL, COPILOT_MODEL } from './copilotService';

export async function* streamResponse(
  messages: ChatMessage[],
  workflow: Workflow,
  result: WorkflowResult
): AsyncGenerator<string> {
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
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body from Ollama');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let thinkBuffer = '';
  let inThink = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const token = chunk.message?.content ?? '';
        if (!token) continue;

        // Strip <think>…</think> spans that span multiple tokens
        if (inThink) {
          thinkBuffer += token;
          const end = thinkBuffer.indexOf('</think>');
          if (end !== -1) {
            thinkBuffer = '';
            inThink = false;
          }
          continue;
        }

        const combined = token;
        const startIdx = combined.indexOf('<think>');
        if (startIdx !== -1) {
          const before = combined.slice(0, startIdx);
          if (before) yield before;
          thinkBuffer = combined.slice(startIdx + 7);
          inThink = true;
          const end = thinkBuffer.indexOf('</think>');
          if (end !== -1) {
            thinkBuffer = '';
            inThink = false;
          }
          continue;
        }

        yield token;
      } catch {
        // Partial JSON line — ignore
      }
    }
  }
}
