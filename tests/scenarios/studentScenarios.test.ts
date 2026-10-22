/**
 * Student scenario suite: runs ~40 realistic test students through the three advisor features and compares
 * what the features do with what should happen.
 *
 *   SCENARIO_DB_URL=postgresql://user:pass@host:port/db npx jest tests/scenarios
 *
 * Skipped when SCENARIO_DB_URL is not set, since it needs a database holding the application's planners.
 * Every run rewrites tests/scenarios/RESULTS.md and tests/scenarios/results/latest.json.
 */
import { SCENARIO_DB_URL, closeScenarioDb, loadScenarioData, type ScenarioData } from './support/db';
import { Transcript } from './support/transcript';
import { runMatching, runGraduation, runPathway } from './support/actual';
import { describeExpectation, graduationChecks, matchingChecks, pathwayChecks, type Check } from './support/checks';
import { writeReport, type ScenarioResult } from './support/report';
import { plannerDataChecks, type DataCheck } from './support/dataChecks';
import { buildScenarios, type Scenario } from './scenarios';

const suite = SCENARIO_DB_URL ? describe : describe.skip;
const scenarios = buildScenarios();
const results = new Map<string, ScenarioResult>();
let data: ScenarioData;
let dataChecks: DataCheck[] = [];

interface Ctx { sc: Scenario; t: Transcript; planner: ReturnType<ScenarioData['plannerBy']> }
const ctxCache = new Map<string, Ctx>();
function ctxOf(sc: Scenario): Ctx {
  if (!ctxCache.has(sc.id)) {
    const planner = data.plannerBy(...sc.planner);
    const t = new Transcript(planner, data);
    sc.build(t, data);
    ctxCache.set(sc.id, { sc, t, planner });
  }
  return ctxCache.get(sc.id)!;
}
function record(sc: Scenario, ctx: Ctx, checks: Check[], metrics: ScenarioResult['metrics'] = null) {
  const r = results.get(sc.id) ?? {
    scenario: { id: sc.id, group: sc.group, title: sc.title, story: sc.story },
    planner: ctx.planner.label,
    rows: ctx.t.rows.length,
    expectation: describeExpectation(sc, ctx.planner, ctx.t, data),
    checks: [],
    metrics: null,
  };
  r.checks.push(...checks);
  if (metrics) r.metrics = metrics;
  results.set(sc.id, r);
}
function expectAllPass(checks: Check[]) {
  const failed = checks.filter((c) => !c.pass).map((c) => `${c.name}\n    expected: ${c.expected}\n    actual:   ${c.actual}`);
  expect(failed).toEqual([]);
}

suite('student scenarios', () => {
  jest.setTimeout(60_000);

  beforeAll(async () => { data = await loadScenarioData(); });
  afterAll(async () => {
    const ordered = scenarios.map((s) => results.get(s.id)).filter((r): r is ScenarioResult => !!r);
    if (ordered.length) writeReport(ordered, dataChecks);
    await closeScenarioDb();
  });

  describe('the database planners match the official PDFs', () => {
    it('every planner and prerequisite list agrees with the PDFs', () => {
      dataChecks = plannerDataChecks(data);
      const failed = dataChecks.filter((c) => !c.pass).map((c) => `${c.area}: ${c.label}\n    PDF:      ${c.expected}\n    database: ${c.actual}`);
      expect(failed).toEqual([]);
    });
  });

  describe.each(scenarios.map((s) => [s.id, s.title, s] as const))('%s %s', (_id, _title, sc) => {
    it('matching: finds the planner the student belongs to', async () => {
      const ctx = ctxOf(sc);
      const intake = sc.studentIntake ?? { year: ctx.planner.intakeYear, semester: ctx.planner.intakeSemester };
      const actual = await runMatching(ctx.t, intake);
      const checks = matchingChecks(sc, ctx.planner, ctx.t, data, actual);
      record(sc, ctx, checks);
      expectAllPass(checks);
    });

    it('graduation audit: says whether they can graduate and what is missing', () => {
      const ctx = ctxOf(sc);
      const actual = runGraduation(ctx.planner, ctx.t);
      const checks = graduationChecks(ctx.planner, ctx.t, actual);
      record(sc, ctx, checks);
      expectAllPass(checks);
    });

    it('pathway: builds a fast, planner-aligned route to graduation', async () => {
      const ctx = ctxOf(sc);
      const actual = await runPathway(ctx.planner, ctx.t, data);
      const { checks, metrics } = pathwayChecks(sc, ctx.planner, ctx.t, data, actual);
      record(sc, ctx, checks, metrics);
      expectAllPass(checks);
    });
  });
});
