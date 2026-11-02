/**
 * The REAL model chooses the workflow. Opt in: these tests need Ollama running with the copilot model, so they are skipped in CI.
 *
 *   RUN_OLLAMA_TESTS=1 npx jest tests/unit/copilot/routing-ollama.test.ts
 *
 * Run them before you change the model, the routing prompt, the workflow descriptions or the Ollama version. The mocked tests in
 * routing-prompts.test.ts cannot see a change in the model's choices. Each prompt must reach exactly the expected workflow.
 * The out-of-scope prompts must reach none.
 *
 * After every run the results are written to ROUTING-OLLAMA-RESULTS.md, next to this file: accuracy per workflow, and for every
 * wrong answer the candidates that the model was shown, what it answered, and how long it took.
 */
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { allWorkflows } from '../../../core/services/copilot/workflowRegistry';
import { routeAndExtract, COPILOT_MODEL, OLLAMA_URL } from '../../../core/services/copilot/copilotService';
import { PROMPTS_BY_WORKFLOW, OUT_OF_SCOPE_PROMPTS } from './routing-prompts.data';

const enabled = process.env.RUN_OLLAMA_TESTS === '1';
const d = enabled ? describe : describe.skip;

const rows = Object.entries(PROMPTS_BY_WORKFLOW).flatMap(([workflow, cases]) => cases.map((c) => [workflow, c.text] as const));
const WORKFLOW_FLOOR = 0.75;     // at least 3 of 4 prompts of a workflow must be right
const OVERALL_FLOOR = 0.9;       // at least 9 of 10 prompts overall must be right

// ── results report ────────────────────────────────────────────────────────────────────────────────────────────────────
interface Outcome {
  expected: string;                // a workflow id, or 'none' for an out-of-scope prompt
  text: string;
  routed: string | null;           // what the router returned
  raw: string;                     // what the model wrote
  candidates: string[];            // what the model was shown
  ms: number;
  ok: boolean;
}
const outcomes: Outcome[] = [];
const REPORT = path.join(__dirname, 'ROUTING-OLLAMA-RESULTS.md');
const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Routes one prompt, and remembers the candidates and the raw model answer that the router writes to the console. */
async function route(text: string) {
  const logs: string[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
  const t0 = Date.now();
  try {
    const result = await routeAndExtract([{ role: 'user', content: text }], allWorkflows);
    const ms = Date.now() - t0;
    const shown = logs.find((l) => l.includes('Pre-filtered'))?.split(':').slice(1).join(':').trim().split(', ').filter(Boolean) ?? [];
    const raw = /Raw routing output: "([\s\S]*?)" → cleaned/.exec(logs.find((l) => l.includes('Raw routing output')) ?? '')?.[1] ?? '';
    return { result, ms, shown, raw };
  } finally {
    spy.mockRestore();
  }
}

function writeReport() {
  if (!outcomes.length) return;
  const inScope = outcomes.filter((o) => o.expected !== 'none');
  const outScope = outcomes.filter((o) => o.expected === 'none');
  const okIn = inScope.filter((o) => o.ok).length;
  const okOut = outScope.filter((o) => o.ok).length;
  const wrong = outcomes.filter((o) => !o.ok);
  const times = outcomes.map((o) => o.ms).sort((a, b) => a - b);
  const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : '–');
  const inCandidates = inScope.filter((o) => o.candidates.includes(o.expected));
  const rightWhenShown = inCandidates.filter((o) => o.ok).length;

  const lines: string[] = [
    '# AI Copilot routing results: real model',
    '',
    `Written by routing-ollama.test.ts on ${new Date().toISOString()}. Model \`${COPILOT_MODEL}\` at ${OLLAMA_URL}. This file is replaced on every run.`,
    '',
    '## Summary',
    '',
    `- In-scope prompts routed to the expected workflow: **${okIn} of ${inScope.length} (${pct(okIn, inScope.length)})**`,
    `- Out-of-scope prompts correctly refused: **${okOut} of ${outScope.length} (${pct(okOut, outScope.length)})**`,
    `- The expected workflow was among the candidates for ${inCandidates.length} of ${inScope.length} in-scope prompts. When it was shown, the model chose it ${rightWhenShown} of ${inCandidates.length} times (${pct(rightWhenShown, inCandidates.length)}).`,
    `- Time per routing call: median ${times[Math.floor(times.length / 2)]} ms, slowest ${times[times.length - 1]} ms.`,
    '',
    '## Per workflow',
    '',
    '| Workflow | Correct | Shown to the model | Wrong answers chosen |',
    '|---|---|---|---|',
    ...allWorkflows.map((w) => {
      const list = inScope.filter((o) => o.expected === w.id);
      const wrongTo = list.filter((o) => !o.ok).map((o) => o.routed ?? 'none');
      return `| ${w.id} | ${list.filter((o) => o.ok).length}/${list.length} | ${list.filter((o) => o.candidates.includes(w.id)).length}/${list.length} | ${wrongTo.join(', ') || '–'} |`;
    }),
    '',
  ];

  // What the model chooses when it is wrong: which workflows attract wrong answers.
  const attract = new Map<string, number>();
  for (const o of wrong) attract.set(o.routed ?? 'none', (attract.get(o.routed ?? 'none') ?? 0) + 1);
  lines.push('## Workflows that attract wrong answers', '', '| Chosen by mistake | Times |', '|---|---|');
  for (const [id, n] of [...attract.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${id} | ${n} |`);
  lines.push('', `## Wrong answers (${wrong.length})`, '', '| Expected | Prompt | Model answered | Expected was shown? | Candidates shown |', '|---|---|---|---|---|');
  for (const o of wrong) {
    const shown = o.expected === 'none' ? '–' : o.candidates.includes(o.expected) ? `yes (rank ${o.candidates.indexOf(o.expected) + 1})` : 'no';
    lines.push(`| ${o.expected} | ${esc(o.text)} | ${esc(o.raw || '(empty)')} | ${shown} | ${o.candidates.join(', ')} |`);
  }
  lines.push('');
  fs.writeFileSync(REPORT, lines.join('\n'));
}

d('the real model routes advisor questions', () => {
  jest.setTimeout(120_000);

  // jest.setup.js replaces fetch with a stub. These tests must reach the real Ollama, so fetch is replaced by a small
  // version that uses node:http. The router only needs ok, status, json() and text().
  beforeAll(() => {
    global.fetch = ((url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) =>
      new Promise((resolve, reject) => {
        const req = http.request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode,
            json: async () => JSON.parse(data),
            text: async () => data,
          } as unknown as Response));
        });
        req.on('error', reject);
        req.end(init.body);
      })) as unknown as typeof fetch;
  });

  afterAll(writeReport);

  test.each(rows)('%s ← "%s"', async (expected, text) => {
    const { result, ms, shown, raw } = await route(text);
    const ok = result.workflowId === expected;
    outcomes.push({ expected, text, routed: result.workflowId, raw, candidates: shown, ms, ok });
    expect(result.workflowId).toBe(expected);
  });

  test.each(OUT_OF_SCOPE_PROMPTS)('"%s" is not routed to any workflow', async (text) => {
    const { result, ms, shown, raw } = await route(text);
    outcomes.push({ expected: 'none', text, routed: result.workflowId, raw, candidates: shown, ms, ok: !result.canHandle });
    expect(result.canHandle).toBe(false);
  });

  test(`accuracy is at least ${OVERALL_FLOOR * 100}% overall and ${WORKFLOW_FLOOR * 100}% for every workflow`, () => {
    const inScope = outcomes.filter((o) => o.expected !== 'none');
    const per = new Map<string, { ok: number; total: number }>();
    for (const o of inScope) {
      const h = per.get(o.expected) ?? { ok: 0, total: 0 };
      h.total++;
      if (o.ok) h.ok++;
      per.set(o.expected, h);
    }
    const weak = [...per.entries()].filter(([, h]) => h.ok / h.total < WORKFLOW_FLOOR).map(([id, h]) => `${id} ${h.ok}/${h.total}`);
    expect(weak).toEqual([]);
    expect(inScope.filter((o) => o.ok).length / inScope.length).toBeGreaterThanOrEqual(OVERALL_FLOOR);
  });
});
