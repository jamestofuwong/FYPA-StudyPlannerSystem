// ============================================================
// Reads the Term column on a DPA export, e.g. "2024_FEB_S1", "2026_JUN_WT".
//
// This is the most reliable signal a transcript carries about when a unit was taken: the code states the
// year and the teaching period outright. Intake is derived from the earliest term rather than from
// enrollmentDate, which arrives in an ambiguous DD/MM/YYYY form and has already needed one round of
// parsing fixes.
//
// Term numbers match the unit_offerings convention used everywhere else in the codebase
// (1 = Semester 1, 2 = Semester 2, 3 = Summer, 4 = Winter), so a parsed term can be compared directly
// against a unit's offered_in rows.
// ============================================================

export type TermKind = 'semester' | 'summer' | 'winter';

export interface ParsedTerm {
  year: number;
  /** Calendar month the period starts in, 1-12, from the month name in the code. */
  month: number;
  /** 1 = Semester 1, 2 = Semester 2, 3 = Summer, 4 = Winter. */
  term: number;
  kind: TermKind;
  /** The code as written, kept so warnings and diagnostics can quote the original. */
  raw: string;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// S1/S2 are the two teaching semesters. ST and WT are the short summer and winter terms, which the
// estimator does not schedule but which do appear on real transcripts (a WIL placement taken over a break,
// for instance).
const PERIODS: Record<string, { term: number; kind: TermKind }> = {
  S1: { term: 1, kind: 'semester' },
  S2: { term: 2, kind: 'semester' },
  ST: { term: 3, kind: 'summer' },
  WT: { term: 4, kind: 'winter' },
};

// The period is a letter followed by a letter or a digit: S1, S2, ST, WT.
const TERM_CODE = /^(\d{4})[_-]([A-Z]{3})[_-]([A-Z][A-Z0-9])$/;

/**
 * Parses a DPA term code. Returns null for anything unrecognised rather than guessing, so the caller can
 * warn and fall back instead of silently placing a student in the wrong intake.
 */
export function parseTermCode(raw: string | null | undefined): ParsedTerm | null {
  const text = (raw ?? '').trim().toUpperCase();
  const match = text.match(TERM_CODE);
  if (!match) return null;

  const [, yearText, monthName, periodCode] = match;
  const month = MONTHS[monthName];
  const period = PERIODS[periodCode];
  if (month === undefined || period === undefined) return null;

  return { year: Number(yearText), month, term: period.term, kind: period.kind, raw: text };
}

/** Chronological order: year first, then the month the period starts in. */
export function compareTerms(a: ParsedTerm, b: ParsedTerm): number {
  return a.year - b.year || a.month - b.month;
}

/**
 * The earliest term across a transcript, which is where a student's intake sits. Unparseable codes are
 * skipped; null means none could be read at all.
 */
export function earliestTerm(rawCodes: ReadonlyArray<string | null | undefined>): ParsedTerm | null {
  let earliest: ParsedTerm | null = null;
  for (const raw of rawCodes) {
    const parsed = parseTermCode(raw);
    if (!parsed) continue;
    if (!earliest || compareTerms(parsed, earliest) < 0) earliest = parsed;
  }
  return earliest;
}

/**
 * An intake starts in a teaching semester, never in a short term. A student who began with a summer or
 * winter unit would otherwise be read as having a "winter intake", which no planner has. Falls back to the
 * earliest term of any kind when there is no semester term to find.
 */
export function earliestSemesterTerm(rawCodes: ReadonlyArray<string | null | undefined>): ParsedTerm | null {
  const semesterOnly = rawCodes.filter((raw) => parseTermCode(raw)?.kind === 'semester');
  return earliestTerm(semesterOnly) ?? earliestTerm(rawCodes);
}
