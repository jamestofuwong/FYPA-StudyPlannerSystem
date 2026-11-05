/**
 * The registry of AI Copilot workflows, with the REAL workflows and the REAL descriptions.
 *
 * routing.test.ts checks the router with stub workflows. These tests check what the router really sees: that every
 * workflow is registered, well formed, and reachable from a natural question. The model reads only the description of a
 * workflow, so a poor description makes the copilot pick the wrong workflow. These tests catch that before a user does.
 */
// The portal login opens a real browser. The workflows only import it, so a stand-in is enough.
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

import fs from 'node:fs';
import path from 'node:path';
import { allWorkflows, workflowRegistry } from '../../../core/services/copilot/workflowRegistry';
import { routeAndExtract } from '../../../core/services/copilot/copilotService';

const WORKFLOW_DIR = path.resolve(__dirname, '../../../core/services/copilot/workflows');

describe('registry integrity', () => {
  test('the registry has one entry per workflow, with unique ids', () => {
    const ids = allWorkflows.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(workflowRegistry.size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(30);
  });

  test('every workflow that is written in the workflows folder is registered (none is forgotten)', () => {
    const exported = fs.readdirSync(WORKFLOW_DIR)
      .flatMap((f) => [...fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8').matchAll(/export const (\w+Workflow)\b/g)].map((m) => m[1]));
    const registrySource = fs.readFileSync(path.resolve(WORKFLOW_DIR, '..', 'workflowRegistry.ts'), 'utf8');
    const forgotten = exported.filter((name) => !new RegExp(`\\b${name}\\b[^;]*?(?:,|\\])`, 's').test(registrySource.slice(registrySource.indexOf('const workflows'))));
    expect(forgotten).toEqual([]);
    expect(exported.length).toBe(allWorkflows.length);
  });

  test.each(allWorkflows.map((w) => [w.id, w] as const))('%s is well formed', (_id, w) => {
    expect(w.id).toMatch(/^[a-z]+(_[a-z]+)+$/);                                         // snake_case, at least two words
    expect(w.description.length).toBeGreaterThanOrEqual(30);                            // the model needs something to read
    expect(w.description.length).toBeLessThanOrEqual(600);                              // 12 are sent in one prompt to a small model
    expect(w.description).toMatch(/[.!]$/);
    expect(typeof w.execute).toBe('function');
    for (const p of w.params) {
      expect(p.name).toMatch(/^[a-z][A-Za-z0-9]+$/);
      expect(['string', 'number', 'boolean']).toContain(p.type);
      expect(typeof p.required).toBe('boolean');
    }
    expect(new Set(w.params.map((p) => p.name)).size).toBe(w.params.length);
  });

  test('every parameter name is one that the regex extractor understands, or is optional', () => {
    const src = fs.readFileSync(path.resolve(WORKFLOW_DIR, '..', 'copilotService.ts'), 'utf8');
    const handled = new Set([...src.matchAll(/case '(\w+)'/g)].map((m) => m[1]));
    const unhandled = allWorkflows.flatMap((w) => w.params.filter((p) => p.required && !handled.has(p.name)).map((p) => `${w.id}.${p.name}`));
    expect(unhandled).toEqual([]);
  });

  test('descriptions say when to use the workflow, so two workflows are not told apart only by their id', () => {
    const noHint = allWorkflows.filter((w) => !/\b(use this|when the user|asks?|whether|returns?|lists?|checks?|shows?|detects?|finds?|compares?|counts?|gets?|searches|explains|determines|calculates)\b/i.test(w.description));
    expect(noHint.map((w) => w.id)).toEqual([]);
  });
});

// What the model is sent: it picks one id from the (up to) 12 workflows that the keyword pre-filter keeps.
// The test model answers with the FIRST candidate. It does not know the expected answer, so a pass means the pre-filter
// put the expected workflow in the list, and a pass on "first" means it ranked it best.
function mockModelThatPicksFirstCandidate() {
  const sent: string[][] = [];
  global.fetch = jest.fn(async (_url: unknown, init: any) => {
    const prompt: string = JSON.parse(init.body).prompt;
    const lines = prompt.split('Workflows:\n')[1].split('\n\nUser message:')[0].split('\n');
    const ids = lines.map((l) => l.split(':')[0]);
    sent.push(ids);
    return { ok: true, json: async () => ({ response: ids[0] }), text: async () => '' } as Response;
  }) as unknown as typeof fetch;
  return sent;
}

// Which workflow a question reaches is tested for every workflow in routing-prompts.test.ts (prompts in routing-prompts.data.ts).
describe('parameters in a real registry question', () => {
  test('a question that names a student gets that student id as a parameter, without a second model call', async () => {
    const sent = mockModelThatPicksFirstCandidate();
    const r = await routeAndExtract([{ role: 'user', content: 'What major is 102780123 in?' }], allWorkflows);
    expect(r.canHandle).toBe(true);
    expect(r.params).toMatchObject({ studentId: '102780123' });
    expect(sent).toHaveLength(1);
  });

  test('a question without the student id says which parameter is missing', async () => {
    mockModelThatPicksFirstCandidate();
    const r = await routeAndExtract([{ role: 'user', content: 'Can the student graduate?' }], allWorkflows);
    if (r.workflowId && allWorkflows.find((w) => w.id === r.workflowId)!.params.some((p) => p.name === 'studentId' && p.required)) {
      expect(r.missingParams).toContain('studentId');
    }
  });
});
