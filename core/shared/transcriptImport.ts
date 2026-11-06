// ============================================================
// Turns the course list of an uploaded results spreadsheet into the completed semesters that the student website's
// Plan Builder asks for: a list of semesters, each with the unit codes the student did in it.
//
// Only unit codes and terms are kept. Grades are used here to decide what counts and are not passed on, because the
// Plan Builder never receives grade data.
//
// Pure, so the page, the tests and any other caller share it.
// ============================================================

import type { ScrapedCourseListItem } from './types/student';
import { normaliseUnitCode, resolveUnitStates, unitStateOfRow } from './constants/grades';
import { compareTerms, parseTermCode, type ParsedTerm } from './termCode';

export interface ImportedSemester {
  /** The term as written in the file, such as 2026_MAR_S1. Empty for a semester that the student did not study (a gap). */
  term: string;
  unitCodes: string[];
}

export interface TranscriptImport {
  /** One entry for each calendar semester from the first to the last one in the file. A semester with no units is a gap. */
  semesters: ImportedSemester[];
  /** Units passed, a Conceded Pass included. */
  passed: string[];
  /** Units the student is taking now. They count as done, as everywhere else in the system. */
  inProgress: string[];
  /** Units failed and not passed since. They stay to be taken again, so they are not in the semesters. */
  failed: string[];
  /** Units that are in the semesters but whose file had no readable term. They sit in the first semester. */
  withoutTerm: string[];
  /** The earliest term in the file, as written, or null when no term could be read. */
  firstTerm: string | null;
}

/** One calendar semester: Semester 1 runs from February or March, Semester 2 from August or September. */
function semesterKey(term: ParsedTerm): number {
  return term.year * 2 + (term.month >= 7 ? 1 : 0);
}

interface Placed {
  code: string;
  term: ParsedTerm | null;
}

/**
 * @param rows the course list of the file (see parseResultsSheet)
 */
export function completedSemestersFromTranscript(rows: ReadonlyArray<ScrapedCourseListItem>): TranscriptImport {
  const states = resolveUnitStates(rows);
  const passed: string[] = [];
  const inProgress: string[] = [];
  const failed: string[] = [];

  // Each unit goes where its deciding row is: the row that gives it its final state, the latest one if there are two
  // (a unit passed in a supplementary attempt belongs to the later term).
  const placed: Placed[] = [];
  for (const [code, state] of states) {
    if (state === 'must_retake') { failed.push(code); continue; }
    if (state !== 'passed' && state !== 'in_progress') continue;
    (state === 'passed' ? passed : inProgress).push(code);

    let best: ParsedTerm | null = null;
    for (const row of rows) {
      if (normaliseUnitCode(row.courseId) !== code || unitStateOfRow(row) !== state) continue;
      const term = parseTermCode(row.term);
      if (term && (!best || compareTerms(term, best) > 0)) best = term;
    }
    placed.push({ code, term: best });
  }

  // The regular semesters (S1 and S2) fix the order. The short summer and winter terms join the semester before them.
  const regular = placed.flatMap((p) => (p.term && p.term.kind === 'semester' ? [p.term] : []));
  const shortTerms = placed.flatMap((p) => (p.term && p.term.kind !== 'semester' ? [p.term] : []));
  const allTerms = [...regular, ...shortTerms];
  const earliest = allTerms.length ? allTerms.reduce((a, b) => (compareTerms(b, a) < 0 ? b : a)) : null;

  const regularKeys = regular.map(semesterKey);
  let first = regularKeys.length ? Math.min(...regularKeys) : null;
  const last = regularKeys.length ? Math.max(...regularKeys) : null;

  // Only short terms in the file: they make one semester of their own.
  if (first === null && shortTerms.length) first = Math.min(...shortTerms.map(semesterKey));
  if (first === null) {
    const withoutTerm = placed.map((p) => p.code).sort();
    return {
      semesters: withoutTerm.length ? [{ term: '', unitCodes: withoutTerm }] : [],
      passed: passed.sort(), inProgress: inProgress.sort(), failed: failed.sort(), withoutTerm, firstTerm: null,
    };
  }
  const end = last ?? first;

  const bySemester = new Map<number, { term: string; codes: string[] }>();
  for (let key = first; key <= end; key++) bySemester.set(key, { term: '', codes: [] });
  const withoutTerm: string[] = [];

  for (const { code, term } of placed) {
    if (!term) { withoutTerm.push(code); continue; }
    let key = semesterKey(term);
    if (term.kind !== 'semester') {
      // a summer or winter term belongs to the latest semester that began before it
      const before = regularKeys.filter((k) => k <= key);
      key = before.length ? Math.max(...before) : first;
    }
    key = Math.min(Math.max(key, first), end);
    const slot = bySemester.get(key)!;
    slot.codes.push(code);
    if (!slot.term && term.kind === 'semester') slot.term = term.raw;
  }

  const semesters: ImportedSemester[] = [...bySemester.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, slot]) => ({ term: slot.term, unitCodes: slot.codes.sort() }));
  // Units with no readable term go to the first semester, so that they still count.
  if (withoutTerm.length) semesters[0].unitCodes = [...semesters[0].unitCodes, ...withoutTerm].sort();

  return {
    semesters,
    passed: passed.sort(),
    inProgress: inProgress.sort(),
    failed: failed.sort(),
    withoutTerm: withoutTerm.sort(),
    firstTerm: earliest ? earliest.raw : null,
  };
}
