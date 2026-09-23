// ============================================================
// Tests for core/services/classEstimation/estimationPreview.ts.
// Unlike the other classEstimation tests, this one doesn't isolate a single module, it runs the real chain end to end
// (scrapedStudentMapper -> runMatchingPipeline -> resolver -> eligibility filter -> ranker) against one planner fixture,
// with only the two repositories mocked. That's the point of the preview: those phases had only ever been tested in
// isolation, so this is where a mismatch between what one phase produces and what the next expects would show up.
//
// Fixture planner (intake Feb 2024, so semester 1):
//   core        COS10009 (y1s1), COS20007 (y2s1), COS30008 (y2s2, needs COS20007, offered sem 2)
//   major_core  COS20015 (y2s1), COS30049 (y3s1, needs 100 credit points, no offering rows)
//   elective    FREE1 (y3s2, needs COS99999, which nobody has), plus one unslotted pool group holding POOL1 (offered sem 1 only)
// ============================================================

import { runEstimationPreview } from '@core/services/classEstimation/estimationPreview';
import { mapScrapedStudentToRawInput } from '@core/services/classEstimation/scrapedStudentMapper';
import { resolveUnitStates } from '@shared/constants/grades';
import * as plannerRepository from '@core/db/repositories/plannerRepository';
import * as unitRepository from '@core/db/repositories/unitRepository';
import type { EstimationRecord } from '@shared/types/classEstimation';
import type { ScrapedStudent } from '@shared/types/student';

jest.mock('@core/db/repositories/plannerRepository');
jest.mock('@core/db/repositories/unitRepository');

const getAllPlannersWithUnits = jest.mocked(plannerRepository.getAllPlannersWithUnits);
const getPlannerById = jest.mocked(plannerRepository.getPlannerById);
const getAllUnits = jest.mocked(unitRepository.getAllUnits);

function dbUnit(code: string, offered: number[], requisiteGroups: any[] = []) {
  return {
    unit_code: code,
    unit_name: `Unit ${code}`,
    offerings: offered.map((offered_in) => ({ offered_in })),
    requisite_groups: requisiteGroups,
  };
}

const unitRow = (code: string, offered: number[], requisiteGroups: any[] = []) => ({
  unit_code: code, unit_name: `Unit ${code}`, offerings: offered, requisites: requisiteGroups,
});

const prereq = (code: string) => ({
  conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: code } }],
});
const creditPoints = (n: number) => ({
  conditions: [{ type: 'credit_points', requisite_type: null, credit_points: n, unit: null }],
});

function plannerFixture() {
  return {
    id: 'p1',
    major: { name: 'Software Development' },
    intake_year: 2024,
    intake_month: 2,
    course_type: 'degree',
    duration_semesters: 6,
    units: [
      { category: 'core', year_level: 1, semester: 1, unit: dbUnit('COS10009', [1, 2]) },
      { category: 'core', year_level: 2, semester: 1, unit: dbUnit('COS20007', [1], [prereq('COS10009')]) },
      { category: 'core', year_level: 2, semester: 2, unit: dbUnit('COS30008', [2], [prereq('COS20007')]) },
      { category: 'major_core', year_level: 2, semester: 1, unit: dbUnit('COS20015', [1, 2]) },
      { category: 'major_core', year_level: 3, semester: 1, unit: dbUnit('COS30049', [], [creditPoints(100)]) },
      { category: 'elective', year_level: 3, semester: 2, unit: dbUnit('FREE1', [1, 2], [prereq('COS99999')]) },
    ],
    elective_groups: [{ id: 'g1', units: [{ unit: dbUnit('POOL1', [1]) }] }],
  };
}

function scrapedStudent(overrides: Partial<ScrapedStudent> = {}): ScrapedStudent {
  const row = (courseId: string) => ({
    courseId, courseTitle: courseId, level: '', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'D', term: '20241',
  });
  return {
    course: 'Bachelor of Computer Science', status: 'Active', cgpa: 3, creditsRequired: 300, creditsCompleted: 100,
    gradeLevel: '', enrollmentDate: '15/02/2024', graduationDate: null, scheduledCredits: 0,
    courseList: [row('COS10009'), row('COS20007'), row('COS20015')], ...overrides,
  };
}

// hasWIL defaults to false here on purpose. The real default (defaultHasWIL: true) makes the matching pipeline waive 2
// free elective slots, and this fixture only has one, so with it on there'd be no free elective candidate to look at.
function record(id: string, scraped: ScrapedStudent, defaultHasWIL = false): EstimationRecord {
  const { rawInput, warnings } = mapScrapedStudentToRawInput(scraped, id, { loadCap: 4, retentionRate: 0.85, defaultHasWIL });
  return {
    studentId: id, name: `Student ${id}`, dbId: 1, enrollId: 1, scraped, rawInput,
    unitStates: resolveUnitStates(scraped.courseList), mappingWarnings: warnings,
  };
}

describe('runEstimationPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const planner = plannerFixture();
    getAllPlannersWithUnits.mockResolvedValue([planner] as never);
    getPlannerById.mockResolvedValue(planner as never);
    getAllUnits.mockResolvedValue([
      unitRow('COS10009', [1, 2]), unitRow('COS20007', [1], [prereq('COS10009')]), unitRow('COS30008', [2], [prereq('COS20007')]),
      unitRow('COS20015', [1, 2]), unitRow('COS30049', []), unitRow('FREE1', [1, 2]), unitRow('POOL1', [1]),
    ] as never);
  });

  test('runs a DD/MM/YYYY student through every phase and reports what each one did', async () => {
    const { students, summary } = await runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 2, loadCap: 4 });
    const [s] = students;

    expect(s.error).toBeUndefined();
    // 15/02/2024 is Feb 2024, semester 1, this is what the old new Date() parse got wrong.
    expect(s.intake).toEqual({ year: 2024, semester: 1 });
    expect(s.planner).toMatchObject({ id: 'p1', majorName: 'Software Development' });

    // Candidates: missing core (COS30008), missing major core (COS30049), the pool (POOL1) and the slotted elective (FREE1).
    expect(s.candidateCount).toBe(4);

    // Eligible for semester 2: COS30008 (offered 2, prerequisite done), COS30049 (100 credits scraped, no offering rows).
    // Not eligible: POOL1 (sem 1 only), FREE1 (prerequisite COS99999 unmet).
    expect(s.eligibleCount).toBe(2);
    expect(s.ineligible).toEqual(expect.arrayContaining([
      { code: 'POOL1', category: 'prescribed', reason: 'not-offered-in-term' },
      { code: 'FREE1', category: 'freeElective', reason: 'requisites-unmet' },
    ]));

    // Ranked by planner slot: COS30008 is year 2 sem 2, COS30049 is year 3 sem 1.
    expect(s.picked.map((u) => u.code)).toEqual(['COS30008', 'COS30049']);
    expect(s.picked[0]).toMatchObject({ category: 'core', yearLevel: 2, semester: 2 });

    // COS30049 only passed because it has no offering rows, which canTake() reads as "offered every semester".
    expect(s.eligibleWithoutOfferingData).toEqual(['COS30049']);
    expect(summary.eligibleWithoutOfferingData).toBe(1);
    expect(summary.withPlanner).toBe(1);
    expect(summary.pickedByUnit).toEqual([{ code: 'COS30008', students: 1 }, { code: 'COS30049', students: 1 }]);
  });

  // With defaultHasWIL on (the shipped default), every student is treated as WIL-exempt, and the matching pipeline waives 2 of
  // their free elective slots. Here that leaves 0 slots owed, so FREE1 is never even a candidate, which under-counts free
  // electives for any student who really hasn't got WIL approval.
  test('a WIL-exempt student has free elective slots waived, so no free elective candidate is produced', async () => {
    const { students } = await runEstimationPreview([record('S1', scrapedStudent(), true)], { targetTerm: 2, loadCap: 4 });
    const [s] = students;
    expect(s.candidateCount).toBe(3);
    expect([...s.picked, ...s.ineligible].some((u) => u.code === 'FREE1')).toBe(false);
  });

  test('a target term flips which units are offered, so eligibility changes with it', async () => {
    const { students } = await runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 1, loadCap: 4 });
    const [s] = students;

    // Semester 1: COS30008 is sem-2 only so it drops out, POOL1 (sem 1) is offered and has no requisites so it gets in.
    expect(s.ineligible.find((u) => u.code === 'COS30008')?.reason).toBe('not-offered-in-term');
    expect(s.picked.map((u) => u.code)).toEqual(['COS30049']);
    expect(s.poolCandidates).toEqual({ prescribed: 1, freeElective: 0 });
  });

  test('the portal credit total is what gates a credit_points requisite', async () => {
    const { students } = await runEstimationPreview(
      [record('S1', scrapedStudent({ creditsCompleted: 50 }))],
      { targetTerm: 2, loadCap: 4 },
    );
    expect(students[0].ineligible.find((u) => u.code === 'COS30049')?.reason).toBe('requisites-unmet');
  });

  test('loadCap drops the later-slotted core units and says how many', async () => {
    const { students } = await runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 2, loadCap: 1 });
    expect(students[0].picked.map((u) => u.code)).toEqual(['COS30008']);
    expect(students[0].droppedByLoadCap).toBe(1);
  });

  test('a student who matches no major is reported, not treated as an error', async () => {
    const { students, summary } = await runEstimationPreview(
      [record('S2', scrapedStudent({ courseList: [] }))],
      { targetTerm: 2, loadCap: 4 },
    );
    expect(students[0].planner).toBeNull();
    expect(students[0].error).toBeUndefined();
    expect(summary.noMajorOrPlanner).toBe(1);
    expect(summary.errors).toBe(0);
  });

  // Every existing route passes preferIntakeYear: false. Without it the pipeline throws for a student whose intake
  // year has no planner loaded, which for a real batch would be every student on an older intake.
  test('a student whose intake year has no planner falls back instead of erroring', async () => {
    const { students } = await runEstimationPreview(
      [record('S3', scrapedStudent({ enrollmentDate: '10/03/2019' }))],
      { targetTerm: 2, loadCap: 4 },
    );
    expect(students[0].intake.year).toBe(2019);
    expect(students[0].error).toBeUndefined();
    expect(students[0].planner?.id).toBe('p1');
  });

  test('throws a readable error when no planners are loaded at all', async () => {
    getAllPlannersWithUnits.mockResolvedValue([] as never);
    await expect(runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 2, loadCap: 4 }))
      .rejects.toThrow('No planner templates are loaded');
  });

  test('counts each mapper warning once per student that has it', async () => {
    const { summary } = await runEstimationPreview(
      [record('S1', scrapedStudent()), record('S2', scrapedStudent())],
      { targetTerm: 2, loadCap: 4 },
    );
    const hasWilWarning = Object.entries(summary.mappingWarningCounts).find(([w]) => w.startsWith('hasWIL defaulted'));
    expect(hasWilWarning?.[1]).toBe(2);
  });
});
