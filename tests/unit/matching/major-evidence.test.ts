import { majorEvidence, unitsOnPlanner } from '@core/services/matching/majorEvidence';
import { detectMajors } from '@core/services/matching/majorDetector';
import { runMatchingPipeline } from '@core/services/matching/matchingService';
import type { PlannerTemplate, UnitMasterEntry } from '@shared/types/matching';

const planner = (id: string, majorName: string, over: Partial<PlannerTemplate> = {}): PlannerTemplate => ({
  plannerID: id, majorName, courseType: 'degree', intakeYear: 2025, intakeSemester: 2, durationSemesters: 6,
  requiredCore: ['CORE1', 'CORE2'], requiredMajorCore: new Set<string>(), prescribedElectiveCategories: [],
  freeElectivePool: new Set<string>(), freeElectiveSlotsRequired: 0, ...over,
});
const alpha = planner('a', 'Alpha', { requiredMajorCore: new Set(['A_ONLY', 'A_AND_B_ELECTIVE']) });
const beta = planner('b', 'Beta', { requiredMajorCore: new Set(['B_ONLY']), freeElectivePool: new Set(['A_AND_B_ELECTIVE']) });

describe('majorEvidence', () => {
  it('counts only units that sit on one major\'s planner', () => {
    const e = majorEvidence([alpha, beta], new Set(['CORE1', 'A_ONLY', 'A_AND_B_ELECTIVE']));
    expect(e.get('Alpha')).toBe(1);   // CORE1 is shared, A_AND_B_ELECTIVE is named by both
    expect(e.get('Beta')).toBe(0);
  });

  it('treats several versions of one major as one major', () => {
    const alpha2 = planner('a2', 'Alpha', { intakeSemester: 1, requiredMajorCore: new Set(['A_ONLY']) });
    const e = majorEvidence([alpha, alpha2, beta], new Set(['A_ONLY']));
    expect(e.get('Alpha')).toBe(1);
  });

  it('ignores the prescribed-elective pools, which only list units a student may choose', () => {
    const withPool = planner('b2', 'Beta', { prescribedElectiveCategories: [{ categoryCode: 'x', pool: new Set(['A_ONLY']), slots: 1 }] });
    expect(unitsOnPlanner(withPool).has('A_ONLY')).toBe(false);
    expect(majorEvidence([alpha, withPool], new Set(['A_ONLY'])).get('Alpha')).toBe(1);
  });

  it('gives every major a count of zero when nothing has been taken', () => {
    const e = majorEvidence([alpha, beta], new Set());
    expect([...e.values()]).toEqual([0, 0]);
  });
});

describe('detectMajors with evidence', () => {
  const scores = [
    { plannerID: 'a', majorName: 'Alpha', majorCoreScore: 0.1, matchPct: 40 },
    { plannerID: 'b', majorName: 'Beta', majorCoreScore: 0, matchPct: 35 },
  ] as never;
  const config = { noMajorThreshold: 0.3, secondMajorThreshold: 0.7 } as never;
  const student = {} as never;

  it('names the top major when it has evidence', () => {
    const r = detectMajors(scores, config, student, new Map([['Alpha', 1], ['Beta', 0]]));
    expect(r.status).toBe('detected');
    expect(r.primaryMajor?.plannerID).toBe('a');
  });

  it('says no major when the top major has none, but keeps the ranked list for the alternatives panel', () => {
    const r = detectMajors(scores, config, student, new Map([['Alpha', 0], ['Beta', 0]]));
    expect(r.status).toBe('noMajorDetected');
    expect(r.primaryMajor).toBeNull();
    expect(r.rankedPlanners.map((p) => p.plannerID)).toEqual(['a', 'b']);
  });

  it('is unchanged when no evidence is supplied', () => {
    expect(detectMajors(scores, config, student).status).toBe('detected');
  });

  it('never overrides an advisor\'s manual choice', () => {
    const r = detectMajors(scores, config, { manualOverride: 'b' } as never, new Map([['Alpha', 0], ['Beta', 0]]));
    expect(r.status).toBe('overridden');
    expect(r.primaryMajor?.plannerID).toBe('b');
  });
});

describe('matching pipeline end to end', () => {
  const master: UnitMasterEntry[] = [
    { code: 'CORE1', name: '', category: 'core', creditHours: 12.5, subjectTags: [], requisites: [] },
    { code: 'CORE2', name: '', category: 'core', creditHours: 12.5, subjectTags: [], requisites: [] },
    { code: 'A_ONLY', name: '', category: 'majorCore', creditHours: 12.5, subjectTags: [], requisites: [] },
  ];
  const run = (completed: string[], requireMajorEvidence?: boolean) =>
    runMatchingPipeline({
      student: { studentID: 's', courseType: 'degree', intakeYear: 2025, intakeSemester: 2, currentSemester: 1, completedUnitCodes: completed, hasWIL: false },
      planners: [alpha, beta], unitMasterTable: master,
      config: { preferIntakeYear: false, ...(requireMajorEvidence === undefined ? {} : { requireMajorEvidence }) },
    }).payload;

  it('a student with only core units gets no major', () => {
    expect(run(['CORE1', 'CORE2']).status).toBe('noMajorDetected');
  });
  it('a student with a major-specific unit gets that major', () => {
    const p = run(['CORE1', 'CORE2', 'A_ONLY']);
    expect(p.status).toBe('detected');
    expect(p.primaryMajor?.majorName).toBe('Alpha');
  });
  it('the rule can be switched off', () => {
    expect(run(['CORE1', 'CORE2'], false).status).toBe('detected');
  });
});
