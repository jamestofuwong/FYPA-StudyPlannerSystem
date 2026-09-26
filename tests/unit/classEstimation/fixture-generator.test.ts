// ============================================================
// Tests for core/services/classEstimation/dpaImport/fixtureGenerator.ts.
// The generator's whole purpose is producing students who differ from each other, so most of these check
// variety rather than exact values: same seed reproduces a cohort, different progress and intakes appear,
// and a degenerate cohort is refused rather than returned.
//
// The output is also fed through the real parser here, so the two cannot drift: if the generator emits a
// column order the parser does not accept, this fails.
// ============================================================

import * as XLSX from 'xlsx-js-style';
import {
  generateStudents,
  assertDistinctHistories,
  historySignature,
  termCodeFor,
  toMultiStudentRows,
  toSingleStudentRows,
  plannerToFixture,
  plannersToFixtures,
  type FixturePlanner,
  type FixtureUnit,
} from '@core/services/classEstimation/dpaImport/fixtureGenerator';
import { parseDpaWorkbook } from '@core/services/classEstimation/dpaImport/dpaFileParser';
import { parseTermCode, earliestSemesterTerm } from '@core/services/classEstimation/termCode';

const computing: FixturePlanner = {
  majorName: 'Computer Science',
  units: [
    { code: 'COS10009', title: 'Introduction to Programming', yearLevel: 1, semester: 1 },
    { code: 'COS10003', title: 'Computer and Logic Essentials', yearLevel: 1, semester: 1 },
    { code: 'COS10022', title: 'Data Science Principles', yearLevel: 1, semester: 2 },
    { code: 'COS20007', title: 'Object Oriented Programming', yearLevel: 2, semester: 1 },
    { code: 'COS20031', title: 'Database Design Project', yearLevel: 2, semester: 2 },
    { code: 'COS30049', title: 'Computing Technology Innovation Project', yearLevel: 3, semester: 1 },
  ],
};

const software: FixturePlanner = {
  majorName: 'Software Engineering',
  units: [
    { code: 'COS10009', title: 'Introduction to Programming', yearLevel: 1, semester: 1 },
    { code: 'SWE30003', title: 'Software Architectures and Design', yearLevel: 2, semester: 1 },
    { code: 'SWE40006', title: 'Software Deployment and Evolution', yearLevel: 3, semester: 1 },
  ],
};

function workbook(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('termCodeFor', () => {
  // Semesters alternate and roll the year over after semester 2.
  test.each([
    [2024, 1 as const, 0, '2024_MAR_S1'],
    [2024, 1 as const, 1, '2024_SEP_S2'],
    [2024, 1 as const, 2, '2025_MAR_S1'],
    [2024, 2 as const, 0, '2024_SEP_S2'],
    [2024, 2 as const, 1, '2025_MAR_S1'],
    [2024, 2 as const, 3, '2026_MAR_S1'],
  ])('intake %i sem %i, offset %i gives %s', (year, semester, offset, expected) => {
    expect(termCodeFor(year, semester, offset)).toBe(expected);
  });

  test('every generated code is readable by the term code parser', () => {
    for (let offset = 0; offset < 8; offset++) {
      expect(parseTermCode(termCodeFor(2024, 1, offset))).not.toBeNull();
      expect(parseTermCode(termCodeFor(2024, 2, offset))).not.toBeNull();
    }
  });
});

describe('generateStudents', () => {
  test('the same seed reproduces the same cohort', () => {
    const a = generateStudents({ planners: [computing], count: 8, seed: 42 });
    const b = generateStudents({ planners: [computing], count: 8, seed: 42 });
    expect(a).toEqual(b);
  });

  test('a different seed produces a different cohort', () => {
    const a = generateStudents({ planners: [computing], count: 8, seed: 1 });
    const b = generateStudents({ planners: [computing], count: 8, seed: 2 });
    expect(a).not.toEqual(b);
  });

  // IDs run from the same range the portal uses, so a generated cohort works with the Min/Max student ID
  // filter on the Class Estimation page.
  test('student IDs are unique and start at the portal range', () => {
    const students = generateStudents({ planners: [computing], count: 20, seed: 7 });

    expect(new Set(students.map((s) => s.studentId)).size).toBe(20);
    expect(students[0].studentId).toBe('102780000');
    expect(students[19].studentId).toBe('102780019');
    for (const student of students) expect(student.studentId).toMatch(/^\d{9}$/);
  });

  // This is the property the generator exists for. Cohort-level signals are meaningless without it.
  test('produces genuinely different histories, not one transcript repeated', () => {
    const students = generateStudents({ planners: [computing, software], count: 20, seed: 3 });
    const distinct = new Set(students.map(historySignature));

    expect(distinct.size).toBeGreaterThan(5);
    expect(() => assertDistinctHistories(students)).not.toThrow();
  });

  test('spreads students across intakes and majors', () => {
    const students = generateStudents({ planners: [computing, software], count: 20, seed: 5 });

    expect(new Set(students.map((s) => s.majorName)).size).toBe(2);
    expect(new Set(students.map((s) => `${s.intake.year}-${s.intake.semester}`)).size).toBeGreaterThan(2);
  });

  test('spreads students across different points of progress', () => {
    const students = generateStudents({ planners: [computing], count: 20, seed: 11 });
    expect(new Set(students.map((s) => s.semestersElapsed)).size).toBeGreaterThan(1);
  });

  // The axis that matters most. Without deferral, every student in a major at the same stage would carry
  // an identical unit set, and any signal computed across a cohort would be the same for all of them.
  test('students in the same major at the same stage still differ in which units they have taken', () => {
    const students = generateStudents({ planners: [computing], count: 60, seed: 101 });

    const byStage = new Map<number, Set<string>>();
    for (const student of students) {
      const codes = student.rows.map(([code]) => code).sort().join(',');
      const existing = byStage.get(student.semestersElapsed) ?? new Set<string>();
      existing.add(codes);
      byStage.set(student.semestersElapsed, existing);
    }

    // At least one stage has students with genuinely different unit sets.
    const stagesWithVariation = [...byStage.values()].filter((sets) => sets.size > 1);
    expect(stagesWithVariation.length).toBeGreaterThan(0);
  });

  // Confirms deferral is what drives the variation above, by removing it. Booking next semester also
  // changes a unit set, so that has to be switched off too to isolate the one axis.
  test('with deferral and booking both off, a stage is uniform', () => {
    const students = generateStudents({
      planners: [computing], count: 30, seed: 103, deferRate: 0, scheduledRate: 0,
    });

    const sameStage = students.filter((s) => s.semestersElapsed === students[0].semestersElapsed);
    expect(sameStage.length).toBeGreaterThan(1);

    const unitSets = new Set(sameStage.map((s) => s.rows.map(([code]) => code).sort().join(',')));
    expect(unitSets.size).toBe(1);
  });

  // Majors are assigned by shuffling a round-robin list, so a small cohort still covers every planner
  // while no student's major is predictable from their position.
  test('major assignment is not positional but still covers every planner', () => {
    const three = [computing, software, { majorName: 'Third', units: computing.units }];
    const a = generateStudents({ planners: three, count: 9, seed: 5 });
    const b = generateStudents({ planners: three, count: 9, seed: 6 });

    expect(new Set(a.map((s) => s.majorName)).size).toBe(3);
    expect(new Set(b.map((s) => s.majorName)).size).toBe(3);
    // Different seeds put the majors in a different order.
    expect(a.map((s) => s.majorName)).not.toEqual(b.map((s) => s.majorName));
  });

  test('deferral never removes the first semester, so the intake stays readable', () => {
    // A high defer rate would otherwise strip the earliest term and break intake derivation.
    const students = generateStudents({ planners: [computing], count: 40, seed: 107, deferRate: 0.9 });

    for (const student of students) {
      const earliest = earliestSemesterTerm(student.rows.map(([, , , , , , term]) => term));
      expect(earliest?.year).toBe(student.intake.year);
      expect(earliest?.term).toBe(student.intake.semester);
    }
  });

  test('a student only has rows for units they have reached', () => {
    const [student] = generateStudents({ planners: [computing], count: 1, seed: 9 });
    expect(student.rows.length).toBeGreaterThan(0);
    expect(student.rows.length).toBeLessThanOrEqual(computing.units.length);
  });

  test('every row carries a term code the parser can read', () => {
    const students = generateStudents({ planners: [computing], count: 10, seed: 13 });
    for (const student of students) {
      for (const [, , , , , , term] of student.rows) {
        expect(parseTermCode(term)).not.toBeNull();
      }
    }
  });

  // The earliest semester on a transcript is what intake derivation reads, so it has to agree with the
  // intake the generator chose, or fixtures would be testing the wrong thing.
  test('the earliest term on a transcript matches the intake it was generated with', () => {
    const students = generateStudents({ planners: [computing], count: 10, seed: 17 });

    for (const student of students) {
      const earliest = earliestSemesterTerm(student.rows.map(([, , , , , , term]) => term));
      expect(earliest?.year).toBe(student.intake.year);
      expect(earliest?.term).toBe(student.intake.semester);
    }
  });

  test('statuses are limited to the three a real transcript uses', () => {
    const students = generateStudents({ planners: [computing], count: 25, seed: 19 });
    const statuses = new Set(students.flatMap((s) => s.rows.map(([, , , , status]) => status)));

    for (const status of statuses) {
      expect(['Complete', 'Current', 'Scheduled']).toContain(status);
    }
  });

  test('failed units earn no credit, passed units earn full credit', () => {
    const students = generateStudents({ planners: [computing], count: 40, seed: 23, failRate: 0.5 });
    const completed = students.flatMap((s) => s.rows.filter(([, , , , status]) => status === 'Complete'));
    const failed = completed.filter(([, , , , , grade]) => grade === 'N');

    expect(failed.length).toBeGreaterThan(0);
    for (const [, , , earned] of failed) expect(earned).toBe(0);
    for (const [, , credits, earned, , grade] of completed) {
      if (grade !== 'N') expect(earned).toBe(credits);
    }
  });

  test('conceded passes appear when asked for, and earn credit', () => {
    const students = generateStudents({ planners: [computing], count: 40, seed: 29, concededPassRate: 0.5 });
    const cp = students.flatMap((s) => s.rows.filter(([, , , , , grade]) => grade === 'CP'));

    expect(cp.length).toBeGreaterThan(0);
    for (const [, , credits, earned] of cp) expect(earned).toBe(credits);
  });

  test('respects per-unit credit overrides', () => {
    const withPlacement: FixturePlanner = {
      majorName: 'Computer Science',
      units: [
        { code: 'AIMFECS', title: 'Academic Integrity Module', credits: 0, yearLevel: 1, semester: 1 },
        { code: 'ICT20026', title: 'WIL Placement', credits: 25, yearLevel: 1, semester: 1 },
      ],
    };

    const [student] = generateStudents({ planners: [withPlacement], count: 1, seed: 31 });
    const credits = new Map(student.rows.map(([code, , c]) => [code, c]));

    expect(credits.get('AIMFECS')).toBe(0);
    expect(credits.get('ICT20026')).toBe(25);
  });

  test.each([
    ['no planners', { planners: [] as FixturePlanner[], count: 5 }],
    ['a zero count', { planners: [computing], count: 0 }],
  ])('rejects %s', (_label, options) => {
    expect(() => generateStudents(options)).toThrow();
  });
});

// Mock students should follow the majors actually loaded in the system, not one hand-written stand-in, so
// the generator takes its planners from the database. This mapping is what makes that possible, kept pure
// so it can be tested without a database.
describe('plannerToFixture', () => {
  const dbPlanner = (overrides: any = {}) => ({
    major: { name: 'Computer Science' },
    course: { name: 'Bachelor of Computer Science' },
    intake_year: 2024,
    units: [
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'COS10009', unit_name: 'Introduction to Programming' } },
      { category: 'major_core', year_level: 2, semester: 2, unit: { unit_code: 'COS20031', unit_name: 'Database Design Project' } },
    ],
    ...overrides,
  });

  test('maps units, keeping the planner slot as the order to work through them', () => {
    const fixture = plannerToFixture(dbPlanner())!;

    expect(fixture.majorName).toBe('Computer Science (2024)');
    expect(fixture.units).toEqual([
      { code: 'COS10009', title: 'Introduction to Programming', credits: undefined, yearLevel: 1, semester: 1 },
      { code: 'COS20031', title: 'Database Design Project', credits: undefined, yearLevel: 2, semester: 2 },
    ]);
  });

  // The generator walks a student semester by semester, and a short-term unit has no place in that
  // sequence. This mostly means WIL placements, which are excluded from estimates anyway.
  test('leaves out summer and winter slots', () => {
    const fixture = plannerToFixture(dbPlanner({
      units: [
        { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'COS10009', unit_name: 'Intro' } },
        { category: 'wil', year_level: 2, semester: 4, unit: { unit_code: 'ICT20016', unit_name: 'Work-Integrated Learning' } },
        { category: 'core', year_level: 2, semester: 3, unit: { unit_code: 'SUMMER1', unit_name: 'Summer Unit' } },
      ],
    }))!;

    expect(fixture.units.map((u: FixtureUnit) => u.code)).toEqual(['COS10009']);
  });

  test('skips unfilled elective slots, which have no unit attached', () => {
    const fixture = plannerToFixture(dbPlanner({
      units: [
        { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'COS10009', unit_name: 'Intro' } },
        { category: 'elective', year_level: 1, semester: 2, unit: null },
      ],
    }))!;

    expect(fixture.units.map((u: FixtureUnit) => u.code)).toEqual(['COS10009']);
  });

  test('keeps the first occurrence when a unit appears twice in one planner', () => {
    const fixture = plannerToFixture(dbPlanner({
      units: [
        { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'COS10009', unit_name: 'Intro' } },
        { category: 'core', year_level: 3, semester: 1, unit: { unit_code: 'COS10009', unit_name: 'Intro' } },
      ],
    }))!;

    expect(fixture.units).toHaveLength(1);
    expect(fixture.units[0].yearLevel).toBe(1);
  });

  // core/db has no per-unit credit field, so the known exceptions have to be supplied.
  test('applies credit overrides for the units that are not the standard rate', () => {
    const fixture = plannerToFixture(
      dbPlanner({
        units: [
          { category: 'mpu', year_level: 1, semester: 1, unit: { unit_code: 'AIMFECS', unit_name: 'Integrity Module' } },
          { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'COS10009', unit_name: 'Intro' } },
        ],
      }),
      { creditsByCode: { AIMFECS: 0 } },
    )!;

    expect(fixture.units.find((u: FixtureUnit) => u.code === 'AIMFECS')?.credits).toBe(0);
    expect(fixture.units.find((u: FixtureUnit) => u.code === 'COS10009')?.credits).toBeUndefined();
  });

  test('falls back to the course name, then a placeholder, when there is no major', () => {
    expect(plannerToFixture(dbPlanner({ major: null }))!.majorName).toBe('Bachelor of Computer Science (2024)');
    expect(plannerToFixture(dbPlanner({ major: null, course: null }))!.majorName).toBe('Unknown major (2024)');
  });

  test('returns null for a planner with no usable units', () => {
    expect(plannerToFixture(dbPlanner({ units: [] }))).toBeNull();
    expect(plannerToFixture(dbPlanner({ units: [{ category: 'core', year_level: 1, semester: 4, unit: { unit_code: 'W', unit_name: 'W' } }] }))).toBeNull();
  });

  test('plannersToFixtures drops the unusable ones', () => {
    const fixtures = plannersToFixtures([
      dbPlanner(),
      dbPlanner({ major: { name: 'Software Engineering' }, units: [] }),
    ]);

    expect(fixtures.map((f: FixturePlanner) => f.majorName)).toEqual(['Computer Science (2024)']);
  });

  // The whole point of reading from the database: a cohort spans every major loaded, not just one.
  test('a cohort generated from several mapped planners covers every major', () => {
    const fixtures = plannersToFixtures([
      dbPlanner(),
      dbPlanner({ major: { name: 'Software Engineering' } }),
      dbPlanner({ major: { name: 'Data Science' } }),
    ]);
    const students = generateStudents({ planners: fixtures, count: 9, seed: 3 });

    expect(new Set(students.map((s) => s.majorName)).size).toBe(3);
  });
});

describe('assertDistinctHistories', () => {
  // A generator change could quietly start emitting identical students. This is the guard that turns that
  // into a loud failure instead of a silently meaningless cohort.
  test('throws when every student has the same history', () => {
    const [one] = generateStudents({ planners: [computing], count: 1, seed: 2 });
    const clones = [one, { ...one, studentId: 'C2100001' }, { ...one, studentId: 'C2100002' }];

    expect(() => assertDistinctHistories(clones)).toThrow(/distinct histories/);
  });

  test('a single student is allowed, since there is nothing to compare', () => {
    const students = generateStudents({ planners: [computing], count: 1, seed: 2 });
    expect(() => assertDistinctHistories(students)).not.toThrow();
  });

  test('ignores the student ID, so renaming a clone does not fool it', () => {
    const [one] = generateStudents({ planners: [computing], count: 1, seed: 2 });
    expect(historySignature({ ...one, studentId: 'DIFFERENT' })).toBe(historySignature(one));
  });
});

// Fixtures must travel through the same reader as a real upload, or they would be testing a private path
// that production never uses.
describe('round trip through the real parser', () => {
  test('a single-student sheet parses back with the same units', () => {
    const [student] = generateStudents({ planners: [computing], count: 1, seed: 37 });
    const { students, warnings } = parseDpaWorkbook(workbook(toSingleStudentRows(student)));

    expect(warnings).toEqual([]);
    expect(students).toHaveLength(1);
    expect(students[0].courseList.map((c) => c.courseId)).toEqual(student.rows.map(([code]) => code));
  });

  test('a multi-student sheet parses back grouped by student', () => {
    const generated = generateStudents({ planners: [computing, software], count: 6, seed: 41 });
    const { students, hasStudentIdColumn, warnings } = parseDpaWorkbook(workbook(toMultiStudentRows(generated)));

    expect(warnings).toEqual([]);
    expect(hasStudentIdColumn).toBe(true);
    expect(students).toHaveLength(6);

    for (const gen of generated) {
      const parsed = students.find((s) => s.studentId === gen.studentId);
      expect(parsed?.courseList).toHaveLength(gen.rows.length);
    }
  });

  test('credits, grades and statuses survive the round trip', () => {
    const [student] = generateStudents({ planners: [computing], count: 1, seed: 43, concededPassRate: 0.5 });
    const { students } = parseDpaWorkbook(workbook(toSingleStudentRows(student)));

    students[0].courseList.forEach((parsed, i) => {
      const [code, title, credits, earned, status, grade, term] = student.rows[i];
      expect(parsed).toEqual({
        courseId: code, courseTitle: title, level: '',
        credits, creditsEarned: earned, status, grade, term,
      });
    });
  });
});
