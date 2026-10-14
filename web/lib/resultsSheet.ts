import type { ScrapedCourseListItem } from '../../core/shared/types/student';

// ---------------------------------------------------------------------------
// Reads the course list out of an uploaded results spreadsheet by column name,
// so the order of the columns, extra columns, and title rows above the header
// do not matter.
// ---------------------------------------------------------------------------

/** Columns the import cannot work without. */
export const REQUIRED_COLUMNS = ['Course', 'Credits', 'Earned', 'Status'] as const;
/** Columns that are read when present and left blank when not. */
export const OPTIONAL_COLUMNS = ['Course Title', 'Grade', 'Term'] as const;

/** How many rows from the top are searched for the header. */
const HEADER_SEARCH_ROWS = 20;

type ColumnName = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

export type ParsedResultsSheet =
  | { ok: true; courseList: ScrapedCourseListItem[] }
  | { ok: false; error: string };

/** Case, surrounding spaces and repeated spaces in a header do not matter. */
function normaliseHeader(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const WANTED = new Map<string, ColumnName>(
  [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((name) => [normaliseHeader(name), name]),
);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function columnsIn(row: unknown[]): Partial<Record<ColumnName, number>> {
  const found: Partial<Record<ColumnName, number>> = {};
  row.forEach((cell, index) => {
    const name = WANTED.get(normaliseHeader(cell));
    // If a name appears twice, the first one wins.
    if (name && !(name in found)) found[name] = index;
  });
  return found;
}

/**
 * @param rows the first sheet as arrays of cells (header: 1)
 */
export function parseResultsSheet(rows: unknown[][]): ParsedResultsSheet {
  let headerIndex = -1;
  let columns: Partial<Record<ColumnName, number>> = {};
  let bestMatches = -1;
  let bestColumns: Partial<Record<ColumnName, number>> = {};

  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const found = columnsIn(rows[i] ?? []);
    if (REQUIRED_COLUMNS.every((name) => name in found)) {
      headerIndex = i;
      columns = found;
      break;
    }
    const matches = Object.keys(found).length;
    if (matches > bestMatches) {
      bestMatches = matches;
      bestColumns = found;
    }
  }

  if (headerIndex < 0) {
    const missing = REQUIRED_COLUMNS.filter((name) => !(name in bestColumns));
    return {
      ok: false,
      error:
        `Could not find the column${missing.length === 1 ? '' : 's'} ${missing.map((m) => `"${m}"`).join(', ')} in the header row. ` +
        `The file needs a header row with: ${[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].join(', ')}.`,
    };
  }

  const cell = (row: unknown[], name: ColumnName): unknown => {
    const index = columns[name];
    return index === undefined ? undefined : row[index];
  };

  const courseList: ScrapedCourseListItem[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row) continue;
    const courseId = text(cell(row, 'Course'));
    if (!courseId) continue;
    courseList.push({
      courseId,
      courseTitle: text(cell(row, 'Course Title')),
      level: '',
      credits: Number(cell(row, 'Credits')) || 0,
      creditsEarned: Number(cell(row, 'Earned')) || 0,
      status: text(cell(row, 'Status')),
      grade: text(cell(row, 'Grade')),
      term: text(cell(row, 'Term')),
    });
  }

  if (courseList.length === 0) return { ok: false, error: 'File has no data rows.' };
  return { ok: true, courseList };
}
