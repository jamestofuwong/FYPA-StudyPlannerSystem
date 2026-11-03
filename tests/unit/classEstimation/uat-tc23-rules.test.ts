// ============================================================
// UAT TC-23: the class estimation rules fixed after UAT, checked end to end through runEstimationPreview
// (mapper -> matching -> candidates -> eligibility -> ranker -> aggregation), with only the repositories mocked.
// The single-module tests cover each rule on its own; this file checks that the rules still hold once
// every phase has handed its output to the next.
//
// Software Development planners for both 2024 intakes, so picking the wrong one is visible:
//   y1s1 A1 A2 A3 [A4 | F4 on Feb/Mar]   y1s2 B1 B2 B3 B4   y2s1 C1 C2 C3 C4   y2s2 D1 FREE1
// The bracketed unit, B4 and C4 are major core. B1 is listed as both core and major core. B2 is also in
// the prescribed elective pool, with POOLX. FREE1 is a free elective.
// A Cybersecurity planner per intake has CY1, CY2, CY3 as its major core instead. Without a second major no
// unit is exclusive to one, and the matcher rightly falls back to the shared core with no planner.
// Every unit runs in both semesters and has no requisites, so only the rules under test decide the picks.
// Test students are in Year 2: a student one semester in matches below the no-major threshold.
// ============================================================

import { runEstimationPreview, type PreviewOptions } from '@core/services/classEstimation/estimationPreview';
import { buildEstimationRecord } from '@core/services/classEstimation/estimationRecordBuilder';
import * as plannerRepository from '@core/db/repositories/plannerRepository';
import * as unitRepository from '@core/db/repositories/unitRepository';
import type { EstimationRecord } from '@shared/types/classEstimation';
import type { ScrapedStudent } from '@shared/types/student';

jest.mock('@core/db/repositories/plannerRepository');
jest.mock('@core/db/repositories/unitRepository');

const getAllPlannersWithUnits = jest.mocked(plannerRepository.getAllPlannersWithUnits);
const getPlannerById = jest.mocked(plannerRepository.getPlannerById);
const getAllUnits = jest.mocked(unitRepository.getAllUnits);

const ALL_CODES = ['A1', 'A2', 'A3', 'A4', 'F4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'CY1', 'CY2', 'CY3', 'POOLX', 'FREE1'];
const dbUnit = (code: string) => ({ unit_code: code, unit_name: `Unit ${code}`, offerings: [{ offered_in: 1 }, { offered_in: 2 }], requisite_groups: [] });

function planner(id: string, intakeMonth: number, major: string, [mc1, mc2, mc3]: [string, string, string]) {
  const slot = (category: string, yearLevel: number, semester: number, code: string) =>
    ({ category, year_level: yearLevel, semester, unit: dbUnit(code) });
  return {
    id,
    major: { name: major },
    course: { name: 'Bachelor of Computer Science' },
    intake_year: 2024,
    intake_month: intakeMonth,
    course_type: 'degree',
    duration_semesters: 6,
    units: [
      slot('core', 1, 1, 'A1'), slot('core', 1, 1, 'A2'), slot('core', 1, 1, 'A3'), slot('major_core', 1, 1, mc1),
      slot('core', 1, 2, 'B1'), slot('major_core', 1, 2, 'B1'), slot('core', 1, 2, 'B2'), slot('core', 1, 2, 'B3'), slot('major_core', 1, 2, mc2),
      slot('core', 2, 1, 'C1'), slot('core', 2, 1, 'C2'), slot('core', 2, 1, 'C3'), slot('major_core', 2, 1, mc3),
      slot('core', 2, 2, 'D1'), slot('elective', 2, 2, 'FREE1'),
    ],
    elective_groups: [{ id: `${id}-pool`, units: [{ unit: dbUnit('B2') }, { unit: dbUnit('POOLX') }] }],
  };
}

const PLANNERS = [
  planner('feb24', 2, 'Software Development', ['F4', 'B4', 'C4']),
  planner('sep24', 9, 'Software Development', ['A4', 'B4', 'C4']),
  planner('cybFeb24', 2, 'Cybersecurity', ['CY1', 'CY2', 'CY3']),
  planner('cybSep24', 9, 'Cybersecurity', ['CY1', 'CY2', 'CY3']),
];

type Row = [code: string, grade: string, term: string];
function student(id: string, rows: Row[]): EstimationRecord {
  const courseList = rows.map(([courseId, grade, term]) => ({
    courseId, courseTitle: courseId, level: '', credits: 12.5,
    creditsEarned: grade === 'N' ? 0 : 12.5, status: 'Complete', grade, term,
  }));
  const scraped: ScrapedStudent = {
    course: 'Bachelor of Computer Science', status: 'Active', cgpa: 3, creditsRequired: 300, creditsCompleted: 100,
    gradeLevel: '', enrollmentDate: '', graduationDate: null, scheduledCredits: 0, courseList,
  };
  return buildEstimationRecord({
    source: 'import', studentId: id, name: `Student ${id}`, dbId: 1, enrollId: 1, scraped, transcript: courseList,
    config: { loadCap: 4, retentionRate: 1, defaultHasWIL: false },
  });
}

const taken = (codes: string[], term: string, grade = 'D'): Row[] => codes.map((code) => [code, grade, term]);

/**
 * Aug/Sept 2024 Software Development, Year 1 done: A units in 2024_SEP_S1, B units in 2025_MAR_S2.
 * Aug/Sept 2025 is their Year 2, Semester 1: C1 to C4.
 */
const septYearOneDone = (id: string, a1Grade = 'D') => student(id, [
  ['A1', a1Grade, '2024_SEP_S1'], ...taken(['A2', 'A3', 'A4'], '2024_SEP_S1'),
  ...taken(['B1', 'B2', 'B3', 'B4'], '2025_MAR_S2'),
]);

const AUG_SEPT_2025: PreviewOptions = { targetTerm: 2, targetYear: 2025, loadCap: 4, retentionRate: 1, newIntakeCount: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  getAllPlannersWithUnits.mockResolvedValue(PLANNERS as never);
  getPlannerById.mockImplementation(async (id: string) => PLANNERS.find((p) => p.id === id) as never);
  getAllUnits.mockResolvedValue(ALL_CODES.map((code) => ({ unit_code: code, unit_name: `Unit ${code}`, offerings: [1, 2], requisites: [] })) as never);
});

describe('intake is read before anything is counted', () => {
  test('2024_SEP_S1 is an Aug/Sept 2024 intake and uses the Aug/Sept 2024 planner', async () => {
    const { students } = await runEstimationPreview([septYearOneDone('S1')], AUG_SEPT_2025);
    expect(students[0].intake).toEqual({ year: 2024, semester: 2 });
    expect(students[0].planner?.id).toBe('sep24');
  });

  test('2024_FEB_S1 is a Feb/Mar 2024 intake and uses the Feb/Mar 2024 planner', async () => {
    const feb = student('F1', [...taken(['A1', 'A2', 'A3', 'F4'], '2024_FEB_S1'), ...taken(['B1', 'B2', 'B3', 'B4'], '2024_SEP_S2')]);
    const { students } = await runEstimationPreview([feb], AUG_SEPT_2025);
    expect(students[0].intake).toEqual({ year: 2024, semester: 1 });
    expect(students[0].planner?.id).toBe('feb24');
  });

  test('a first term labelled FEB_S2 is read as the previous Aug/Sept intake, with a warning', async () => {
    const late = student('L1', [...taken(['A1', 'A2', 'A3', 'A4'], '2025_FEB_S2'), ...taken(['B1', 'B2', 'B3', 'B4'], '2025_SEP_S1')]);
    const { students } = await runEstimationPreview([late], { ...AUG_SEPT_2025, targetYear: 2026 });
    expect(students[0].intake).toEqual({ year: 2024, semester: 2 });
    expect(students[0].planner?.id).toBe('sep24');
    expect(students[0].mappingWarnings.some((w) => w.startsWith('intake read as the previous September'))).toBe(true);
  });

  test('an intake year with no planner falls back to a planner of the same intake semester', async () => {
    // Units both intakes' planners share, so the score cannot tell them apart and only the fallback decides.
    const sept2026 = student('N1', [...taken(['A1', 'A2', 'A3'], '2026_SEP_S1'), ...taken(['B1', 'B2', 'B3', 'B4'], '2027_MAR_S2')]);
    const feb2026 = student('N2', [...taken(['A1', 'A2', 'A3'], '2026_MAR_S1'), ...taken(['B1', 'B2', 'B3', 'B4'], '2026_SEP_S2')]);
    const { students } = await runEstimationPreview([sept2026, feb2026], { ...AUG_SEPT_2025, targetYear: 2027 });
    expect(students.find((s) => s.studentId === 'N1')!.planner?.id).toBe('sep24');
    expect(students.find((s) => s.studentId === 'N2')!.planner?.id).toBe('feb24');
  });
});

describe('ranking follows the planner, then failed units, under the load cap', () => {
  test("the planner's next semester fills the cap before a failed unit", async () => {
    const { students } = await runEstimationPreview([septYearOneDone('S1', 'N')], AUG_SEPT_2025);
    const [s] = students;
    expect(s.picked.map((u) => u.code).sort()).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(s.droppedByLoadCap).toBe(2); // A1 (failed) and D1 (a later slot)
  });

  // Feb/Mar 2026 is this student's Year 2, Semester 2 (D1). They skipped B3 (Year 1) and failed or skipped C1
  // (Year 2). Earliest slot first would take B3; the rule takes the failed C1 first.
  const behindAndFailed = (id: string, c1: 'failed' | 'skipped') => student(id, [
    ...taken(['A1', 'A2', 'A3', 'A4'], '2024_SEP_S1'), ...taken(['B1', 'B2', 'B4'], '2025_MAR_S2'),
    ...(c1 === 'failed' ? taken(['C1'], '2025_SEP_S1', 'N') : []), ...taken(['C2', 'C3', 'C4'], '2025_SEP_S1'),
  ]);
  const FEB_MAR_2026_CAP_2: PreviewOptions = { ...AUG_SEPT_2025, targetTerm: 1, targetYear: 2026, loadCap: 2 };

  test('after the planner slot, a failed unit comes before an earlier unit that was skipped', async () => {
    const { students } = await runEstimationPreview([behindAndFailed('S1', 'failed')], FEB_MAR_2026_CAP_2);
    expect(students[0].picked.map((u) => u.code)).toEqual(['D1', 'C1']);
  });

  test('students who differ only by a failed unit are not batched together', async () => {
    const { students, summary } = await runEstimationPreview(
      [behindAndFailed('P1', 'skipped'), behindAndFailed('P2', 'failed')],
      FEB_MAR_2026_CAP_2,
    );
    expect(summary.grouping.groups).toBe(2);
    expect(students.find((s) => s.studentId === 'P1')!.picked.map((u) => u.code)).toEqual(['D1', 'B3']);
    expect(students.find((s) => s.studentId === 'P2')!.picked.map((u) => u.code)).toEqual(['D1', 'C1']);
  });
});

describe('no double counting', () => {
  test('a unit listed as core and major core takes one seat, and is not also an elective share', async () => {
    // Behind on Year 1, Semester 2: still owes B1, B2 and B4.
    const behind = (id: string) => student(id, [
      ...taken(['A1', 'A2', 'A3', 'A4'], '2024_SEP_S1'), ...taken(['B3'], '2025_MAR_S2'), ...taken(['C1', 'C2', 'C3', 'C4'], '2025_SEP_S1'),
    ]);
    const { students, summary } = await runEstimationPreview([behind('S1'), behind('S2')], { ...AUG_SEPT_2025, targetTerm: 1, targetYear: 2026 });
    for (const s of students) {
      expect(s.planner?.id).toBe('sep24');
      expect(s.picked.filter((u) => u.code === 'B1')).toHaveLength(1);
      expect(s.picked.length).toBeLessThanOrEqual(4);
    }
    const b1 = summary.projectedByUnit.find((u) => u.code === 'B1')!;
    const b2 = summary.projectedByUnit.find((u) => u.code === 'B2')!;
    expect(b1.fromNamedPicks).toBe(2);
    expect(b2.fromNamedPicks).toBe(2);
    expect(b2.fromElectives).toBe(0); // B2 is required, so it is not shared out again from the pool
  });
});

describe('seats split into Needed to graduate and Optional', () => {
  test('free elective shares are kept apart from required and prescribed seats', async () => {
    // Every named unit done, so only the pool (POOLX) and the free elective (FREE1) are left.
    const allDone = student('Y2', [
      ...taken(['A1', 'A2', 'A3', 'A4'], '2024_SEP_S1'), ...taken(['B1', 'B2', 'B3', 'B4'], '2025_MAR_S2'),
      ...taken(['C1', 'C2', 'C3', 'C4'], '2025_SEP_S1'), ...taken(['D1'], '2026_MAR_S2'),
    ]);
    const { summary } = await runEstimationPreview([allDone], AUG_SEPT_2025);

    const free1 = summary.projectedByUnit.find((u) => u.code === 'FREE1');
    const poolx = summary.projectedByUnit.find((u) => u.code === 'POOLX');
    expect(free1).toBeDefined();
    expect(poolx).toBeDefined();
    expect(free1!.fromFreeElectives).toBeGreaterThan(0);
    expect(free1!.fromFreeElectives).toBeCloseTo(free1!.fromElectives, 10);
    expect(poolx!.fromElectives).toBeGreaterThan(0);
    expect(poolx!.fromFreeElectives).toBe(0); // prescribed, so it counts as needed to graduate
  });
});

describe('new intake follows the target intake', () => {
  test('an Aug/Sept target puts new students on the Aug/Sept Year 1, Semester 1 units', async () => {
    const { summary } = await runEstimationPreview([septYearOneDone('S1')], { ...AUG_SEPT_2025, targetYear: 2024, newIntakeCount: 30 });
    expect(summary.newIntake.basedOnIntakeSemester).toBe(2);
    expect(summary.newIntake.units).toContain('A4');
    expect(summary.newIntake.units).not.toContain('F4');
    expect(summary.projectedByUnit.find((u) => u.code === 'A1')!.fromNewIntake).toBe(30);
    expect(summary.projectedByUnit.find((u) => u.code === 'F4')?.fromNewIntake ?? 0).toBe(0);
  });

  test('a Feb/Mar target puts them on the Feb/Mar Year 1, Semester 1 units', async () => {
    const { summary } = await runEstimationPreview([septYearOneDone('S1')], { ...AUG_SEPT_2025, targetTerm: 1, targetYear: 2024, newIntakeCount: 30 });
    expect(summary.newIntake.basedOnIntakeSemester).toBe(1);
    expect(summary.newIntake.units).toContain('F4');
    expect(summary.newIntake.units).not.toContain('A4');
  });
});
