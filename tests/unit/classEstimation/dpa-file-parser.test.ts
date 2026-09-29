// ============================================================
// Tests for core/services/classEstimation/dpaImport/dpaFileParser.ts.
// Workbooks are built in memory with xlsx-js-style rather than committing fixture files, so the expected
// layout is visible in the test itself. The first case is the real Tyans_DPA.xlsx shape: a 0-credit
// integrity module, a 25-credit WIL placement in a winter term, and the three statuses that appear on a
// real transcript (Complete, Current, Scheduled).
// ============================================================

import * as XLSX from 'xlsx-js-style';
import {
  parseDpaWorkbook,
  studentIdFromFilename,
  DpaParseError,
} from '@core/services/classEstimation/dpaImport/dpaFileParser';

const DPA_HEADER = ['Course', 'Course Title', 'Credits', 'Earned', 'Status', 'Grade', 'Term'];

function workbook(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseDpaWorkbook', () => {
  test('reads the real DPA layout, including 0-credit, 25-credit and every status', () => {
    const buffer = workbook([
      DPA_HEADER,
      ['AIMFECS', 'Academic Integrity Training Module (FECS)', 0, 0, 'Complete', 'NCOM', '2024_FEB_S1'],
      ['COS10009', 'Introduction to Programming', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1'],
      ['ICT20026', 'Work Integrated Learning Placement', 25, 0, 'Scheduled', '', '2026_JUN_WT'],
      ['COS20028', 'Big Data Architecture and Application', 12.5, 0, 'Current', '', '2026_SEP_S2'],
    ]);

    const { students, warnings, hasStudentIdColumn } = parseDpaWorkbook(buffer);

    expect(hasStudentIdColumn).toBe(false);
    expect(students).toHaveLength(1);
    expect(students[0].studentId).toBeUndefined();
    expect(warnings).toEqual([]);

    expect(students[0].courseList).toEqual([
      { courseId: 'AIMFECS', courseTitle: 'Academic Integrity Training Module (FECS)', level: '', credits: 0, creditsEarned: 0, status: 'Complete', grade: 'NCOM', term: '2024_FEB_S1' },
      { courseId: 'COS10009', courseTitle: 'Introduction to Programming', level: '', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'HD', term: '2024_FEB_S1' },
      { courseId: 'ICT20026', courseTitle: 'Work Integrated Learning Placement', level: '', credits: 25, creditsEarned: 0, status: 'Scheduled', grade: '', term: '2026_JUN_WT' },
      { courseId: 'COS20028', courseTitle: 'Big Data Architecture and Application', level: '', credits: 12.5, creditsEarned: 0, status: 'Current', grade: '', term: '2026_SEP_S2' },
    ]);
  });

  // The route this replaces read by fixed column position, so a reordered export would have silently read
  // grades as statuses. Locating columns by header name removes that failure mode.
  test('locates columns by header name, not position', () => {
    const buffer = workbook([
      ['Term', 'Grade', 'Status', 'Earned', 'Credits', 'Course Title', 'Course'],
      ['2024_FEB_S1', 'HD', 'Complete', 12.5, 12.5, 'Introduction to Programming', 'COS10009'],
    ]);

    const [student] = parseDpaWorkbook(buffer).students;
    expect(student.courseList[0]).toMatchObject({
      courseId: 'COS10009', grade: 'HD', status: 'Complete', credits: 12.5, term: '2024_FEB_S1',
    });
  });

  test('accepts common header wording variations', () => {
    const buffer = workbook([
      ['Unit Code', 'Unit Title', 'Credit Points', 'Credits Earned', 'Status', 'Result', 'Teaching Period'],
      ['COS10009', 'Introduction to Programming', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1'],
    ]);

    const [student] = parseDpaWorkbook(buffer).students;
    expect(student.courseList[0]).toMatchObject({ courseId: 'COS10009', grade: 'HD', credits: 12.5 });
  });

  // Exports sometimes carry a title line or a blank row above the header.
  test('finds a header that is not the first row', () => {
    const buffer = workbook([
      ['Degree Progress Audit'],
      [],
      DPA_HEADER,
      ['COS10009', 'Introduction to Programming', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1'],
    ]);

    expect(parseDpaWorkbook(buffer).students[0].courseList).toHaveLength(1);
  });

  test('uppercases unit codes so they match the catalogue', () => {
    const buffer = workbook([DPA_HEADER, ['cos10009', 'Intro', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1']]);
    expect(parseDpaWorkbook(buffer).students[0].courseList[0].courseId).toBe('COS10009');
  });

  describe('many students in one sheet', () => {
    test('groups rows by the student ID column', () => {
      const buffer = workbook([
        ['Student ID', ...DPA_HEADER],
        ['C0210929', 'COS10009', 'Intro', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1'],
        ['C0210930', 'COS10009', 'Intro', 12.5, 12.5, 'Complete', 'D', '2024_FEB_S1'],
        ['C0210929', 'COS20007', 'OOP', 12.5, 12.5, 'Complete', 'C', '2024_SEP_S2'],
      ]);

      const { students, hasStudentIdColumn } = parseDpaWorkbook(buffer);

      expect(hasStudentIdColumn).toBe(true);
      expect(students).toHaveLength(2);
      expect(students.find((s) => s.studentId === 'C0210929')?.courseList.map((c) => c.courseId))
        .toEqual(['COS10009', 'COS20007']);
      expect(students.find((s) => s.studentId === 'C0210930')?.courseList).toHaveLength(1);
    });
  });

  describe('warnings rather than silent drops', () => {
    // The previous route filtered short rows away with no trace, so a truncated line looked like a student
    // who simply had not taken the unit.
    test('reports a row with no unit code, and keeps going', () => {
      const buffer = workbook([
        DPA_HEADER,
        ['COS10009', 'Intro', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1'],
        ['', 'Subtotal', 25, 25, '', '', ''],
        ['COS20007', 'OOP', 12.5, 12.5, 'Complete', 'C', '2024_SEP_S2'],
      ]);

      const { students, warnings } = parseDpaWorkbook(buffer);

      expect(students[0].courseList).toHaveLength(2);
      expect(warnings).toEqual([{ row: 3, message: 'Skipped: no unit code in the Course column.' }]);
    });

    test('reports a missing status and a missing term', () => {
      const buffer = workbook([
        DPA_HEADER,
        ['COS10009', 'Intro', 12.5, 12.5, '', 'HD', ''],
      ]);

      const { warnings } = parseDpaWorkbook(buffer);
      expect(warnings.map((w) => w.message)).toEqual([
        'COS10009: no Status, so it counts as not taken.',
        'COS10009: no Term, so it cannot inform the intake.',
      ]);
    });

    test('a fully blank row is skipped without a warning', () => {
      const buffer = workbook([
        DPA_HEADER,
        ['COS10009', 'Intro', 12.5, 12.5, 'Complete', 'HD', '2024_FEB_S1'],
        [],
      ]);

      expect(parseDpaWorkbook(buffer).warnings).toEqual([]);
    });
  });

  describe('files that are not a DPA', () => {
    test('throws when no header row can be found', () => {
      const buffer = workbook([['Planner'], ['Year 1'], ['COS10009', 'Intro']]);
      expect(() => parseDpaWorkbook(buffer)).toThrow(DpaParseError);
    });

    test('throws when the header exists but nothing follows it', () => {
      expect(() => parseDpaWorkbook(workbook([DPA_HEADER]))).toThrow(/No transcript rows/);
    });

    test('throws on an empty sheet', () => {
      expect(() => parseDpaWorkbook(workbook([]))).toThrow(DpaParseError);
    });
  });
});

describe('studentIdFromFilename', () => {
  test.each([
    ['c0210929-Tyans_DPA.xlsx', 'C0210929'],
    ['C0210929.xlsx', 'C0210929'],
    ['DPA_102780001.csv', '102780001'],
  ])('%s gives %s', (filename, expected) => {
    expect(studentIdFromFilename(filename)).toBe(expected);
  });

  // Returning null lets the caller ask for the ID instead of inventing a wrong one.
  test.each(['transcript.xlsx', 'DPA.xlsx', 'sem1.xlsx'])('%s has no ID to take', (filename) => {
    expect(studentIdFromFilename(filename)).toBeNull();
  });
});
