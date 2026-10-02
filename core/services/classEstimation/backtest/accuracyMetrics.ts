// ============================================================
// Phase 10. How close a predicted semester came to the real one.
//
// "30% accurate" and "70% accurate" have to mean something specific before they can be measured, so the
// headline figure is defined here once:
//
//   accuracy = 1 - WAPE,   WAPE = sum over units of |predicted - actual|  /  sum over units of actual
//
// Weighted absolute percentage error. 70% accuracy means the total miss, counted unit by unit and in both
// directions, came to 30% of the real enrolment. It is weighted by class size on purpose: missing a 200-seat
// unit by 20 matters far more to staffing than missing a 3-seat one by 2, and a plain average of per-unit
// percentages would treat those as the same size of mistake. It also cannot be gamed by a few tiny units,
// which is the usual failure of percentage error on small counts.
//
// It does not hide direction. A unit predicted at 60 that drew 40 and one predicted at 20 that drew 40 score
// the same miss, so bias is reported beside it: whether the estimate runs high or low overall.
//
// Two further figures answer questions the headline cannot:
//   withinTolerance   the share of units whose own prediction landed within 30% of reality, which is closer
//                     to how a Head of Department reads the table, one unit at a time
//   student recall    of the units students took, the share the estimator named for them, which
//                     separates "the totals came out right by accident" from "it knew who takes what"
// ============================================================

export interface UnitComparison {
  code: string;
  predicted: number;
  actual: number;
  /** predicted - actual. Positive means the estimate was too high. */
  error: number;
}

export interface AccuracySummary {
  /** Units that appeared on either side. */
  units: number;
  totalPredicted: number;
  totalActual: number;
  /** Weighted absolute percentage error, see the note at the top. */
  wape: number;
  /** 1 - WAPE, floored at 0. The headline figure. */
  accuracy: number;
  /** (total predicted - total actual) / total actual. Positive means the estimate runs high. */
  bias: number;
  /** Share of units predicted within `tolerance` of their real enrolment. */
  withinTolerance: number;
  tolerance: number;
}

export function compareByUnit(
  predicted: ReadonlyMap<string, number>,
  actual: ReadonlyMap<string, number>,
): UnitComparison[] {
  const codes = new Set([...predicted.keys(), ...actual.keys()]);
  return [...codes]
    .map((code) => {
      const p = predicted.get(code) ?? 0;
      const a = actual.get(code) ?? 0;
      return { code, predicted: p, actual: a, error: p - a };
    })
    // Largest real class first, since those are the misses that cost the most.
    .sort((x, y) => y.actual - x.actual || y.predicted - x.predicted || x.code.localeCompare(y.code));
}

/**
 * A unit counts as within tolerance when the miss is no more than `tolerance` of its real size. A unit that
 * drew nobody counts only if the prediction also rounds to nobody, since any percentage of zero is zero and
 * would otherwise make every predicted-but-empty class look like a hit or an infinite miss.
 */
function isWithinTolerance(row: UnitComparison, tolerance: number): boolean {
  if (row.actual === 0) return Math.round(row.predicted) === 0;
  return Math.abs(row.error) <= tolerance * row.actual;
}

export function summariseAccuracy(rows: UnitComparison[], tolerance = 0.3): AccuracySummary {
  const totalPredicted = rows.reduce((sum, row) => sum + row.predicted, 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const totalMiss = rows.reduce((sum, row) => sum + Math.abs(row.error), 0);

  // With nothing actually enrolled there is nothing to be accurate about. Reported as zero accuracy rather
  // than dividing by zero, and the empty count makes the reason plain.
  const wape = totalActual > 0 ? totalMiss / totalActual : totalMiss > 0 ? Infinity : 0;

  return {
    units: rows.length,
    totalPredicted,
    totalActual,
    wape,
    accuracy: totalActual > 0 ? Math.max(0, 1 - wape) : 0,
    bias: totalActual > 0 ? (totalPredicted - totalActual) / totalActual : 0,
    withinTolerance: rows.length > 0 ? rows.filter((row) => isWithinTolerance(row, tolerance)).length / rows.length : 0,
    tolerance,
  };
}

export interface StudentOverlap {
  /** Units the estimator named that the student really took. */
  hits: number;
  /** Of the units named, the share the student really took. */
  precision: number;
  /** Of the units the student really took, the share that were named. */
  recall: number;
}

/**
 * Per-student check on the named picks. An empty side scores as undefined-free zeros rather than NaN, so a
 * student with nothing on one side still averages sensibly into a cohort figure.
 */
export function studentOverlap(named: readonly string[], actual: readonly string[]): StudentOverlap {
  const took = new Set(actual.map((code) => code.trim().toUpperCase()));
  const picked = new Set(named.map((code) => code.trim().toUpperCase()));
  const hits = [...picked].filter((code) => took.has(code)).length;
  return {
    hits,
    precision: picked.size > 0 ? hits / picked.size : 0,
    recall: took.size > 0 ? hits / took.size : 0,
  };
}

/** Where a figure sits against the 30% acceptable and 70% excellent marks set for this module. */
export function gradeAccuracy(accuracy: number): 'below target' | 'acceptable' | 'excellent' {
  if (accuracy >= 0.7) return 'excellent';
  if (accuracy >= 0.3) return 'acceptable';
  return 'below target';
}
