// ============================================================
// Reads a DPA (Degree Progress Audit) export into transcript rows.
//
// The export has seven columns: Course | Course Title | Credits | Earned | Status | Grade | Term, which map
// onto ScrapedCourseListItem with only `level` missing. web/app/api/import/route.ts already read this shape
// for the dashboard's single-student import, but by fixed column position: if the columns were ever
// reordered, grades would silently be read as statuses. This locates columns by header name instead, and
// reports what it could not read rather than filtering bad rows away in silence.
//
// Two layouts are supported, because the HoD will have both:
//   - one file per student, the shape the portal exports, with the student identified outside the sheet
//   - one sheet holding many students, with a student-ID column, for bulk loads
// ============================================================

import * as XLSX from 'xlsx-js-style';
import type { ScrapedCourseListItem } from '../../../shared/types/student';

export interface DpaParseWarning {
  /** 1-based row number in the sheet, so a warning can be traced back to what the user sees. */
  row: number;
  message: string;
}

export interface DpaStudentTranscript {
  /** Present only when the sheet carried a student-ID column. */
  studentId?: string;
  courseList: ScrapedCourseListItem[];
}

export interface DpaParseResult {
  students: DpaStudentTranscript[];
  warnings: DpaParseWarning[];
  /** True when a student-ID column was found, so the caller knows not to fall back to the filename. */
  hasStudentIdColumn: boolean;
}

export class DpaParseError extends Error {}

// Header aliases, lowercased and stripped of punctuation. The portal's own wording comes first; the rest
// are variations seen in hand-edited copies.
const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  courseId:      ['course', 'course code', 'unit', 'unit code'],
  courseTitle:   ['course title', 'unit title', 'title', 'course name', 'unit name'],
  credits:       ['credits', 'credit', 'credit points', 'cp'],
  creditsEarned: ['earned', 'credits earned', 'earned credits'],
  status:        ['status'],
  grade:         ['grade', 'result'],
  term:          ['term', 'teaching period', 'period'],
  studentId:     ['student id', 'studentid', 'student', 'student number', 'id'],
};

interface ColumnMap {
  courseId: number;
  courseTitle: number;
  credits: number;
  creditsEarned: number;
  status: number;
  grade: number;
  term: number;
  studentId: number;
}

function normaliseHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
}

function findColumns(row: unknown[]): Partial<ColumnMap> {
  const found: Partial<ColumnMap> = {};
  row.forEach((cell, index) => {
    const header = normaliseHeader(cell);
    if (!header) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ColumnMap, string[]][]) {
      // First match wins, so a sheet with both "Course" and "Course Title" keeps them apart.
      if (found[field] === undefined && aliases.includes(header)) {
        found[field] = index;
        return;
      }
    }
  });
  return found;
}

// The header is not always the first row: exports sometimes carry a title or a blank line above it. Scan a
// short way down for the row that looks most like a header, which is the one naming a course column.
function locateHeader(rows: unknown[][]): { index: number; columns: ColumnMap } {
  const limit = Math.min(rows.length, 20);
  for (let i = 0; i < limit; i++) {
    const columns = findColumns(rows[i] ?? []);
    if (columns.courseId !== undefined && columns.status !== undefined) {
      return {
        index: i,
        columns: {
          courseId: columns.courseId,
          courseTitle: columns.courseTitle ?? -1,
          credits: columns.credits ?? -1,
          creditsEarned: columns.creditsEarned ?? -1,
          status: columns.status,
          grade: columns.grade ?? -1,
          term: columns.term ?? -1,
          studentId: columns.studentId ?? -1,
        },
      };
    }
  }
  throw new DpaParseError(
    'Could not find a DPA header row. Expected columns named Course, Course Title, Credits, Earned, Status, Grade and Term.',
  );
}

function cell(row: unknown[], index: number): string {
  if (index < 0) return '';
  return String(row[index] ?? '').trim();
}

function numericCell(row: unknown[], index: number): number {
  if (index < 0) return 0;
  const value = Number(String(row[index] ?? '').trim());
  return Number.isFinite(value) ? value : 0;
}

/**
 * Parses a DPA workbook or CSV. Throws DpaParseError when the file is not a DPA at all; individual bad rows
 * become warnings so one malformed line cannot discard a whole cohort's import.
 */
export function parseDpaWorkbook(input: Buffer | ArrayBuffer | Uint8Array): DpaParseResult {
  // Buffer is a Uint8Array subclass, so this covers a Node route handler and a browser File alike.
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new DpaParseError('The file contains no sheets.');

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false }) as unknown[][];
  if (rows.length === 0) throw new DpaParseError('The first sheet is empty.');

  const { index: headerIndex, columns } = locateHeader(rows);
  const warnings: DpaParseWarning[] = [];
  const byStudent = new Map<string, ScrapedCourseListItem[]>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;

    const courseId = cell(row, columns.courseId).toUpperCase();
    if (!courseId) {
      // A row with no unit code is usually a spacer or a subtotal, not an error worth shouting about, but
      // it is still reported so a genuinely truncated row cannot vanish unnoticed.
      if (row.some((value) => String(value ?? '').trim())) {
        warnings.push({ row: rowNumber, message: 'Skipped: no unit code in the Course column.' });
      }
      continue;
    }

    const status = cell(row, columns.status);
    if (!status) warnings.push({ row: rowNumber, message: `${courseId}: no Status, so it counts as not taken.` });

    const term = cell(row, columns.term);
    if (columns.term >= 0 && !term) {
      warnings.push({ row: rowNumber, message: `${courseId}: no Term, so it cannot inform the intake.` });
    }

    const item: ScrapedCourseListItem = {
      courseId,
      courseTitle: cell(row, columns.courseTitle),
      level: '',
      credits: numericCell(row, columns.credits),
      creditsEarned: numericCell(row, columns.creditsEarned),
      status,
      grade: cell(row, columns.grade),
      term,
    };

    const studentId = cell(row, columns.studentId).toUpperCase();
    const key = studentId || '';
    const existing = byStudent.get(key);
    if (existing) existing.push(item);
    else byStudent.set(key, [item]);
  }

  const hasStudentIdColumn = columns.studentId >= 0;
  const students: DpaStudentTranscript[] = [...byStudent.entries()]
    .filter(([, courseList]) => courseList.length > 0)
    .map(([studentId, courseList]) => (studentId ? { studentId, courseList } : { courseList }));

  if (students.length === 0) throw new DpaParseError('No transcript rows were found below the header.');

  return { students, warnings, hasStudentIdColumn };
}

/**
 * Pulls a student ID out of a filename, for the one-file-per-student layout where the sheet itself has no
 * ID column. "c0210929-Tyans_DPA.xlsx" gives "C0210929". Returns null when nothing ID-shaped is present,
 * so the caller can ask rather than invent one.
 */
export function studentIdFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const match = base.match(/[A-Za-z]?\d{6,}/);
  return match ? match[0].toUpperCase() : null;
}
