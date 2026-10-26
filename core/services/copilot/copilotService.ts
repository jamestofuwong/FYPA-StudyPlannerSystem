import type { ChatMessage, RouteOptions, RouteResult, Workflow } from './types';
import { findPlannerMentions, describeMention } from './plannerNames';
import { semesterOfDate, nextSemester } from './semester';
import { OLLAMA_URL, COPILOT_MODEL } from '../../config/ollama';

export { OLLAMA_URL, COPILOT_MODEL };

// ---------------------------------------------------------------------------
// Pre-filter: score workflows against user message and keep the best candidates.
//
// A word that few workflows use ("transcript", "unlock") says more than a word that many use ("unit", "student"), so each
// word counts by how rare it is among the workflows. Words from a workflow's id and keywords count more than words from
// its description. A unit code, a student id or a planner id in the message points at the workflows that take that value.
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'what', 'which', 'who', 'how',
  'for', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'do', 'does', 'did',
  'has', 'have', 'been', 'can', 'could', 'would', 'their', 'they', 'this',
  'that', 'with', 'from', 'by', 'me', 'my', 'its', 'it', 'all', 'met',
  'tell', 'give', 'please', 'any', 'out', 'about', 'there', 'still',
]);

/** Words that mean the same thing for routing. Left side is the stemmed form of what an advisor types. */
const SAME_WORD: Record<string, string> = {
  sem: 'semester', prereq: 'prerequisit', prerequisit: 'prerequisit', requirement: 'requir',
  subject: 'unit', module: 'unit', gpa: 'cgpa', intern: 'wil', internship: 'wil', placement: 'wil',
  major: 'major', program: 'program', programme: 'program', plan: 'planner',
  transcript: 'grade', mark: 'grade', result: 'grade',
};

/** Minimal stemmer: strip common suffixes so plurals and verb forms match ("unlocked" = "unlock", "complete" = "completed"). */
function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);        // switching → switch
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);    // unlocked → unlock
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);    // switches → switch
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);   // planners → planner
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);          // complete → complet (same as completed)
  return SAME_WORD[w] ?? w;
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')       // "cos30019" → "cos 30019"
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
}

const UNIT_CODE = /\b[a-z]{2,4}\d{4,5}\b/i;
const STUDENT_ID = /\b\d{7,10}\b/;
const YEAR = /\b20\d{2}\b/;
const PLANNER_UUID_G = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PLANNER_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const MAX_CANDIDATES = 10;
const MIN_CANDIDATES = 4;
const DOMINANCE = 2;               // the best score is at least this many times the second best
const DOMINANT_SHORTLIST = 3;
const FALLBACK_MIN_SCORE = 6;      // a keyword or id word must have matched, not only a common description word
const KEEP_FRACTION = 0.35;        // drop candidates that score less than this share of the best one

/** The message without the values that other signals handle. "COS10009" must not count as the word "cos". */
const withoutCodes = (text: string) => text.replace(/\b[a-z]{2,4}\d{4,5}\b/gi, ' ').replace(PLANNER_UUID_G, ' ');

export function rankWorkflows(userMessage: string, workflows: Workflow[]): { workflow: Workflow; score: number; specificity: number }[] {
  const msgTokens = new Set(tokenise(withoutCodes(userMessage)));

  // weight of each word per workflow: id and keywords 3, parameter names 1, description 1
  const bags = workflows.map((w) => {
    const bag = new Map<string, number>();
    const put = (tokens: string[], weight: number) => tokens.forEach((t) => bag.set(t, Math.max(bag.get(t) ?? 0, weight)));
    put(tokenise(w.description), 1);
    put(w.params.flatMap((p) => tokenise(p.name)), 1);
    put(tokenise(w.id.replace(/_/g, ' ')), 3);
    put((w.keywords ?? []).flatMap(tokenise), 3);
    return bag;
  });

  const docFreq = new Map<string, number>();
  for (const bag of bags) for (const t of bag.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + workflows.length / (docFreq.get(t) ?? 1));

  const hasCode = UNIT_CODE.test(userMessage);
  const hasStudent = STUDENT_ID.test(userMessage);
  const hasPlanner = PLANNER_UUID.test(userMessage);
  const hasYear = YEAR.test(userMessage);
  const namesMajor = /\b(?:planners?|plans?|majors?|programs?|programmes?)\b/i.test(userMessage) && extractMajorName(userMessage) !== undefined;
  const takes = (w: Workflow, pred: (name: string) => boolean) => w.params.some((p) => pred(p.name));

  const scored = workflows.map((w, i) => {
    let score = 0;
    let matched = 0;
    for (const [token, weight] of bags[i]) {
      if (msgTokens.has(token)) { score += weight * idf(token); matched++; }
    }
    // a unit code is the value that the unit workflows ask for, even if no word matched
    if (hasCode && takes(w, (n) => n === 'unitCode')) score += 2;
    if (score > 0) {
      if (hasStudent && takes(w, (n) => n === 'studentId')) score += 1;
      if (hasPlanner && takes(w, (n) => n.startsWith('plannerId') || n === 'newPlannerId')) score += 1;
    }
    // a planner id alone, with no student, unit or other value, is the value that the one-planner workflows ask for
    if (hasPlanner && !hasStudent && !hasCode && w.params.length > 0 && w.params.filter((p) => p.required).every((p) => p.name.startsWith('plannerId'))) score += 3;
    // a major name next to the word planner, plan, major or program is the value that find_planner_by_major asks for
    if (namesMajor && takes(w, (n) => n === 'majorName')) score += 4;
    // a year in the message ("2025 intake") is the value that the intake-year workflows ask for, even if no word matched
    if (hasYear) {
      const year = w.params.find((p) => p.name === 'intakeYear');
      if (year) score += year.required ? 6 : 1;
    }
    return { workflow: w, score, specificity: matched / Math.max(1, bags[i].size) };
  });

  scored.sort((a, b) => b.score - a.score || b.specificity - a.specificity);
  return scored;
}

function preFilterWorkflows(userMessage: string, workflows: Workflow[]): Workflow[] {
  const hasStudent = STUDENT_ID.test(userMessage);
  const hasCode = UNIT_CODE.test(userMessage);
  const takes = (w: Workflow, pred: (name: string) => boolean) => w.params.some((p) => pred(p.name));
  const scored = rankWorkflows(userMessage, workflows);
  const matched = scored.filter((s) => s.score > 0);
  if (matched.length === 0) {
    // Only a value is left ("who is 102780123", "COS30019?"): offer the workflows that take that kind of value.
    const kind = hasStudent ? (n: string) => n === 'studentId' : hasCode ? (n: string) => n === 'unitCode' : null;
    const byValue = kind ? workflows.filter((w) => takes(w, kind)).slice(0, MIN_CANDIDATES) : [];
    return byValue;                                    // nothing else points at any workflow: the model need not guess
  }

  // When one workflow is far ahead of the rest, the model only has to confirm it. A short list is easier for a small model.
  if (matched.length > 1 && matched[0].score >= DOMINANCE * matched[1].score) {
    return matched.slice(0, DOMINANT_SHORTLIST).map((s) => s.workflow);
  }

  const cutoff = matched[0].score * KEEP_FRACTION;
  const kept = matched.filter((s, i) => i < MIN_CANDIDATES || s.score >= cutoff);
  return kept.slice(0, MAX_CANDIDATES).map((s) => s.workflow);
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
      keep_alive: -1,
      options: { temperature: 0, num_predict: 40 },
    }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Ollama returned ${response.status}: ${errBody}`);
  }
  const body = await response.json() as { response: string };
  return body.response.trim();
}

// ---------------------------------------------------------------------------
// Phase 2: Param extraction via regex — no extra LLM call for common types.
// ---------------------------------------------------------------------------
const UUID_G = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
const NUMBER_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

/** Words that can sit in front of "units" without being a unit code prefix. */
const NOT_A_PREFIX = new Set([
  'the', 'all', 'any', 'our', 'new', 'old', 'its', 'her', 'his', 'few', 'more', 'some', 'most', 'many', 'these', 'those', 'what',
  'which', 'how', 'core', 'main', 'each', 'both', 'open', 'free', 'other', 'first', 'last', 'next', 'show', 'list', 'see', 'get',
  'and', 'for', 'with', 'than', 'then', 'that', 'this', 'are', 'can', 'has', 'have', 'who', 'one', 'two', 'out', 'not', 'off',
]);

function extractSemester(message: string, now: Date): number | undefined {
  const m = message.match(/\b(?:semester|sem|term)\s*([1-4])\b|\b([1-4])\s*(?:st|nd|rd|th)?\s*(?:semester|sem|term)\b|\b(?:semester|sem|term)\s+(one|two|three|four)\b|\b(one|two|three|four)\s+(?:semester|sem)\b/i);
  if (m) {
    const word = m[3] ?? m[4];
    return word ? NUMBER_WORD[word.toLowerCase()] : parseInt(m[1] ?? m[2], 10);
  }
  if (/\bsummer\b/i.test(message)) return 3;
  if (/\bwinter\b/i.test(message)) return 4;
  const current = semesterOfDate(now);
  if (/\b(?:next|upcoming|coming)\s+(?:semester|sem|term)\b/i.test(message)) return nextSemester(current);
  if (/\b(?:this|current|present)\s+(?:semester|sem|term)\b|\bright now\b/i.test(message)) return current;
  return undefined;
}

function extractMajorName(message: string): string | undefined {
  const quoted = message.match(/["“']([^"”']+)["”']/);
  if (quoted) return quoted[1].trim();
  const clean = (t: string) => t
    .replace(/\b(?:the|a|an|planner|planners|plan|plans|program|programme|major|majors|course|study|intake)\b/gi, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const patterns = [
    /\b(?:planners?|plans?|programs?|programmes?|majors?|courses?)\s+(?:id\s+)?(?:for|of|in)\s+(?:the\s+)?([a-z][a-z &-]*?)(?=\s+(?:major|planner|plan|program|programme|course)\b|[,.?!]|\s+20\d{2}|\s+intake|$)/i,
    /\b(?:for|of)\s+(?:the\s+)?([a-z][a-z &-]*?)\s+(?:major|planner|plan|program|programme)\b/i,
    /\b(?:major|program(?:me)?)\s+(?:for\s+)?([a-z][a-z &-]*)/i,
    /\bfor\s+(?:the\s+)?([a-z][a-z &-]*?)\s*(?:[,.?!]|\s+20\d{2}|\s+intake|$)/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m) {
      const name = clean(m[1]);
      // "what major is 102780123 in" is not a major name: a name needs a word that is not a filler word
      if (name && name.split(' ').some((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w))) return name;
    }
  }
  return undefined;
}

function extractPrefix(message: string): string | undefined {
  const upper = message.match(/\b([A-Z]{2,4})\b(?:\s+units|\s+courses)?/);
  if (upper) return upper[1].toUpperCase();
  // lower case: "show me the swe units", "start with ict"
  const m = message.match(/\b(?:start(?:s|ing)?\s+with|begin(?:s|ning)?\s+with|prefix|code)\s+([a-z]{2,4})\b/i)
    ?? message.match(/\b([a-z]{2,4})\s+(?:units|subjects|courses|modules)\b/i);
  if (m && !NOT_A_PREFIX.has(m[1].toLowerCase())) return m[1].toUpperCase();
  return undefined;
}

function extractParamsRegex(message: string, workflow: Workflow, now: Date): {
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
      case 'plannerId':
      case 'newPlannerId': {
        const m = message.match(UUID_G);
        if (m) params[p.name] = m[0];
        break;
      }
      case 'plannerId1': {
        const all = [...message.matchAll(UUID_G)];
        if (all[0]) params.plannerId1 = all[0][1];
        break;
      }
      case 'plannerId2': {
        const all = [...message.matchAll(UUID_G)];
        if (all[1]) params.plannerId2 = all[1][1];
        break;
      }
      case 'intakeYear': {
        const m = message.match(/\b(20\d{2})\b/);
        if (m) params.intakeYear = parseInt(m[1], 10);
        break;
      }
      case 'semester': {
        const sem = extractSemester(message, now);
        if (sem) params.semester = sem;
        break;
      }
      case 'prefix': {
        const prefix = extractPrefix(message);
        if (prefix) params.prefix = prefix;
        break;
      }
      case 'majorName': {
        const name = extractMajorName(message);
        if (name) params.majorName = name;
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
// Planner names: "the Data Science planner" → a planner id
// ---------------------------------------------------------------------------
async function fillPlannersFromNames(
  message: string,
  workflow: Workflow,
  params: Record<string, unknown>,
  loadPlanners: NonNullable<RouteOptions['loadPlanners']>,
): Promise<string[]> {
  const wanted = workflow.params.filter((p) => /^(plannerId[12]?|newPlannerId)$/.test(p.name) && !(p.name in params));
  if (wanted.length === 0) return [];

  let mentions;
  try {
    mentions = findPlannerMentions(message, await loadPlanners());
  } catch (err) {
    console.error('[Copilot] Could not load the planners to resolve a name:', err);
    return [];
  }
  if (mentions.length === 0) return [];

  const used = new Set<number>();
  const take = (index: number, name: string) => {
    const m = mentions[index];
    if (!m) return;
    params[name] = m.planner.id;
    used.add(index);
  };
  for (const p of wanted) {
    if (p.name === 'plannerId' || p.name === 'plannerId1') take(0, p.name);
    else if (p.name === 'plannerId2') take(1, p.name);
    else if (p.name === 'newPlannerId') take(mentions.length - 1, p.name);       // "from A to B": the new planner is the last one named
  }
  return [...used].sort().map((i) => describeMention(mentions[i]));
}

// ---------------------------------------------------------------------------
// The copilot only reads data. A request to change data gets a clear refusal and no workflow.
// ---------------------------------------------------------------------------
const WRITE_VERB = 'change|edit|update|modify|delete|remove|rename|overwrite|set|create|add|insert|drop|erase|fix|correct|reset|assign|email|send|book';

export function isWriteRequest(message: string): boolean {
  const text = message.trim().toLowerCase().replace(/^(?:hey|hi|hello|ok|okay|please|kindly|can you|could you|would you|will you|i want to|i need to|i would like to|i'd like to|i wanna|help me|let's|lets)[\s,]+/g, '');
  const stripped = text.replace(/^(?:please|kindly)[\s,]+/, '');
  return new RegExp(`^(?:${WRITE_VERB})\\b`).test(stripped);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/** Finds the workflow id in the model's answer, also when it adds a suffix ("get_units_by_semester:1") or extra words. */
function pickWorkflowId(rawId: string, candidates: Workflow[]): string | null {
  const cleaned = rawId
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/[`'"*]/g, '')
    .trim()
    .toLowerCase();
  if (!cleaned || cleaned.split(/[\s\n]/)[0] === 'none') return null;

  const first = cleaned.split(/[\s\n]/)[0].replace(/[:(,;.].*$/, '');
  if (candidates.some((w) => w.id === first)) return first;

  // an id somewhere in the answer: take the one that comes first
  let best: { id: string; at: number } | null = null;
  for (const w of candidates) {
    const at = cleaned.search(new RegExp(`(?<![a-z_])${w.id}(?![a-z_])`));
    if (at >= 0 && (!best || at < best.at)) best = { id: w.id, at };
  }
  return best?.id ?? null;
}

const NO_MATCH: RouteResult = { canHandle: false, workflowId: null, params: {}, missingParams: [] };

export async function routeAndExtract(
  messages: ChatMessage[],
  workflows: Workflow[],
  options: RouteOptions = {},
): Promise<RouteResult> {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const now = options.now ?? new Date();

  // Step 0: the copilot never changes data
  if (isWriteRequest(lastUserMessage)) {
    console.log('[Copilot] Refused: the request asks to change data.');
    return { ...NO_MATCH, refusal: 'read_only' };
  }

  // Step 1: Pre-filter to top candidates
  const candidates = preFilterWorkflows(lastUserMessage, workflows);
  console.log(
    `[Copilot] Pre-filtered to ${candidates.length} workflows:`,
    candidates.map((w) => w.id).join(', '),
  );
  if (candidates.length === 0) {
    console.log('[Copilot] No workflow matched any word of the message.');
    return { ...NO_MATCH };
  }

  // Step 2: Ask model for just the workflow ID
  const routingPrompt = buildRoutingPrompt(lastUserMessage, candidates);
  let rawId: string;
  try {
    rawId = await callOllama(routingPrompt);
  } catch (err) {
    console.error('[Copilot] Ollama routing call failed:', err);
    throw new Error(`Ollama routing call failed: ${err}`);
  }

  let workflowId = pickWorkflowId(rawId, candidates);
  console.log(`[Copilot] Raw routing output: "${rawId}" → cleaned: "${workflowId ?? 'none'}"`);

  // A small model often answers "none" for a clear question. When the keyword filter had one clear winner, trust the filter.
  if (!workflowId) {
    const ranked = rankWorkflows(lastUserMessage, workflows);
    if (ranked.length > 1 && ranked[0].score >= FALLBACK_MIN_SCORE && ranked[0].score >= DOMINANCE * ranked[1].score) {
      workflowId = candidates.some((w) => w.id === ranked[0].workflow.id) ? ranked[0].workflow.id : null;
      if (workflowId) console.log(`[Copilot] The model found no match, but "${workflowId}" is far ahead in the keyword filter: using it.`);
    }
  }

  if (!workflowId) {
    console.log('[Copilot] No workflow matched.');
    return { ...NO_MATCH };
  }

  const workflow = candidates.find((w) => w.id === workflowId)!;

  // Step 3: Extract params via regex, then fill planner ids from planner names
  const { params } = extractParamsRegex(lastUserMessage, workflow, now);
  const notes = options.loadPlanners
    ? await fillPlannersFromNames(lastUserMessage, workflow, params, options.loadPlanners)
    : [];
  const missingParams = workflow.params.filter((p) => p.required && !(p.name in params)).map((p) => p.name);
  console.log('[Copilot] Extracted params:', Object.keys(params).join(', ') || '(none)', '| missing:', missingParams);

  return {
    canHandle: true,
    workflowId: workflow.id,
    params,
    missingParams,
    ...(notes.length ? { notes } : {}),
  };
}
