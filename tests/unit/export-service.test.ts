import * as XLSX from 'xlsx-js-style';
import { generateExport } from '../../core/services/export/exportService';
import type { ExportInput, ExportSection } from '../../core/shared/types/export';

const unit = (code: string, name: string, year: number, sem: number, category: string) =>
  ({ year_level: year, semester: sem, category, unit: { unit_code: code, unit_name: name } });

function input(sections: ExportSection[], over: Partial<ExportInput> = {}): ExportInput {
  return {
    options: { sections },
    studentId: '102780123',
    intakeYear: 2024,
    completedCodes: ['COS10009', 'SWE20001'],
    enrollmentMode: 'scrape',
    appVersion: '9.9.9',
    student: {
      studentName: 'Alex Tan', course: 'BCS', status: 'Active', cgpa: 3.4, creditsRequired: 300, creditsCompleted: 25,
      gradeLevel: 'Year 2', enrollmentDate: '2024-02-26', graduationDate: null, scheduledCredits: 0,
      courseList: [
        { courseId: 'COS10009', courseTitle: 'Intro', level: 'UG', credits: 12.5, creditsEarned: 12.5, status: 'Completed', grade: 'HD', term: '2024 S1' },
        { courseId: 'SWE20001', courseTitle: 'Dev', level: 'UG', credits: 12.5, creditsEarned: 12.5, status: 'Completed', grade: 'D', term: '2024 S2' },
        { courseId: 'COS20007', courseTitle: 'OOP', level: 'UG', credits: 12.5, creditsEarned: 0, status: 'Current', grade: '', term: '2025 S1' },
      ],
    },
    match: { studentID: '102780123', courseType: 'bachelor', status: 'matched', isOverride: false, primaryMajor: null, secondMajor: null,
      topAlternatives: [], detectedMinors: [], rankedPlanners: [], unavailableUnits: [] } as never,
    planner: {
      course: { name: 'Bachelor of Computer Science', code: 'BCS' },
      major: { name: 'Software Development' },
      intakeMonth: 2,
      units: [
        unit('COS10009', 'Introduction to Programming', 1, 1, 'core'),
        unit('SWE20001', 'Development Project 1', 2, 1, 'core'),
        unit('COS20007', 'Object Oriented Programming', 2, 2, 'major_core'),
        unit('SWE30001', 'Real-Time Software', 3, 1, 'major_core'),
        { year_level: 3, semester: 2, category: 'free_elective', unit: null },
      ],
    },
    ...over,
  } as ExportInput;
}

const open = (buf: Buffer) => XLSX.read(buf, { type: 'buffer' });
const rows = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: '' });

describe('generateExport', () => {
  test('always starts with the Report Info sheet, then one sheet per selected section in order', () => {
    const wb = open(generateExport(input(['study_planner', 'student_profile'])));
    expect(wb.SheetNames).toEqual(['Report Info', 'Study Planner', 'Student Profile']);
  });

  test('a sheet is created only for sections the user ticked', () => {
    expect(open(generateExport(input(['unit_plan']))).SheetNames).toEqual(['Report Info', 'Completed Units']);
  });

  test('Report Info records the student, data source, planner label and version', () => {
    const r = Object.fromEntries(rows(open(generateExport(input(['student_profile']))), 'Report Info').slice(1));
    expect(r['Student ID']).toBe('102780123');
    expect(r['Student Name']).toBe('Alex Tan');
    expect(r['Data Source']).toBe('Web Scrape (Anthology Portal)');
    expect(r['Planner']).toBe('Bachelor of Computer Science · Software Development · 2024 February');
    expect(r['System Version']).toBe('9.9.9');
    expect(r['Sections Included']).toBe('Student Profile');
  });

  test('a manual import does not print the placeholder id as a real id', () => {
    const r = Object.fromEntries(rows(open(generateExport(input(['student_profile'], { studentId: 'imported', enrollmentMode: 'import_xlsx' }))), 'Report Info').slice(1));
    expect(r['Student ID']).toBe('— (manual import)');
    expect(r['Data Source']).toBe('Manual Import — Excel File');
  });

  test('the Student Profile sheet shows the profile, with "—" for a missing value', () => {
    const wb = open(generateExport(input(['student_profile'])));
    const r = Object.fromEntries(rows(wb, 'Student Profile').slice(1));
    expect(r['GPA']).toBe(3.4);
    expect(r['Credits Completed']).toBe(25);
    expect(r['Expected Graduation']).toBe('—');
  });

  test('Completed Units lists only completed units, in year/semester order, with the grade', () => {
    const body = rows(open(generateExport(input(['unit_plan']))), 'Completed Units').slice(1);
    expect(body.map((r) => [r[0], r[5]])).toEqual([['COS10009', 'HD'], ['SWE20001', 'D']]);
    expect(body[1][2]).toBe('Year 2 (2025)');
    expect(body[0][4]).toBe('Core');
  });

  test('Study Planner marks Completed, Current and Pending and skips empty slots', () => {
    const body = rows(open(generateExport(input(['study_planner']))), 'Study Planner');
    const status = Object.fromEntries(body.filter((r) => /^[A-Z]{3}\d{5}$/.test(r[0])).map((r) => [r[0], r[3]]));
    expect(status).toEqual({ COS10009: 'Completed', SWE20001: 'Completed', COS20007: 'Current', SWE30001: 'Pending' });
    expect(body.some((r) => String(r[0]).startsWith('Year 3 (2026)'))).toBe(true);
    expect(body.flat()).not.toContain('Free Elective');
  });

  test('Major & Course Match lists units to be taken, but not completed or current ones', () => {
    const body = rows(open(generateExport(input(['major_match']))), 'Major & Course Match');
    const todo = body.map((r) => r[0]).filter((c) => /^[A-Z]{3}\d{5}$/.test(c));
    expect(todo).toEqual(['SWE30001']);
    expect(body.find((r) => r[0] === 'Major')![1]).toBe('—');
  });

  test('the output is a valid xlsx file (zip signature)', () => {
    const buf = generateExport(input(['student_profile']));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});
