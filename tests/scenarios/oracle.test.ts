/**
 * Tests the expectation rules the scenario suite relies on, with tiny hand-made planners and no database.
 * If these fail the SUITE is wrong, which is different from a scenario failing because the application is.
 */
import type { PlannerView, ScenarioData, UnitInfo } from './support/db';
import type { Row } from './support/transcript';
import {
  expectedGraduation, expectedMatch, lowerBoundSemesters, nextCalendarTerm, pathwayNeed, validatePlanAgainstRules, wilCountsAsElectives,
} from './support/oracle';

const u = (code: string, category: PlannerView['units'][number]['category'], year = 1, semester = 1) => ({ code, name: code, category, year, semester });
const planner = (over: Partial<PlannerView> = {}): PlannerView => ({
  id: 'p', major: 'Alpha', intakeYear: 2025, intakeMonth: 9, intakeSemester: 2, label: 'Alpha',
  coreCp: 25, majorCp: 25, electiveCp: 25, wilCp: 25, electiveCount: 2,
  units: [u('CORE1', 'core'), u('CORE2', 'core', 1, 2), u('MAJ1', 'major_core', 2, 1), u('PRE1', 'prescribed_elective', 1, 2), u('ELE1', 'elective', 2, 2), u('WIL1', 'wil', 2, 3)],
  openSlots: [], electiveGroupCodes: [], ...over,
});
const info = (code: string, over: Partial<UnitInfo> = {}): UnitInfo => ({ code, name: code, isActive: true, replacedBy: null, offered: [1, 2], groups: [], ...over });
const dataOf = (units: UnitInfo[], planners: PlannerView[] = [planner()]): ScenarioData => ({
  planners, units: new Map(units.map((x) => [x.code, x])), plannerBy: () => planners[0],
});
const row = (courseId: string, grade: string, status: Row['status'] = 'Complete', term = '2025_SEP_S2'): Row => ({ courseId, courseTitle: courseId, level: '', credits: 12.5, creditsEarned: grade === 'N' ? 0 : 12.5, status, grade, term });

describe('graduation rules', () => {
  it('graduates only when every compulsory unit is passed and elective credit is met', () => {
    const rows = [row('CORE1', 'D'), row('CORE2', 'D'), row('MAJ1', 'C'), row('PRE1', 'P'), row('ELE1', 'D'), row('WIL1', 'P')].map((r) => (r.courseId === 'WIL1' ? { ...r, credits: 25, creditsEarned: 25 } : r));
    expect(expectedGraduation(planner({ electiveCp: 25 }), rows).missingCompulsory).toEqual([]);
  });
  it('a failed core unit blocks graduation and is listed', () => {
    const g = expectedGraduation(planner(), [row('CORE1', 'N'), row('CORE2', 'D'), row('MAJ1', 'C')]);
    expect(g.eligible).toBe(false);
    expect(g.missingCompulsory).toContain('CORE1');
  });
  it('a later supplementary pass clears an earlier fail', () => {
    const g = expectedGraduation(planner(), [row('CORE1', 'N'), row('CORE1', 'SP')]);
    expect(g.missingCompulsory).not.toContain('CORE1');
  });
  it('two Conceded Passes block graduation, one does not', () => {
    const base = [row('CORE1', 'CP'), row('CORE2', 'CP')];
    expect(expectedGraduation(planner(), base).reasons.join()).toMatch(/Conceded/);
    expect(expectedGraduation(planner(), [row('CORE1', 'CP')]).reasons.join()).not.toMatch(/Conceded/);
  });
  it('a unit still in progress is not passed', () => {
    const g = expectedGraduation(planner(), [row('CORE1', '', 'Current')]);
    expect(g.inProgress).toEqual(['CORE1']);
    expect(g.missingCompulsory).toContain('CORE1');
  });
  it('an exemption (complete, no grade) counts as passed', () => {
    expect(expectedGraduation(planner(), [{ ...row('CORE1', ''), term: '' }]).missingCompulsory).not.toContain('CORE1');
  });
  it('on older planners the WIL placement counts as two electives', () => {
    expect(wilCountsAsElectives(planner({ wilCp: null }))).toBe(true);
    expect(wilCountsAsElectives(planner({ wilCp: 25 }))).toBe(false);
  });
});

describe('matching evidence', () => {
  const a = planner({ major: 'Alpha', units: [u('SHARED', 'core'), u('A_ONLY', 'major_core'), u('BOTH', 'major_core')] });
  const b = planner({ id: 'q', major: 'Beta', units: [u('SHARED', 'core'), u('B_ONLY', 'major_core'), u('BOTH', 'elective')] });
  const data = dataOf([], [a, b]);
  it('units shared by several majors are not evidence', () => {
    const m = expectedMatch(data, { year: 2025, month: 9 }, [row('SHARED', 'D'), row('BOTH', 'D')]);
    expect(m.hasEvidence).toBe(false);
  });
  it('a unit unique to one major points to it', () => {
    const m = expectedMatch(data, { year: 2025, month: 9 }, [row('A_ONLY', 'D')]);
    expect(m.candidateMajors).toEqual(['Alpha']);
    expect(m.unambiguous).toBe(true);
  });
  it('equal evidence leaves the major tied', () => {
    const m = expectedMatch(data, { year: 2025, month: 9 }, [row('A_ONLY', 'D'), row('B_ONLY', 'D')]);
    expect(m.candidateMajors.sort()).toEqual(['Alpha', 'Beta']);
  });
});

describe('pathway rules', () => {
  const units = [
    info('CORE1'), info('CORE2', { groups: [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'CORE1' }]] }),
    info('MAJ1', { offered: [1] }), info('PRE1'), info('ELE1'), info('WIL1', { offered: [3, 4] }),
  ];
  const data = dataOf(units);
  const p = planner();

  it('lists exactly the units not yet passed', () => {
    const need = pathwayNeed(p, [row('CORE1', 'D')], data);
    expect(need.required.sort()).toEqual(['CORE2', 'MAJ1', 'PRE1']);
  });
  it('a Conceded Pass prerequisite forces a retake', () => {
    const need = pathwayNeed(p, [row('CORE1', 'CP')], data);
    expect(need.forcedRetakes).toEqual(['CORE1']);
    expect(need.required).toContain('CORE1');
  });
  it('flags a unit placed before its prerequisite', () => {
    const need = pathwayNeed(p, [], data);
    const bad = validatePlanAgainstRules([{ year: 1, semester: 1, units: [{ code: 'CORE2', category: 'core' }] }], p, data, need, 0);
    expect(bad.map((v) => v.problem).join()).toMatch(/requisites not met/);
  });
  it('accepts the prerequisite in an earlier semester', () => {
    const need = pathwayNeed(p, [], data);
    const ok = validatePlanAgainstRules([
      { year: 1, semester: 1, units: [{ code: 'CORE1', category: 'core' }] },
      { year: 1, semester: 2, units: [{ code: 'CORE2', category: 'core' }] },
    ], p, data, need, 0);
    expect(ok).toEqual([]);
  });
  it('flags a unit placed in a term it is not offered', () => {
    const need = pathwayNeed(p, [], data);
    // Sep intake: study semester 1 runs in calendar term 2, MAJ1 only runs in term 1
    const bad = validatePlanAgainstRules([{ year: 1, semester: 1, units: [{ code: 'MAJ1', category: 'major_core' }] }], p, data, need, 0);
    expect(bad.map((v) => v.problem).join()).toMatch(/not offered/);
  });
  it('flags more than four standard units in a semester', () => {
    const many = ['CORE1', 'PRE1', 'ELE1', 'MAJ1', 'CORE2'].map((code) => ({ code, category: 'core' }));
    const bad = validatePlanAgainstRules([{ year: 1, semester: 2, units: many }], p, data, pathwayNeed(p, [], data), 0);
    expect(bad.map((v) => v.problem).join()).toMatch(/maximum 4/);
  });
  it('the minimum length is at least the prerequisite chain and at least units / 4', () => {
    const need = pathwayNeed(p, [], data);
    const lb = lowerBoundSemesters(p, data, need, 0, 1);
    expect(lb.chain).toBeGreaterThanOrEqual(2);
    expect(lb.bound).toBeGreaterThanOrEqual(Math.ceil((need.required.length + need.electiveUnits) / 4));
  });
});

describe('next calendar semester', () => {
  it('follows the latest completed term, ignoring pre-enrolled ones', () => {
    const rows = [row('A', 'D', 'Complete', '2026_MAR_S1'), row('B', '', 'Future', '2026_SEP_S2')];
    expect(nextCalendarTerm(rows, 2).term).toBe(2);
  });
  it('a gap in study does not change what comes next', () => {
    expect(nextCalendarTerm([row('A', 'D', 'Complete', '2026_SEP_S2')], 2).term).toBe(1);
  });
  it('with nothing on record the student starts at their intake semester', () => {
    expect(nextCalendarTerm([], 2).term).toBe(2);
  });
});
