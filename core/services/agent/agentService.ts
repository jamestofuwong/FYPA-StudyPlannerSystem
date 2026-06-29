import { AGENT_TOOLS, TOOL_EXECUTORS } from './agentTools';
import { buildSystemPrompt } from './systemPrompt';
import type { AgentMessage, AgentSessionStore } from './types';

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const MAX_ITERATIONS = 6;
const MAX_HISTORY_TURNS = 6;

export function trimHistory(history: AgentMessage[]): AgentMessage[] {
  return history.slice(-MAX_HISTORY_TURNS);
}

export async function runAgentTurn(
  userMessage: string,
  history: AgentMessage[],
  ctx: { baseUrl: string; store: AgentSessionStore; modelName: string },
): Promise<{ reply: string; updatedHistory: AgentMessage[] }> {
  const messages: AgentMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({ currentDate: new Date().toDateString(), loadedStudentId: ctx.store.loadedStudentId }),
    },
    ...trimHistory(history),
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    let response: Response;
    console.log(`[Agent] iteration ${iterations}: sending request to Ollama with model="${ctx.modelName}"`);
    try {
      response = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ctx.modelName,
          messages,
          tools: AGENT_TOOLS,
          stream: false,
          options: { temperature: 0.1 },
        }),
      });
    } catch (e: any) {
      return {
        reply: `Ollama is not available: ${e.message}. Ensure Ollama is running with model ${ctx.modelName} downloaded.`,
        updatedHistory: trimHistory([...history, { role: 'user', content: userMessage }]),
      };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return {
        reply: `Ollama returned an error: ${errText}`,
        updatedHistory: trimHistory([...history, { role: 'user', content: userMessage }]),
      };
    }

    const data = await response.json();
    const assistantMessage: AgentMessage = data.message;
    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      // Model is done — return the final answer
      const historyWithoutSystem = messages.slice(1); // drop system prompt
      return {
        reply: assistantMessage.content ?? '',
        updatedHistory: trimHistory(historyWithoutSystem),
      };
    }

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      const executor = TOOL_EXECUTORS[name];
      let toolResult: unknown;
      if (!executor) {
        toolResult = { error: `Unknown tool: ${name}` };
      } else {
        try {
          toolResult = await executor(
            typeof args === 'string' ? JSON.parse(args) : (args ?? {}),
            { baseUrl: ctx.baseUrl, store: ctx.store },
          );
        } catch (e: any) {
          toolResult = { error: e.message };
        }
      }
      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
      });
    }
  }

  return {
    reply: 'I was unable to complete this task within the allowed steps. Please try rephrasing your request or break it into smaller steps.',
    updatedHistory: trimHistory(messages.slice(1)),
  };
}
