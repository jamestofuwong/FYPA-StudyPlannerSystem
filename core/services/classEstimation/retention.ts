// ============================================================
// Phase 7, retention. The discount for students who will not be here next semester.
//
// A predicted seat assumes the student comes back. Some will not: a visa refused or not renewed, a
// withdrawal, a deferral, a transfer. The portal exposes neither visa status nor graduation status, which is
// one of the reasons this module exists at all, so there is no way to tell which students are at risk. What
// is left is a single rate applied to everyone.
//
// That flatness is a real limitation and not a modelling choice made for convenience. A first-year
// international student and a final-year local carry very different risk, and the rate cannot tell them
// apart. It is the HoD's own figure, set from what they know about their intake, and every projection says
// plainly which rate produced it so a number can never be read without the assumption behind it.
//
// Applied once, to the aggregate, rather than per student. Multiplying each student's contribution by the
// rate and then summing gives the same answer, but doing it at the end keeps one rate in one place and
// leaves the per-student figures readable as what the estimator actually predicted.
//
// It does NOT apply to the manual new-intake figure that Phase 8 adds. That number is the HoD's own count of
// students who have not arrived yet, so whatever allowance they want for it is already inside the figure
// they typed. Discounting it here would take that allowance twice.
// ============================================================

/**
 * Keeps a rate inside 0 to 1. A rate above 1 would invent students and a negative one would subtract them,
 * and this figure arrives from a config value or a query parameter, so it cannot be assumed sane. Anything
 * unusable falls back to the caller's default rather than silently becoming zero, which would flatten an
 * entire estimate to nothing and look like a pipeline failure.
 */
export function resolveRetentionRate(rate: unknown, fallback: number): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return fallback;
  if (rate < 0 || rate > 1) return fallback;
  return rate;
}

/** The expected figure once students who will not return are discounted. Left unrounded on purpose. */
export function applyRetention(expected: number, retentionRate: number): number {
  return expected * retentionRate;
}

/**
 * How a projected figure was arrived at, carried alongside it so a headcount is never a bare number.
 * Rounding is deliberately absent: it belongs at the very end, in Phase 8, applied once to the final figure
 * rather than accumulating error at each step.
 */
export interface UnitProjection {
  code: string;
  /** Whole seats from students predicted into this specific unit. */
  fromNamedPicks: number;
  /** Fractional seats from students spread across an elective pool containing this unit. */
  fromElectives: number;
  /** fromNamedPicks + fromElectives, before any discount. */
  beforeRetention: number;
  /** beforeRetention after the retention rate. This is the projected headcount. */
  projected: number;
}

export function projectUnit(
  code: string,
  fromNamedPicks: number,
  fromElectives: number,
  retentionRate: number,
): UnitProjection {
  const beforeRetention = fromNamedPicks + fromElectives;
  return {
    code,
    fromNamedPicks,
    fromElectives,
    beforeRetention,
    projected: applyRetention(beforeRetention, retentionRate),
  };
}
