/**
 * The matching and the pathway features, run on the real seed data in a real database.
 *
 * The scenario suite checks these features against hand-built students. These tests check something different: that
 * the code and the data that ships with the app work together, for every planner in the seed.
 */
import { prisma } from '@core/db/client';
import { POST as customPlanner } from '@/app/api/custom-planner/route';
import { runDashboardMatch } from '@core/services/matching/dashboardMatch';
import { loadSeeds, resetDb, withClient } from './helpers';

type Planner = Awaited<ReturnType<typeof loadPlanners>>[number];
const loadPlanners = () => prisma.plannerTemplate.findMany({
  include: { major: true, units: { include: { unit: { include: { offerings: true, requisite_groups: { include: { conditions: { include: { unit: true } } } } } } } } },
  orderBy: [{ intake_year: 'asc' }, { intake_month: 'asc' }],
});

let planners: Planner[];
beforeAll(async () => {
  await resetDb();
  await withClient(loadSeeds);
  planners = await loadPlanners();
});
afterAll(() => prisma.$disconnect());

const unitCodes = (p: Planner, cats: string[], maxYear = 3) =>
  p.units.filter((t) => t.unit && cats.includes(t.category) && t.year_level <= maxYear).map((t) => t.unit!.unit_code);

const student = (p: Planner, completed: string[]) => ({
  studentID: '100000001', intakeYear: p.intake_year, intakeSemester: (p.intake_month ?? 1) >= 7 ? 2 : 1, completedUnitCodes: completed, hasWIL: false,
});

describe('major detection on the seed planners', () => {
  const majors = ['Artificial Intelligence', 'Cybersecurity', 'Data Science', 'Internet of Things', 'Software Development'];

  test('the seed holds the five majors that the tests expect', () => {
    expect([...new Set(planners.map((p) => p.major?.name))].sort()).toEqual(majors);
  });

  test.each(majors)('a student who followed the %s planner is detected as that major, on that planner', async (major) => {
    const p = planners.filter((x) => x.major?.name === major).at(-1)!;                 // the newest intake
    const { data } = await runDashboardMatch(student(p, unitCodes(p, ['core', 'major_core', 'prescribed_elective'])));

    expect(data.status).toBe('detected');
    expect(data.primaryMajor?.majorName).toBe(major);
    expect(data.rankedPlanners[0].plannerID).toBe(p.id);
    expect(data.primaryMajor?.matchPct).toBeGreaterThan(70);
  });

  test('a student with only the first-year core units is not given a major (all majors share them)', async () => {
    const p = planners.find((x) => x.major?.name === 'Data Science')!;
    const { data } = await runDashboardMatch(student(p, unitCodes(p, ['core'], 1)));
    expect(data.status).toBe('noMajorDetected');
    expect(data.primaryMajor).toBeNull();
    expect(data.topAlternatives.length).toBeGreaterThan(0);
  });

  test('a student with no units is not given a major', async () => {
    const p = planners[0];
    const { data } = await runDashboardMatch(student(p, []));
    expect(data.status).toBe('noMajorDetected');
  });

  test('the best planner is the one for the intake of the student when several intakes exist', async () => {
    const p = planners.find((x) => x.major?.name === 'Cybersecurity' && x.intake_year === 2024 && x.intake_month === 9)!;
    const { data } = await runDashboardMatch(student(p, unitCodes(p, ['core', 'major_core'])));
    expect(data.primaryMajor?.majorName).toBe('Cybersecurity');
    expect(data.rankedPlanners[0].plannerID).toBe(p.id);
  });

  test('a second major is reported only when the saved threshold allows it', async () => {
    const ai = planners.filter((x) => x.major?.name === 'Artificial Intelligence').at(-1)!;
    const ds = planners.filter((x) => x.major?.name === 'Data Science').at(-1)!;
    // everything the AI planner and the DS planner both ask for, plus the AI-only major units
    const completed = [...new Set([...unitCodes(ai, ['core', 'major_core']), ...unitCodes(ds, ['core', 'major_core']).slice(0, 12)])];

    await prisma.systemConfig.upsert({ where: { key: 'second_major_threshold' }, update: { value: '99' }, create: { key: 'second_major_threshold', value: '99' } });
    const strict = (await runDashboardMatch(student(ai, completed))).data;
    await prisma.systemConfig.upsert({ where: { key: 'second_major_threshold' }, update: { value: '10' }, create: { key: 'second_major_threshold', value: '10' } });
    const loose = (await runDashboardMatch(student(ai, completed))).data;
    await prisma.systemConfig.delete({ where: { key: 'second_major_threshold' } });

    expect(strict.secondMajor).toBeNull();
    expect(loose.secondMajor).not.toBeNull();
    expect(loose.secondMajor?.majorName).not.toBe(loose.primaryMajor?.majorName);
  });
});

describe('pathway for a new student, on every seed planner', () => {
  const plan = async (p: Planner) => {
    const res = await customPlanner(new Request('http://localhost/api/custom-planner', {
      method: 'POST', body: JSON.stringify({ plannerId: p.id, completedUnitCodes: [], courseList: [], concededPassUnitCodes: [], injectedMinorIds: [] }),
    }) as never);
    return { status: res.status, body: await res.json() };
  };

  // 50 planners: the checks run in one test per rule so that a failure names the rule and the planner
  let results: { planner: Planner; status: number; data: any; body: any }[];
  beforeAll(async () => {
    results = [];
    for (const p of planners) { const r = await plan(p); results.push({ planner: p, status: r.status, data: r.body.data, body: r.body } as any); }
  }, 120000);

  const label = (p: Planner) => `${p.major?.name} ${p.intake_year}-${p.intake_month}`;
  const placed = (r: (typeof results)[number]) => r.data.semesters.flatMap((s: any) => s.units.map((u: any) => ({ ...u, year: s.year, semester: s.semester })));

  test('the route answers 200 for every planner', () => {
    expect(results.filter((r) => r.status !== 200).map((r) => label(r.planner))).toEqual([]);
  });

  // The work placement is not planned inside a semester. It gets a break milestone instead (checked in the next test).
  const WIL = ['ICT20016', 'ICT20016*Optional'];

  // Units that the scheduler cannot place, with the reason. These are DATA problems in the seed, found by this test.
  // Fix the data, then remove the entry here. A unit that is not listed here and cannot be placed is a new bug.
  // (none left) The 2022 planners use COS10011 as the first-year web unit and the later ones use COS10026. SWE30011 and COS30015
  // used to accept only one of them, so they could not be placed in the other planners. Each now has a requisite group for both.
  const KNOWN_UNPLACEABLE: { code: string; where: (p: Planner) => boolean }[] = [];
  const isKnown = (p: Planner, code: string) => KNOWN_UNPLACEABLE.some((k) => k.code === code && k.where(p));

  test('every unit of the planner is placed in a semester, apart from the work placement and the known data problems', () => {
    const bad = results.flatMap((r) => r.data.unschedulableUnits
      .map((u: any) => u.code as string)
      .filter((code: string) => !WIL.includes(code) && !isKnown(r.planner, code))
      .map((code: string) => `${label(r.planner)}: ${code}`));
    expect(bad).toEqual([]);
  });

  test('every known data problem is still there (when this fails, the data was fixed: remove the entry above)', () => {
    for (const k of KNOWN_UNPLACEABLE) {
      const affected = results.filter((r) => k.where(r.planner));
      expect(affected.length).toBeGreaterThan(0);
      expect(affected.some((r) => r.data.unschedulableUnits.some((u: any) => u.code === k.code))).toBe(true);
    }
  });

  test('SWE30011 and COS30015 are placed in the planners of every intake, whichever web unit the planner uses', () => {
    for (const code of ['SWE30011', 'COS30015']) {
      const planned = results.filter((r) => r.planner.units.some((t) => t.unit?.unit_code === code));
      expect(planned.length).toBeGreaterThan(10);
      expect(planned.filter((r) => !placed(r).some((u: any) => u.code === code)).map((r) => label(r.planner))).toEqual([]);
    }
    expect(new Set(results.filter((r) => r.planner.units.some((t) => t.unit?.unit_code === 'SWE30011')).map((r) => r.planner.intake_year))).toEqual(new Set([2022, 2023, 2024, 2025, 2026]));
  });

  test('the work placement of every planner gets one break milestone, in a year that exists', () => {
    const bad: string[] = [];
    for (const r of results) {
      const wil = r.planner.units.find((t) => t.category === 'wil' && t.unit && !WIL.includes('x' + t.unit.unit_code) && t.unit.unit_code === 'ICT20016');
      if (!wil) continue;
      const m = r.body.breakMilestones.filter((x: any) => x.unitCode === 'ICT20016');
      if (m.length !== 1) { bad.push(`${label(r.planner)}: ${m.length} milestones`); continue; }
      if (!m[0].availableBreakSlots.length || !/YEAR \d/.test(m[0].breakTermName)) bad.push(`${label(r.planner)}: no usable break`);
    }
    expect(bad).toEqual([]);
  });

  test('each planned unit is placed once (empty elective slots repeat by design), and no compulsory unit is lost', () => {
    const bad: string[] = [];
    for (const r of results) {
      const codes: string[] = placed(r).map((u: any) => u.code);
      const dup = codes.filter((c, i) => c !== 'ELECTIVE' && codes.indexOf(c) !== i);
      // A plain elective that the student cannot take is replaced by a recommended one, by design. The compulsory units are not.
      const named = r.planner.units.filter((t) => t.unit && ['core', 'major_core', 'prescribed_elective'].includes(t.category)).map((t) => t.unit!.unit_code);
      const missing = named.filter((c) => !codes.includes(c) && !WIL.includes(c) && !isKnown(r.planner, c));
      if (dup.length || missing.length) bad.push(`${label(r.planner)} duplicate=[${dup}] missing=[${missing}]`);
    }
    expect(bad).toEqual([]);
  });

  test('no semester has more than 4 units', () => {
    const bad = results.flatMap((r) => r.data.semesters.filter((s: any) => s.units.length > 4).map((s: any) => `${label(r.planner)} Y${s.year}S${s.semester}: ${s.units.length}`));
    expect(bad).toEqual([]);
  });

  test('every unit is placed in a term in which it runs', () => {
    const bad: string[] = [];
    for (const r of results) {
      const intakeSemester = (r.planner.intake_month ?? 1) >= 7 ? 2 : 1;
      const runs = new Map(r.planner.units.filter((t) => t.unit).map((t) => [t.unit!.unit_code, new Set(t.unit!.offerings.map((o) => o.offered_in))]));
      for (const u of placed(r)) {
        const offered = runs.get(u.code);
        if (!offered || !offered.size) continue;
        const term = u.semester <= 2 ? ((u.semester - 1 + (intakeSemester - 1)) % 2) + 1 : u.semester;     // 3 and 4 are the breaks
        if (!offered.has(term)) bad.push(`${label(r.planner)}: ${u.code} in Y${u.year}S${u.semester} (term ${term}), runs in [${[...offered]}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('a unit is never placed before the units that it needs (prerequisites, checked from the database)', () => {
    const bad: string[] = [];
    for (const r of results) {
      const order = (u: { year: number; semester: number }) => (u.year - 1) * 4 + u.semester;
      const when = new Map<string, number>(placed(r).map((u: any) => [u.code, order(u)]));
      for (const t of r.planner.units) {
        if (!t.unit || !when.has(t.unit.unit_code)) continue;
        const groups = t.unit.requisite_groups.map((g) => g.conditions.filter((c) => c.requisite_type === 'prerequisite' && c.unit));
        const nonEmpty = groups.filter((g) => g.length);
        if (!nonEmpty.length) continue;
        const mine = when.get(t.unit.unit_code)!;
        // one group must be satisfied: all of its units placed in an earlier semester
        const ok = nonEmpty.some((g) => g.every((c) => (when.get(c.unit!.unit_code) ?? -1) >= 0 && when.get(c.unit!.unit_code)! < mine));
        if (!ok) bad.push(`${label(r.planner)}: ${t.unit.unit_code} (Y${Math.floor((mine - 1) / 4) + 1}) before its prerequisites`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('the plan follows the planner: no core unit is planned more than one semester earlier than the planner puts it', () => {
    const bad: string[] = [];
    for (const r of results) {
      const slot = (y: number, s: number) => (y - 1) * 2 + (s - 1);
      const planned = new Map<string, number>(placed(r).filter((u: any) => u.semester <= 2).map((u: any) => [u.code, slot(u.year, u.semester)]));
      for (const t of r.planner.units) {
        if (!t.unit || t.category !== 'core' || t.semester > 2) continue;
        const at = planned.get(t.unit.unit_code);
        if (at !== undefined && at < slot(t.year_level, t.semester) - 1) bad.push(`${label(r.planner)}: ${t.unit.unit_code} planned in slot ${at}, the planner has slot ${slot(t.year_level, t.semester)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
