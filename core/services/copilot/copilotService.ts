import type { ChatMessage, RouteResult, Workflow } from './types';
import { OLLAMA_URL, COPILOT_MODEL } from '../../config/ollama';

export { OLLAMA_URL, COPILOT_MODEL };

// ---------------------------------------------------------------------------
// Pre-filter: score workflows against user message and keep top N candidates.
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'what', 'which', 'who', 'how',
  'for', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'do', 'does', 'did',
  'has', 'have', 'been', 'can', 'could', 'would', 'their', 'they', 'this',
  'that', 'with', 'from', 'by', 'me', 'my', 'its', 'it', 'all', 'met',
]);

/** Minimal stemmer: strip common suffixes so plurals and verb forms match. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);   // switching → switch
  if (word.length > 4 && word.endsWith('es'))  return word.slice(0, -2);   // switches → switch, planners → planners (too short)
  if (word.length > 3 && word.endsWith('s'))   return word.slice(0, -1);   // planners → planner, units → unit
  return word;
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map(stem);
}

function preFilterWorkflows(userMessage: string, workflows: Workflow[], topN = 12): Workflow[] {
  const msgTokens = new Set(tokenise(userMessage));

  const scored = workflows.map((w) => {
    // Deduplicate the bag so a repeated word can't inflate the score
    const bag = new Set([
      ...tokenise(w.id),
      ...tokenise(w.description),
      ...w.params.flatMap((p) => tokenise(p.name)),
    ]);
    let score = 0;
    for (const token of bag) {
      if (msgTokens.has(token)) score++;
    }
    return { workflow: w, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((s) => s.score > 0);
  const candidates = matched.length > 0 ? matched : scored;
  return candidates.slice(0, topN).map((s) => s.workflow);
}

// ---------------------------------------------------------------------------
// Phase 1: Routing — ask the model for only the workflow ID (no JSON needed).
// ---------------------------------------------------------------------------
function buildRoutingPrompt(userMessage: string, workflows: Workflow[]): string {
  const lines = workflows.map((w) => `${w.id}: ${w.description}`).join('\n');
  return `You are a routing assistant for a university study planner app.
Read the user message and output ONLY the single workflow ID that best matches. No other text.
If nothing matches at all, output: none

Workflows:
${lines}

User message: "${userMessage}"
Workflow ID:`;
}

async function callOllama(prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: COPILOT_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 40 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const body = await response.json() as { response: string };
  return body.response.trim();
}

// ---------------------------------------------------------------------------
// Phase 2: Param extraction via regex — no extra LLM call for common types.
// ---------------------------------------------------------------------------
function extractParamsRegex(message: string, workflow: Workflow): {
  params: Record<string, unknown>;
  missingParams: string[];
} {
  const params: Record<string, unknown> = {};

  for (const p of workflow.params) {
    switch (p.name) {
      case 'studentId': {
        // Student IDs are typically 9-10 digit numbers
        const m = message.match(/\b\d{7,10}\b/);
        if (m) params.studentId = m[0];
        break;
      }
      case 'unitCode': {
        const m = message.match(/\b([A-Z]{2,4}\d{4,5})\b/i);
        if (m) params.unitCode = m[1].toUpperCase();
        break;
      }
      case 'plannerId': {
        const m = message.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
        if (m) params.plannerId = m[1];
        break;
      }
      case 'plannerId1': {
        const all = [...message.matchAll(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi)];
        if (all[0]) params.plannerId1 = all[0][1];
        break;
      }
      case 'plannerId2': {
        const all = [...message.matchAll(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi)];
        if (all[1]) params.plannerId2 = all[1][1];
        break;
      }
      case 'newPlannerId': {
        const m = message.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
        if (m) params.newPlannerId = m[1];
        break;
      }
      case 'intakeYear': {
        const m = message.match(/\b(20\d{2})\b/);
        if (m) params.intakeYear = parseInt(m[1], 10);
        break;
      }
      case 'semester': {
        // "semester 1", "semester one", "1st semester", plain digit 1-4
        const m = message.match(/semester\s*([1-4])|([1-4])\s*(?:st|nd|rd|th)?\s*semester|\bsemester\s+(one|two|three|four)\b/i);
        if (m) {
          const word: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
          params.semester = m[3] ? word[m[3].toLowerCase()] : parseInt(m[1] ?? m[2], 10);
        }
        break;
      }
      case 'prefix': {
        // Unit code prefixes are always uppercase (e.g. "COS", "SWE", "MPU")
        const m = message.match(/\b([A-Z]{2,4})\b(?:\s+units|\s+courses)?/);
        if (m) params.prefix = m[1].toUpperCase();
        break;
      }
      case 'majorName': {
        // "computer science", "software engineering" etc — grab quoted or after "major"
        const quoted = message.match(/["']([^"']+)["']/);
        const afterMajor = message.match(/(?:major|program(?:me)?)\s+(?:for\s+)?([a-z\s]+)/i);
        if (quoted) params.majorName = quoted[1];
        else if (afterMajor) params.majorName = afterMajor[1].trim();
        break;
      }
      case 'enrollMode': {
        if (/\bmpu\b/i.test(message)) params.enrollMode = 'mpu';
        else if (/\bearli/i.test(message)) params.enrollMode = 'earliest';
        // latest is the default, no need to extract
        break;
      }
      // optional params with no good regex signal — leave absent (workflow defaults apply)
      default:
        break;
    }
  }

  const missingParams = workflow.params
    .filter((p) => p.required && !(p.name in params))
    .map((p) => p.name);

  return { params, missingParams };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function routeAndExtract(
  messages: ChatMessage[],
  workflows: Workflow[]
): Promise<RouteResult> {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  // Step 1: Pre-filter to top candidates
  const candidates = preFilterWorkflows(lastUserMessage, workflows);
  console.log(
    `[Copilot] Pre-filtered to ${candidates.length} workflows:`,
    candidates.map((w) => w.id).join(', '),
  );

  // Step 2: Ask model for just the workflow ID
  const routingPrompt = buildRoutingPrompt(lastUserMessage, candidates);
  let rawId: string;
  try {
    rawId = await callOllama(routingPrompt);
  } catch (err) {
    throw new Error(`Ollama routing call failed: ${err}`);
  }

  // Clean up — strip punctuation, quotes, extra spaces; take first token
  const cleanedId = rawId
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/[`'"]/g, '')
    .trim()
    .split(/[\s\n]/)[0]
    .toLowerCase();

  console.log(`[Copilot] Raw routing output: "${rawId}" → cleaned: "${cleanedId}"`);

  if (cleanedId === 'none' || !candidates.find((w) => w.id === cleanedId)) {
    console.log('[Copilot] No workflow matched.');
    return { canHandle: false, workflowId: null, params: {}, missingParams: [] };
  }

  const workflow = candidates.find((w) => w.id === cleanedId)!;

  // Step 3: Extract params via regex
  const { params, missingParams } = extractParamsRegex(lastUserMessage, workflow);
  console.log('[Copilot] Extracted params:', JSON.stringify(params), '| missing:', missingParams);

  return {
    canHandle: true,
    workflowId: workflow.id,
    params,
    missingParams,
  };
}
