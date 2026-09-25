// ============================================================
// Tests for core/services/classEstimation/estimationRecordBuilder.ts.
// This is the single place a transcript becomes an EstimationRecord, whichever source produced it, so the
// main thing these check is that a portal record and an imported record built from the same rows come out
// the same apart from the portal-only identifiers.
//
// The rest cover the four things a transcript says that were previously guessed or ignored: intake from
// term codes, credit points from the Earned column, WIL detected rather than defaulted, and booked units
// captured. Rows below use the real shapes from a DPA export, including the 0-credit integrity module and
// the 25-credit placement.
// ============================================================

import {
  buildEstimationRecord,
  sumCreditsEarned,
  collectScheduledUnits,
} from '@core/services/classEstimation/estimationRecordBuilder';
import type { ScrapedCourseListItem, ScrapedStudent } from '@shared/types/student';

function row(
  courseId: string,
  overrides: Partial<ScrapedCourseListItem> = {},
): ScrapedCourseListItem {
  return {
    courseId,
    courseTitle: `Unit ${courseId}`,
    level: '',
    credits: 12.5,
    creditsEarned: 12.5,
    status: 'Complete',
    grade: 'D',
    term: '2024_FEB_S1',
    ...overrides,
  };
}

const scrapedStudent = (courseList: ScrapedCourseListItem[]): ScrapedStudent => ({
  course: 'Bachelor of Computer Science', status: 'Active', cgpa: 3.2,
  creditsRequired: 300, creditsCompleted: 100, gradeLevel: 'Year 2',
  enrollmentDate: '15/02/2024', graduationDate: null, scheduledCredits: 12.5,
  courseList,
});

describe('buildEstimationRecord', () => {
  test('records the source without letting it change anything else', () => {
    const transcript = [row('COS10009'), row('COS20007', { term: '2024_SEP_S2' })];

    const fromPortal = buildEstimationRecord({
      source: 'portal', studentId: 'S1', name: 'Student One', dbId: 7, enrollId: 9,
      scraped: scrapedStudent(transcript), transcript,
    });
    const fromImport = buildEstimationRecord({ source: 'import', studentId: 'S1', transcript });

    expect(fromPortal.source).toBe('portal');
    expect(fromImport.source).toBe('import');

    // Everything the pipeline actually consumes is identical, which is the point of one builder.
    expect(fromImport.rawInput).toEqual(fromPortal.rawInput);
    expect(fromImport.totalCreditsEarned).toBe(fromPortal.totalCreditsEarned);
    expect([...fromImport.unitStates]).toEqual([...fromPortal.unitStates]);
  });

  test('an imported record has no portal identifiers and falls back to the ID for a name', () => {
    const record = buildEstimationRecord({ source: 'import', studentId: 'C0210929', transcript: [row('COS10009')] });

    expect(record.name).toBe('C0210929');
    expect(record.dbId).toBeUndefined();
    expect(record.enrollId).toBeUndefined();
    expect(record.scraped).toBeUndefined();
    expect(record.transcript).toHaveLength(1);
  });

  describe('intake from term codes', () => {
    test('reads the earliest semester on the transcript, not the enrolment date', () => {
      // The enrolment date says Feb 2024; the transcript starts a year earlier. The transcript wins.
      const transcript = [
        row('COS20007', { term: '2025_MAR_S1' }),
        row('COS10009', { term: '2023_SEP_S2' }),
      ];
      const record = buildEstimationRecord({
        source: 'portal', studentId: 'S1', scraped: scrapedStudent(transcript), transcript,
      });

      expect(record.rawInput.intakeYear).toBe(2023);
      expect(record.rawInput.intakeSemester).toBe(2);
      expect(record.mappingWarnings.some((w) => w.includes('enrollmentDate'))).toBe(false);
    });

    test('falls back to the enrolment date when no term code can be read, and says so', () => {
      const transcript = [row('COS10009', { term: '' })];
      const record = buildEstimationRecord({
        source: 'portal', studentId: 'S1', scraped: scrapedStudent(transcript), transcript,
      });

      expect(record.rawInput.intakeYear).toBe(2024);
      expect(record.mappingWarnings.some((w) => w.includes('fell back to enrollmentDate'))).toBe(true);
    });

    test('an imported transcript with no enrolment date still gets its intake from the terms', () => {
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1',
        transcript: [row('COS10009', { term: '2025_MAR_S1' })],
      });

      expect(record.rawInput.intakeYear).toBe(2025);
      expect(record.rawInput.intakeSemester).toBe(1);
    });
  });

  describe('credit points from the Earned column', () => {
    // Counting units at a flat 12.5 is wrong in both directions on a real transcript.
    test('sums what was actually earned, not the unit count times a flat rate', () => {
      const transcript = [
        row('AIMFECS', { credits: 0, creditsEarned: 0, grade: 'NCOM' }),
        row('COS10009'),
        row('ICT20026', { credits: 25, creditsEarned: 25, courseTitle: 'Work Integrated Learning Placement' }),
      ];

      // A flat rate would say 3 units * 12.5 = 37.5. The real figure is 0 + 12.5 + 25.
      expect(sumCreditsEarned(transcript)).toBe(37.5);
      expect(buildEstimationRecord({ source: 'import', studentId: 'S1', transcript }).totalCreditsEarned).toBe(37.5);
    });

    test('a failed unit earns nothing', () => {
      const transcript = [row('COS10009'), row('COS10002', { grade: 'N', creditsEarned: 0 })];
      expect(sumCreditsEarned(transcript)).toBe(12.5);
    });

    test('an in-progress unit earns nothing yet', () => {
      const transcript = [row('COS10009'), row('COS20028', { status: 'Current', grade: '', creditsEarned: 0 })];
      expect(sumCreditsEarned(transcript)).toBe(12.5);
    });

    // A Conceded Pass earns credit even though it cannot satisfy a requisite.
    test('a conceded pass earns its credit', () => {
      expect(sumCreditsEarned([row('COS10009', { grade: 'CP' })])).toBe(12.5);
    });

    // Zero earned and no credit figures recorded are different situations, and a bare total cannot tell
    // them apart. Guessing for the first hands credit to a student who holds none; refusing to guess for
    // the second fails every credit-point gate for a whole cohort.
    test('a transcript with no credit figures gets a flat-rate estimate, and says so', () => {
      const transcript = [
        row('COS10009', { credits: 0, creditsEarned: 0, grade: 'HD' }),
        row('COS20007', { credits: 0, creditsEarned: 0, grade: 'D' }),
      ];
      const record = buildEstimationRecord({ source: 'import', studentId: 'S1', transcript });

      expect(record.totalCreditsEarned).toBe(25);
      expect(record.mappingWarnings.some((w) => w.includes('no credit figures'))).toBe(true);
    });

    test('a transcript that records credits but earned none reports zero, with no estimate', () => {
      const transcript = [
        row('COS10009', { credits: 12.5, creditsEarned: 0, grade: '' }),
        row('COS20007', { credits: 12.5, creditsEarned: 0, grade: '' }),
      ];
      const record = buildEstimationRecord({ source: 'import', studentId: 'S1', transcript });

      expect(record.totalCreditsEarned).toBe(0);
      expect(record.mappingWarnings.some((w) => w.includes('no credit figures'))).toBe(false);
    });

    test('a repeated unit is only counted once', () => {
      const transcript = [
        row('COS10009', { grade: 'N', creditsEarned: 0, term: '2024_FEB_S1' }),
        row('COS10009', { grade: 'P', creditsEarned: 12.5, term: '2024_SEP_S2' }),
      ];
      expect(sumCreditsEarned(transcript)).toBe(12.5);
    });
  });

  describe('WIL detection', () => {
    // The real placement code is ICT20026, which contains no "WIL" substring, so a code-based check misses
    // it. The title is what identifies it.
    test('detects a placement from its title, not its code', () => {
      const transcript = [row('ICT20026', { courseTitle: 'Work Integrated Learning Placement and Professional Experience - ICT' })];
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1', transcript,
        config: { loadCap: 4, retentionRate: 0.85, defaultHasWIL: false },
      });

      expect(record.rawInput.hasWIL).toBe(true);
      expect(record.mappingWarnings.some((w) => w.includes('hasWIL detected'))).toBe(true);
      expect(record.mappingWarnings.some((w) => w.includes('hasWIL defaulted'))).toBe(false);
    });

    test('also matches the hyphenated spelling', () => {
      const transcript = [row('ICT20016', { courseTitle: 'Work-Integrated Learning' })];
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1', transcript,
        config: { loadCap: 4, retentionRate: 0.85, defaultHasWIL: false },
      });
      expect(record.rawInput.hasWIL).toBe(true);
    });

    // Falling back to config matters because hasWIL changes how many free elective slots the matching
    // algorithm requires, so a blanket wrong value shifts elective demand for every student alike.
    test('falls back to the config default when the transcript says nothing, and says so', () => {
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1', transcript: [row('COS10009')],
        config: { loadCap: 4, retentionRate: 0.85, defaultHasWIL: true },
      });

      expect(record.rawInput.hasWIL).toBe(true);
      expect(record.mappingWarnings.some((w) => w.includes('hasWIL defaulted'))).toBe(true);
    });
  });

  describe('booked units', () => {
    // Captured for measurement only. By decision these are still predicted normally, so the estimator can
    // be measured honestly rather than scoring itself on enrolments it read off the transcript.
    test('captures Scheduled rows with their term', () => {
      const transcript = [
        row('COS10009'),
        row('COS40006', { status: 'Scheduled', grade: '', creditsEarned: 0, term: '2026_SEP_S2' }),
      ];

      expect(collectScheduledUnits(transcript)).toEqual([{ code: 'COS40006', term: '2026_SEP_S2' }]);
    });

    test('a booked unit still counts as not taken, so it is predicted rather than assumed', () => {
      const transcript = [row('COS40006', { status: 'Scheduled', grade: '', creditsEarned: 0 })];
      const record = buildEstimationRecord({ source: 'import', studentId: 'S1', transcript });

      expect(record.unitStates.get('COS40006')).toBe('not_taken');
      expect(record.rawInput.completedUnitCodes).not.toContain('COS40006');
      expect(record.scheduledUnits).toHaveLength(1);
    });
  });

  describe('unit code aliases', () => {
    // A planner asking for ICT20016 against a transcript showing ICT20026 would otherwise report the WIL
    // as still owed.
    test('rewrites an aliased code and reports the rewrite', () => {
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1',
        transcript: [row('ICT20026'), row('COS10009')],
        unitCodeAliases: { ICT20026: 'ICT20016' },
      });

      expect(record.transcript.map((r) => r.courseId)).toEqual(['ICT20016', 'COS10009']);
      expect(record.appliedAliases).toEqual([['ICT20026', 'ICT20016']]);
      expect(record.mappingWarnings.some((w) => w.includes('ICT20026 treated as ICT20016'))).toBe(true);
      expect(record.rawInput.completedUnitCodes).toContain('ICT20016');
    });

    test('is case insensitive on both sides', () => {
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1',
        transcript: [row('ict20026')],
        unitCodeAliases: { ict20026: 'ict20016' },
      });
      expect(record.transcript[0].courseId).toBe('ICT20016');
    });

    test('leaves everything alone when no alias matches', () => {
      const record = buildEstimationRecord({
        source: 'import', studentId: 'S1',
        transcript: [row('COS10009')],
        unitCodeAliases: { ICT20026: 'ICT20016' },
      });

      expect(record.appliedAliases).toEqual([]);
      expect(record.transcript[0].courseId).toBe('COS10009');
    });
  });

  test('carries conceded passes through for the eligibility check', () => {
    const record = buildEstimationRecord({
      source: 'import', studentId: 'S1',
      transcript: [row('COS10009', { grade: 'CP' }), row('COS20007')],
    });

    expect(record.concededPassUnitCodes).toEqual(['COS10009']);
  });
});
