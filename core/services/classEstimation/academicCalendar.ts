// ============================================================
// Works out which semester an estimate is for, from the date, so nobody has to pick one by hand.
//
// A class estimate is always about the next teaching semester, never an arbitrary one: the HoD wants to know
// what to staff next, and the answer follows from today's date. Picking the term manually only creates a way
// to produce a confident, wrong number, so the target is derived here and the UI reports it rather than asks.
//
// The local calendar, which is what this encodes:
//   Semester 1  starts March, ends early July
//   Semester 2  starts September, ends early December
//   Between them are two breaks, July-August and December-February.
//
// Term numbering matches the rest of the codebase: 1 = Semester 1, 2 = Semester 2 (3 = summer, 4 = winter,
// neither of which is ever a target, they carry catch-up units rather than a cohort's normal load).
// ============================================================

/** A teaching semester, identified by the calendar year it runs in. */
export interface AcademicTerm {
  year: number;
  semester: 1 | 2;
}

export interface AcademicNow {
  /** The semester currently teaching, or null during a break between two of them. */
  current: AcademicTerm | null;
  /** The semester an estimate should be built for. Always populated. */
  next: AcademicTerm;
  /** Human-readable form of next, e.g. "Semester 1, 2027". */
  label: string;
  /** Why that semester is next, so the UI can explain itself instead of showing a bare number. */
  reason: string;
}

export function formatTerm(term: AcademicTerm): string {
  return `Semester ${term.semester}, ${term.year}`;
}

/**
 * Semester 1 runs March to early July, semester 2 September to early December. The month alone is enough to
 * place a date: only the first week of July and of December are ambiguous, and both fall in a break as far as
 * "what do we teach next" is concerned, which is the only question asked here.
 */
export function describeAcademicNow(now: Date = new Date()): AcademicNow {
  const month = now.getMonth() + 1;   // getMonth() is 0-based, the rest of this file is not
  const year = now.getFullYear();

  // January and February: semester 1 has not started yet, so it is both the next one and none is running.
  if (month <= 2) {
    return {
      current: null,
      next: { year, semester: 1 },
      label: formatTerm({ year, semester: 1 }),
      reason: 'Semester 1 has not started yet this year',
    };
  }

  // March to June, semester 1 is teaching. July and August are its tail and the break after it. Either way
  // the next intake of enrolments is semester 2 of the same year.
  if (month <= 8) {
    const current: AcademicTerm | null = month <= 6 ? { year, semester: 1 } : null;
    return {
      current,
      next: { year, semester: 2 },
      label: formatTerm({ year, semester: 2 }),
      reason: current
        ? 'Semester 1 is running, so semester 2 is next'
        : 'Semester 1 has ended and semester 2 has not started',
    };
  }

  // September to November semester 2 is teaching, December is its tail. Next is semester 1 of the NEXT year,
  // which is the case most easily got wrong by hand, since the year rolls over with it.
  const current: AcademicTerm | null = month <= 11 ? { year, semester: 2 } : null;
  return {
    current,
    next: { year: year + 1, semester: 1 },
    label: formatTerm({ year: year + 1, semester: 1 }),
    reason: current
      ? 'Semester 2 is running, so semester 1 of next year is next'
      : 'Semester 2 has ended, so semester 1 of next year is next',
  };
}

/** Just the semester number, for the eligibility engine, which only cares whether a unit is offered in 1 or 2. */
export function nextTargetTerm(now: Date = new Date()): 1 | 2 {
  return describeAcademicNow(now).next.semester;
}
