import * as XLSX from 'xlsx-js-style';
import type { ScrapedCourseListItem } from '../../shared/types/student';

export interface ParsedCohortStudent {
  studentId: string;
  studentName: string;
  intakeYear: number;
  intakeMonth: number;
  courseList: ScrapedCourseListItem[];
}

/**
 * Parse a multi-student cohort Excel file.
 *
 * Expected format:
 *   Student header row: [STUDENT_ID, STUDENT_NAME, INTAKE_YEAR, INTAKE_MONTH, ...]
 *   Unit rows follow:   [UNIT_CODE, UNIT_TITLE, CREDITS, CREDITS_EARNED, STATUS, GRADE, TERM]
 *
 * A student header row is identified by a 7–10 digit numeric string in column 0.
 * A unit row is identified by a unit code pattern ([A-Z]{2,4}\d{4}) in column 0.
 */
export function parseCohortExcel(buffer: Buffer): ParsedCohortStudent[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  const students: ParsedCohortStudent[] = [];
  let current: ParsedCohortStudent | null = null;

  for (const row of rows) {
    if (isStudentHeaderRow(row)) {
      // Push previous student before starting a new one
      if (current) students.push(current);
      current = {
        studentId: String(row[0]).trim(),
        studentName: String(row[1] ?? '').trim(),
        intakeYear: Number(row[2]) || new Date().getFullYear(),
        intakeMonth: Number(row[3]) || 1,
        courseList: [],
      };
    } else if (current && isUnitRow(row)) {
      current.courseList.push({
        courseId:      String(row[0]).trim().toUpperCase(),
        courseTitle:   String(row[1] ?? '').trim(),
        level:         '',
        credits:       Number(row[2]) || 0,
        creditsEarned: Number(row[3]) || 0,
        status:        String(row[4] ?? '').trim(),
        grade:         String(row[5] ?? '').trim(),
        term:          String(row[6] ?? '').trim(),
      });
    }
    // Skip header rows, blank rows, and any non-matching rows
  }

  // Push the last student
  if (current) students.push(current);

  return students;
}

function isStudentHeaderRow(row: any[]): boolean {
  // A student header row has a 7–10 digit numeric string in column 0
  return (
    row.length >= 2 &&
    /^\d{7,10}$/.test(String(row[0] ?? '').trim())
  );
}

function isUnitRow(row: any[]): boolean {
  // A unit row has a unit code pattern in column 0 (e.g. CSC1024)
  return (
    row.length >= 5 &&
    /^[A-Z]{2,4}\d{4}/i.test(String(row[0] ?? '').trim())
  );
}
