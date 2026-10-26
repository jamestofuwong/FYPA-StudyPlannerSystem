/**
 * Does an advisor's natural question reach the right workflow?
 *
 * The prompts are in routing-prompts.data.ts, written from the advisor's side. This file runs them through the REAL
 * routeAndExtract with the REAL workflow registry (real ids, descriptions and parameters). Only the model is replaced, because the
 * unit tests must not need Ollama. The replacement model answers with the first candidate that it is shown.
 *
 * What this proves for each prompt:
 *   1. the keyword pre-filter keeps the expected workflow in the (at most 12) candidates that the model sees. If it is not there,
 *      the model cannot pick it, however good the model is.
 *   2. the expected workflow is ranked in the top 5. A 3B model chooses more reliably from a short, well-ordered list.
 *   3. when the model does pick the expected workflow, the router extracts the parameters that the advisor typed
 *      and asks for the ones that the advisor did not type.
 * What it does not prove: that the real model picks the right candidate. routing-ollama.test.ts does that (opt in).
 *
 * If a test here fails, the router or a workflow description must change, not the prompt.
 *
 * After every run the results are written to ROUTING-RESULTS.md, next to this file, so that a long result does not have to be
 * copied from the terminal. The file shows a summary per workflow and, for every failed prompt, what the router really did.
 */
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import fs from 'node:fs';
import path from 'node:path';
import { allWorkflows } from '../../../core/services/copilot/workflowRegistry';
import { routeAndExtract } from '../../../core/services/copilot/copilotService';
import { PROMPTS_BY_WORKFLOW, type PromptCase } from './routing-prompts.data';

const TOP_RANK = 5;

type Sent = string[];

/** A model that is shown a list of workflows and answers with the first one, or with `answer` when it is given. */
function mockModel(answer?: string) {
  const sent: Sent[] = [];
  global.fetch = jest.fn(async (_url: unknown, init: { body: string }) => {
    const prompt: string = JSON.parse(init.body).prompt;
    const ids = prompt.split('Workflows:\n')[1].split('\n\nUser message:')[0].split('\n').map((l) => l.split(':')[0]);
    sent.push(ids);
    return { ok: true, json: async () => ({ response: answer ?? ids[0] }), text: async () => '' } as Response;
  }) as unknown as typeof fetch;
  return sent;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// ── results report ────────────────────────────────────────────────────────────────────────────────────────────────────
type Kind = 'candidate' | 'top' | 'params';
interface Outcome { kind: Kind; workflow: string; text: string; ok: boolean; detail?: string }
const outcomes: Outcome[] = [];

/** Runs one check, remembers whether it passed and why it failed, and then lets Jest see the same failure. */
async function record(kind: Kind, workflow: string, text: string, check: () => Promise<string | void>) {
  try {
    const detail = await check();
    outcomes.push({ kind, workflow, text, ok: true, detail: detail || undefined });
  } catch (e) {
    outcomes.push({ kind, workflow, text, ok: false, detail: (e as Error).message.split('\n')[0] });
    throw e;
  }
}

const REPORT = path.join(__dirname, 'ROUTING-RESULTS.md');

function writeReport() {
  const ran = outcomes.length;
  if (ran === 0) return;
  const failed = outcomes.filter((o) => !o.ok);
  const label: Record<Kind, string> = {
    candidate: 'is among the candidates', top: `is in the top ${TOP_RANK}`, params: 'parameters extracted',
  };
  const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const cell = (id: string, kind: Kind) => {
    const list = outcomes.filter((o) => o.workflow === id && o.kind === kind);
    return list.length ? `${list.filter((o) => o.ok).length}/${list.length}` : '–';
  };

  const lines: string[] = [
    '# AI Copilot routing results',
    '',
    `Written by routing-prompts.test.ts on ${new Date().toISOString()}. This file is replaced on every run.`,
    '',
    `**${ran - failed.length} of ${ran} checks passed, ${failed.length} failed.** The model is a stand-in that picks the first candidate, so these results describe the keyword pre-filter and the parameter extraction. They do not describe the real model (see routing-ollama.test.ts).`,
    '',
    '## Per workflow',
    '',
    `| Workflow | ${label.candidate} | ${label.top} | ${label.params} |`,
    '|---|---|---|---|',
    ...allWorkflows.map((w) => `| ${w.id} | ${cell(w.id, 'candidate')} | ${cell(w.id, 'top')} | ${cell(w.id, 'params')} |`),
    '',
    `## Failed checks (${failed.length})`,
    '',
  ];
  if (failed.length === 0) lines.push('None.', '');
  for (const kind of ['candidate', 'top', 'params'] as Kind[]) {
    const group = failed.filter((o) => o.kind === kind);
    if (!group.length) continue;
    lines.push(`### ${label[kind]} (${group.length})`, '', '| Expected workflow | Prompt | What happened |', '|---|---|---|');
    for (const o of group) lines.push(`| ${o.workflow} | ${esc(o.text)} | ${esc(o.detail ?? '')} |`);
    lines.push('');
  }
  fs.writeFileSync(REPORT, lines.join('\n'));
}

afterAll(writeReport);

const rows = Object.entries(PROMPTS_BY_WORKFLOW).flatMap(([workflow, cases]) =>
  cases.map((c: PromptCase) => [workflow, c.text, c] as const));

describe('the prompt list', () => {
  const ids = allWorkflows.map((w) => w.id);

  test('every registered workflow has at least 4 prompts', () => {
    const few = ids.filter((id) => (PROMPTS_BY_WORKFLOW[id]?.length ?? 0) < 4);
    expect(few).toEqual([]);
  });

  test('there are no prompts for a workflow that does not exist', () => {
    expect(Object.keys(PROMPTS_BY_WORKFLOW).filter((id) => !ids.includes(id))).toEqual([]);
  });

  test('the prompts of one workflow are different from each other, not the same sentence with another id', () => {
    for (const [id, cases] of Object.entries(PROMPTS_BY_WORKFLOW)) {
      const shapes = cases.map((c) => c.text.toLowerCase().replace(/\d{7,10}|[0-9a-f-]{36}|[a-z]{2,4}\d{4,5}/g, '#').replace(/\W+/g, ' ').trim());
      expect({ id, unique: new Set(shapes).size }).toEqual({ id, unique: cases.length });
    }
  });

  test('no prompt is used for two different workflows', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, text] of rows) {
      const key = text.toLowerCase();
      if (seen.has(key) && seen.get(key) !== id) clashes.push(`${text} → ${seen.get(key)} and ${id}`);
      seen.set(key, id);
    }
    expect(clashes).toEqual([]);
  });

  test('the advisors write in different styles: some in lower case, some without a question mark, some with a unit code in lower case', () => {
    const texts = rows.map(([, t]) => t);
    expect(texts.filter((t) => t === t.toLowerCase()).length).toBeGreaterThanOrEqual(25);
    expect(texts.filter((t) => !t.trim().endsWith('?')).length).toBeGreaterThanOrEqual(40);
    expect(texts.filter((t) => /\b[a-z]{3}\d{5}\b/.test(t)).length).toBeGreaterThanOrEqual(10);
  });
});

describe('routing: the expected workflow reaches the model', () => {
  test.each(rows)('%s ← "%s" is among the candidates', (expected, text) =>
    record('candidate', expected, text, async () => {
      const sent = mockModel();
      await routeAndExtract([{ role: 'user', content: text }], allWorkflows);
      expect(sent).toHaveLength(1);
      expect(sent[0].length).toBeLessThanOrEqual(12);
      const rank = sent[0].indexOf(expected);
      if (rank < 0) throw new Error(`not a candidate. The model was shown: ${sent[0].join(', ')}`);
      return `rank ${rank + 1}`;
    }));

  test.each(rows)(`%s ← "%s" is ranked in the top ${TOP_RANK}`, (expected, text) =>
    record('top', expected, text, async () => {
      const sent = mockModel();
      await routeAndExtract([{ role: 'user', content: text }], allWorkflows);
      const rank = sent[0].indexOf(expected);
      if (rank < 0 || rank >= TOP_RANK) {
        throw new Error(`${rank < 0 ? 'not a candidate' : `rank ${rank + 1}`}. Top ${TOP_RANK}: ${sent[0].slice(0, TOP_RANK).join(', ')}`);
      }
      return `rank ${rank + 1}`;
    }));
});

describe('parameter extraction: what the advisor typed is found, what they left out is asked for', () => {
  test.each(rows.filter(([, , c]) => c.params || c.missing))('%s ← "%s"', (expected, text, c) =>
    record('params', expected, text, async () => {
      mockModel(expected);
      const r = await routeAndExtract([{ role: 'user', content: text }], allWorkflows);
      const problems: string[] = [];
      if (!r.canHandle || r.workflowId !== expected) problems.push(`routed to ${r.workflowId ?? 'nothing'}`);
      for (const [k, v] of Object.entries(c.params ?? {})) {
        if (JSON.stringify(r.params[k]) !== JSON.stringify(v)) problems.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(r.params[k])}`);
      }
      for (const m of c.missing ?? []) if (!r.missingParams.includes(m)) problems.push(`${m} should be reported missing`);
      if (!c.missing && r.missingParams.length) problems.push(`reported missing: ${r.missingParams.join(', ')}`);
      if (problems.length) throw new Error(problems.join('; '));
    }));
});

describe('conversation handling', () => {
  test('only the latest advisor message is routed, even when the assistant spoke last', async () => {
    const sent = mockModel();
    await routeAndExtract([
      { role: 'user', content: 'Which planners are available?' },
      { role: 'assistant', content: 'Here are the planners...' },
      { role: 'user', content: 'Can 102780123 graduate?' },
      { role: 'assistant', content: 'Checking.' },
    ], allWorkflows);
    expect(sent[0]).toContain('check_graduation_status');
  });

  test('an empty message does not crash the router', async () => {
    mockModel();
    await expect(routeAndExtract([{ role: 'user', content: '' }], allWorkflows)).resolves.toBeDefined();
  });

  test('extra spaces, capitals and punctuation do not change the route', async () => {
    for (const text of ['  CAN   102780123   GRADUATE ???  ', 'can 102780123 graduate!!!', 'Can,102780123,graduate']) {
      const sent = mockModel();
      await routeAndExtract([{ role: 'user', content: text }], allWorkflows);
      expect(sent[0].slice(0, TOP_RANK)).toContain('check_graduation_status');
    }
  });

  test.each([
    ['check_graduation_status', true], ['`check_graduation_status`', true], ['Check_Graduation_Status', true],
    ['check_graduation_status\nbecause the user asks about graduation', true],
    ['<think>the user wants graduation</think>check_graduation_status', true],
  ])('model answer %j is understood (can handle: %s)', async (answer, canHandle) => {
    mockModel(answer);
    const r = await routeAndExtract([{ role: 'user', content: 'Can 102780123 graduate?' }], allWorkflows);
    expect(r.canHandle).toBe(canHandle);
    expect(r.workflowId).toBe('check_graduation_status');
  });

  // The keyword filter has a clear winner for a plain question, so "none" from a small model is not final.
  test.each(['none', 'None.', '"none"', 'not_a_workflow'])('model answer %j for a clear question falls back to the keyword filter', async (answer) => {
    mockModel(answer);
    const r = await routeAndExtract([{ role: 'user', content: 'Can 102780123 graduate?' }], allWorkflows);
    expect(r.workflowId).toBe('check_graduation_status');
  });

  // Without a clear winner the model's "none" stands.
  test.each(['none', 'None.', '"none"', 'not_a_workflow'])('model answer %j for a vague question is a refusal', async (answer) => {
    mockModel(answer);
    const r = await routeAndExtract([{ role: 'user', content: 'tell me about the units' }], allWorkflows);
    expect(r.canHandle).toBe(false);
    expect(r.workflowId).toBeNull();
  });

  test('a workflow that is not among the candidates is refused, even if it exists', async () => {
    mockModel('get_portal_status');                                     // exists, but nothing in this question points to it
    const r = await routeAndExtract([{ role: 'user', content: 'Which units has 102780123 failed?' }], allWorkflows);
    expect(r.canHandle).toBe(false);
  });

  test('when the model service is down, the error says that the routing call failed', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'busy', json: async () => ({}) } as Response)) as unknown as typeof fetch;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(routeAndExtract([{ role: 'user', content: 'list planners' }], allWorkflows)).rejects.toThrow(/routing call failed/i);
  });
});
