// ============================================================
// Tests for core/services/classEstimation/estimationPreview.ts.
// Unlike the other classEstimation tests, this one doesn't isolate a single module, it runs the real chain end to end
// (scrapedStudentMapper -> runMatchingPipeline -> resolver -> eligibility filter -> ranker) against one planner fixture,
// with only the two repositories mocked. That's the point of the preview: those phases had only ever been tested in
// isolation, so this is where a mismatch between what one phase produces and what the next expects would show up.
//
// Fixture planner (intake Feb 2024, so semester 1):
//   core        COS10009 (y1s1), COS20007 (y2s1), COS30008 (y2s2, needs COS20007, offered sem 2)
//   major_core  COS20015 (y2s1), COS30049 (y3s1, needs 25 credit points, no offering rows)
//   elective    FREE1 (y3s2, needs COS99999, which nobody has), plus one unslotted pool group holding POOL1 (offered sem 1 only)
// ============================================================

import { runEstimationPreview } from '@core/services/classEstimation/estimationPreview';
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
      // 25cp is what the fixture transcript actually earns two units' worth of, so this gate passes for the
      // standard student and fails for the one below whose units earned nothing.
      { category: 'major_core', year_level: 3, semester: 1, unit: dbUnit('COS30049', [], [creditPoints(25)]) },
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
  return buildEstimationRecord({
    source: 'portal',
    studentId: id,
    name: `Student ${id}`,
    dbId: 1,
    enrollId: 1,
    scraped,
    transcript: scraped.courseList,
    config: { loadCap: 4, retentionRate: 0.85, defaultHasWIL },
  });
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
    const { students, summary } = await runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 2, loadCap: 4, retentionRate: 1 });
    const [s] = students;

    expect(s.error).toBeUndefined();
    // 15/02/2024 is Feb 2024, semester 1, this is what the old new Date() parse got wrong.
    expect(s.intake).toEqual({ year: 2024, semester: 1 });
    expect(s.planner).toMatchObject({ id: 'p1', majorName: 'Software Development' });

    // Candidates: missing core (COS30008), missing major core (COS30049), the pool (POOL1) and the slotted elective (FREE1).
    expect(s.candidateCount).toBe(4);

    // Eligible for semester 2: COS30008 (offered 2, prerequisite done), COS30049 (37.5 credits earned on
    // the transcript clears its 25cp gate, and it has no offering rows so it is available in either).
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
    const { students } = await runEstimationPreview([record('S1', scrapedStudent(), true)], { targetTerm: 2, loadCap: 4, retentionRate: 1 });
    const [s] = students;
    expect(s.candidateCount).toBe(3);
    expect([...s.picked, ...s.ineligible].some((u) => u.code === 'FREE1')).toBe(false);
  });

  test('a target term flips which units are offered, so eligibility changes with it', async () => {
    const { students } = await runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 1, loadCap: 4, retentionRate: 1 });
    const [s] = students;

    // Semester 1: COS30008 is sem-2 only so it drops out, POOL1 (sem 1) is offered and has no requisites so it gets in.
    expect(s.ineligible.find((u) => u.code === 'COS30008')?.reason).toBe('not-offered-in-term');
    expect(s.picked.map((u) => u.code)).toEqual(['COS30049']);
    expect(s.poolCandidates).toEqual({ prescribed: 1, freeElective: 0 });
  });

  // Credit-point requisites are gated on what the transcript's Earned column adds up to, not on the
  // portal's own creditsCompleted figure. The two disagree in real data: this fixture's portal figure
  // claims 100 while its three units total 37.5. These units pass but earned nothing, so the same student
  // clears the prerequisite chain yet fails the credit gate.
  test('the credits earned on the transcript are what gate a credit_points requisite', async () => {
    const noCredit = (courseId: string) => ({
      courseId, courseTitle: courseId, level: '', credits: 12.5, creditsEarned: 0,
      status: 'Complete', grade: '', term: '20241',
    });

    const { students } = await runEstimationPreview(
      [record('S1', scrapedStudent({
        creditsCompleted: 100,
        courseList: [noCredit('COS10009'), noCredit('COS20007'), noCredit('COS20015')],
      }))],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );

    expect(students[0].ineligible.find((u) => u.code === 'COS30049')?.reason).toBe('requisites-unmet');
  });

  // A unit offered in both semesters is available in both, even in the semester its planner does not
  // recommend, which is how a retake gets counted. 13 of the 67 loaded units are offered in both. The
  // prediction is still flagged, since it is the first place a wrong offerings row would show up.
  test('a unit offered in both semesters is counted outside its recommended semester, and flagged', async () => {
    const planner = plannerFixture();
    // COS30008 keeps its y2s2 slot but is offered in both semesters.
    planner.units[2].unit = dbUnit('COS30008', [1, 2], [prereq('COS20007')]);
    getPlannerById.mockResolvedValue(planner as never);
    getAllPlannersWithUnits.mockResolvedValue([planner] as never);

    const { students, summary } = await runEstimationPreview(
      [record('S1', scrapedStudent())],
      { targetTerm: 1, loadCap: 4, retentionRate: 1 },
    );

    expect(students[0].picked.map((u) => u.code)).toContain('COS30008');
    expect(students[0].outsideRecommendedTerm).toContain('COS30008');
    expect(summary.outsideRecommendedTerm).toBeGreaterThan(0);
  });

  // Phase 6 through the real chain. The fixture pool holds one unit, POOL1, so a student owing one
  // prescribed slot puts their whole seat on it. The value being unrounded is the point: it is summed
  // across the cohort before anything is rounded, so a fraction here is correct rather than sloppy.
  test('elective seats are spread over the pool instead of naming a pick', async () => {
    const { students, summary } = await runEstimationPreview(
      [record('S1', scrapedStudent())],
      { targetTerm: 1, loadCap: 4, retentionRate: 1 },
    );
    const [s] = students;

    expect(s.electiveSeats.prescribed).toBe(1);
    expect(s.electives).toEqual([
      { code: 'POOL1', category: 'prescribed', expectedSeats: 1, popularity: 0 },
    ]);
    // POOL1 is never a named pick, it only ever carries a share.
    expect(s.picked.map((u) => u.code)).not.toContain('POOL1');

    expect(summary.electiveSeatsByUnit).toEqual([
      { code: 'POOL1', category: 'prescribed', expectedSeats: 1, popularity: 0 },
    ]);
    expect(summary.electiveSeatsUnplaced).toBe(0);
  });

  // A cohort's fractions are what the estimate rests on, so the batch total has to hold across students
  // even though no one student's share is a whole seat.
  test('a batch sums its elective fractions into one figure per unit', async () => {
    const { summary } = await runEstimationPreview(
      [record('S1', scrapedStudent()), record('S2', scrapedStudent()), record('S3', scrapedStudent())],
      { targetTerm: 1, loadCap: 4, retentionRate: 1 },
    );

    const pool1 = summary.electiveSeatsByUnit.find((u) => u.code === 'POOL1');
    expect(pool1?.expectedSeats).toBeCloseTo(3, 10);
  });

  // Popularity comes from what this batch has already passed, since there is no historical data to use.
  // COS20015 sits in the fixture's transcript, so a pool containing it would be weighted up by every
  // student holding it. Here it confirms the count reaches the splitter at all.
  test('popularity is counted from the batch transcripts', async () => {
    const planner = plannerFixture();
    // Put a unit the cohort has already passed into the pool alongside one nobody has.
    planner.elective_groups = [{ id: 'g1', units: [{ unit: dbUnit('POOL1', [1]) }, { unit: dbUnit('COS10022', [1]) }] }];
    getPlannerById.mockResolvedValue(planner as never);
    getAllPlannersWithUnits.mockResolvedValue([planner] as never);

    const withCos10022 = scrapedStudent({
      courseList: [
        ...scrapedStudent().courseList,
        { courseId: 'COS10022', courseTitle: 'COS10022', level: '', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'D', term: '20241' },
      ],
    });

    const { summary } = await runEstimationPreview(
      [record('S1', scrapedStudent()), record('S2', withCos10022)],
      { targetTerm: 1, loadCap: 4, retentionRate: 1 },
    );

    // S2 has passed COS10022, so it is not in S2's own pool, but it weights the pool S1 draws from.
    const cos10022 = summary.electiveSeatsByUnit.find((u) => u.code === 'COS10022');
    expect(cos10022?.popularity).toBe(1);
    const pool1 = summary.electiveSeatsByUnit.find((u) => u.code === 'POOL1');
    // Weights 2 against 1, so the unit someone has passed draws the larger share of S1's single seat.
    expect(cos10022!.expectedSeats).toBeGreaterThan(pool1!.expectedSeats);
  });

  // ====== Phase 7 ==============================================================================
  //
  // Batching is only ever allowed to be an optimisation, so this is the test that matters: the same cohort,
  // once as distinct students and once as duplicates, must give per-unit figures that scale exactly. A
  // grouping bug would not crash. It would hand one student another's answer, and nothing else in the
  // system would contradict the result.
  test('a batch of identical students gives exactly N times one student', async () => {
    const one = await runEstimationPreview(
      [record('S1', scrapedStudent())],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );
    const five = await runEstimationPreview(
      [1, 2, 3, 4, 5].map((n) => record(`S${n}`, scrapedStudent())),
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );

    // Five students, one situation, so one pipeline run served all of them.
    expect(five.summary.grouping).toEqual({ students: 5, groups: 1, largestGroup: 5, workSaved: 0.8 });

    // Every unit scales by exactly five, with nothing appearing or disappearing.
    expect(five.summary.projectedByUnit.map((u) => u.code)).toEqual(one.summary.projectedByUnit.map((u) => u.code));
    for (const unit of five.summary.projectedByUnit) {
      const single = one.summary.projectedByUnit.find((u) => u.code === unit.code)!;
      expect(unit.fromNamedPicks).toBe(single.fromNamedPicks * 5);
      expect(unit.fromElectives).toBeCloseTo(single.fromElectives * 5, 10);
      expect(unit.projected).toBeCloseTo(single.projected * 5, 10);
    }
  });

  // Grouping must be invisible: the per-student list keeps its input order and every student keeps their
  // own identity, so the UI cannot tell a batched run from an unbatched one.
  test('grouped students keep their own identity, in input order', async () => {
    const { students } = await runEstimationPreview(
      ['S3', 'S1', 'S2'].map((id) => record(id, scrapedStudent())),
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );

    expect(students.map((s) => s.studentId)).toEqual(['S3', 'S1', 'S2']);
    expect(students.map((s) => s.name)).toEqual(['Student S3', 'Student S1', 'Student S2']);
    // Same situation, so the same estimate for each.
    expect(students[1].picked).toEqual(students[0].picked);
  });

  // Students who differ in something the pipeline reads must not be batched together, whatever else they
  // share. An empty transcript is a genuinely different case from a populated one.
  test('students in different situations are not batched together', async () => {
    const { summary } = await runEstimationPreview(
      [
        record('S1', scrapedStudent()),
        record('S2', scrapedStudent()),
        record('S3', scrapedStudent({ courseList: [] })),
      ],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );

    expect(summary.grouping.groups).toBe(2);
    expect(summary.grouping.largestGroup).toBe(2);
  });

  test('the retention rate discounts every projection and is reported with them', async () => {
    const full = await runEstimationPreview(
      [record('S1', scrapedStudent())],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );
    const discounted = await runEstimationPreview(
      [record('S1', scrapedStudent())],
      { targetTerm: 2, loadCap: 4, retentionRate: 0.85 },
    );

    expect(discounted.summary.retentionRate).toBe(0.85);
    for (const unit of discounted.summary.projectedByUnit) {
      const undiscounted = full.summary.projectedByUnit.find((u) => u.code === unit.code)!;
      // The raw prediction is untouched, only the projected figure moves.
      expect(unit.beforeRetention).toBeCloseTo(undiscounted.beforeRetention, 10);
      expect(unit.projected).toBeCloseTo(undiscounted.beforeRetention * 0.85, 10);
    }
  });

  // A unit can be a named requirement for one student and an elective option for another, which is what
  // the cross-category units in these planners do. Both contributions have to land on the same row.
  // Semester 1, where POOL1 is offered and the slotted semester-2 units are not, so one unit arrives as a
  // named requirement and another purely as an elective share.
  test('named picks and elective shares are kept apart on their own rows', async () => {
    const { summary } = await runEstimationPreview(
      [record('S1', scrapedStudent())],
      { targetTerm: 1, loadCap: 4, retentionRate: 1 },
    );

    const pool1 = summary.projectedByUnit.find((u) => u.code === 'POOL1');
    expect(pool1).toBeDefined();
    expect(pool1!.fromNamedPicks).toBe(0);           // never a named pick, it is pool-only
    expect(pool1!.fromElectives).toBeGreaterThan(0);
    expect(pool1!.beforeRetention).toBeCloseTo(pool1!.fromElectives, 10);

    const named = summary.projectedByUnit.find((u) => u.code === 'COS30049');
    expect(named!.fromNamedPicks).toBe(1);
    expect(named!.fromElectives).toBe(0);
    expect(named!.beforeRetention).toBe(1);
  });

  test('loadCap drops the later-slotted core units and says how many', async () => {
    const { students } = await runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 2, loadCap: 1, retentionRate: 1 });
    expect(students[0].picked.map((u) => u.code)).toEqual(['COS30008']);
    expect(students[0].droppedByLoadCap).toBe(1);
  });

  // A student with no major detected is still estimated, from the units every candidate planner wants from
  // them. Every major in the course shares its first-year units, so anyone one or two semesters in has taken
  // nothing that tells the majors apart, and a fifth of a real cohort sits in that position. No planner or
  // match percentage is reported for them, because neither was actually determined.
  test('a student who matches no major is estimated from the shared core, not dropped', async () => {
    const { students, summary } = await runEstimationPreview(
      [record('S2', scrapedStudent({ courseList: [] }))],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );
    const [s] = students;

    expect(s.planner).toBeNull();
    expect(s.basis).toBe('commonCore');
    expect(s.error).toBeUndefined();
    expect(summary.commonCoreOnly).toBe(1);
    expect(summary.noMajorOrPlanner).toBe(0);
    expect(summary.errors).toBe(0);

    // The fixture has one planner, so its whole core is shared by definition. COS30008 is the one offered
    // in semester 2, and with an empty transcript its COS20007 prerequisite is unmet, so nothing is picked
    // but the candidates were still worked out rather than skipped.
    expect(s.candidateCount).toBeGreaterThan(0);
    // Major core and the elective pools are left out: those differ by major, so they would be a guess.
    expect(s.electives).toEqual([]);
  });

  // Every existing route passes preferIntakeYear: false. Without it the pipeline throws for a student whose intake
  // year has no planner loaded, which for a real batch would be every student on an older intake.
  test('a student whose intake year has no planner falls back instead of erroring', async () => {
    const { students } = await runEstimationPreview(
      [record('S3', scrapedStudent({ enrollmentDate: '10/03/2019' }))],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );
    expect(students[0].intake.year).toBe(2019);
    expect(students[0].error).toBeUndefined();
    expect(students[0].planner?.id).toBe('p1');
  });

  test('throws a readable error when no planners are loaded at all', async () => {
    getAllPlannersWithUnits.mockResolvedValue([] as never);
    await expect(runEstimationPreview([record('S1', scrapedStudent())], { targetTerm: 2, loadCap: 4, retentionRate: 1 }))
      .rejects.toThrow('No planner templates are loaded');
  });

  test('counts each mapper warning once per student that has it', async () => {
    const { summary } = await runEstimationPreview(
      [record('S1', scrapedStudent()), record('S2', scrapedStudent())],
      { targetTerm: 2, loadCap: 4, retentionRate: 1 },
    );
    const hasWilWarning = Object.entries(summary.mappingWarningCounts).find(([w]) => w.startsWith('hasWIL defaulted'));
    expect(hasWilWarning?.[1]).toBe(2);
  });
});
