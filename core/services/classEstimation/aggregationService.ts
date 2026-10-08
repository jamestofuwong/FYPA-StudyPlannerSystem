// ============================================================
// Phase 8, aggregation. Turns per-student predictions into the per-unit headcount the HoD acts on.
//
// Order matters for these three things:
//
//   1. The continuing cohort's contributions are added up per unit. Named picks are whole students, elective
//      shares are fractions, both already worked out upstream.
//   2. The retention rate discounts that total, because some of those students will not be back.
//   3. The HoD's manual new-intake figure is added, undiscounted.
//
// Step 3 comes after step 2 on purpose. New students are not in the portal yet, so the HoD is typing what
// they expect to actually turn up. Discounting that would cut the same no-shows twice.
//
// Rounding happens once at the very end on the final figure. Every stage before it stays fractional. A
// figure rounded at each step accumulates error, and with elective shares often well below 1 a premature
// round would throw whole classes away.
//
// Per-unit rounding also means the rounded figures do not necessarily add up to a rounded grand total. 
// The HoD staffs individual units, so each unit's own figure has to be the best one available, 
// not adjusted to make a column sum tidily.
// ============================================================

import { applyRetention } from './retention';

/** One unit's contributions from the students already in the system, before any discount. */
export interface ContinuingContribution {
  code: string;
  /** Whole students the planner says still owe this specific unit. */
  fromNamedPicks: number;
  /** Fractions of students spread across an elective pool containing this unit. */
  fromElectives: number;
}

export interface AggregationInput {
  continuing: ContinuingContribution[];
  /**
   * Units a brand-new student takes in their first semester. Shared across every major, because a new
   * student has not picked one and, as the matching work established, first-year units are the same
   * whichever they eventually pick.
   */
  newIntakeUnits: string[];
  /** The HoD's own count of new students expected to arrive. Not discounted, see the note above. */
  newIntakeCount: number;
  /**
   * Share of the new students expected in each unit, from newIntakeResolver. A unit left out counts in
   * full, which is every Year 1, Semester 1 unit in the planners loaded so far.
   */
  newIntakeShares?: Record<string, number>;
  /**
   * New students per course, each placed on its own course's first-semester units. When given, these replace
   * the single newIntakeUnits / newIntakeCount pair above, which remains for callers with one course.
   */
  newIntakeGroups?: Array<{ count: number; codes: string[]; shares?: Record<string, number> }>;
  retentionRate: number;
}

export interface AggregatedUnit {
  code: string;
  fromNamedPicks: number;
  fromElectives: number;
  /** Students from the manual new-intake figure, which every new student takes, so it is a whole number. */
  fromNewIntake: number;
  /** The continuing cohort's total before the retention rate. */
  continuingBeforeRetention: number;
  /** The same figure after the retention rate. */
  continuingProjected: number;
  /** continuingProjected + fromNewIntake. The estimate, still fractional. */
  projected: number;
  /** projected rounded to whole students. The figure to staff against. */
  headcount: number;
}

/** Half up, the convention a reader expects when a figure is presented as a number of students. */
export function roundHeadcount(projected: number): number {
  return Math.round(projected);
}

export function aggregate(input: AggregationInput): AggregatedUnit[] {
  const { continuing, newIntakeUnits, newIntakeCount, retentionRate, newIntakeShares = {} } = input;
  const groups = input.newIntakeGroups
    ?? [{ count: newIntakeCount, codes: newIntakeUnits, shares: newIntakeShares }];

  const byCode = new Map<string, { fromNamedPicks: number; fromElectives: number; fromNewIntake: number }>();

  const entryFor = (code: string) => {
    const existing = byCode.get(code);
    if (existing) return existing;
    const fresh = { fromNamedPicks: 0, fromElectives: 0, fromNewIntake: 0 };
    byCode.set(code, fresh);
    return fresh;
  };

  for (const contribution of continuing) {
    const entry = entryFor(contribution.code);
    entry.fromNamedPicks += contribution.fromNamedPicks;
    entry.fromElectives += contribution.fromElectives;
  }

  // A negative figure would quietly subtract students, and new intake is typed by hand.
  for (const group of groups) {
    const intake = Math.max(0, group.count);
    if (intake === 0) continue;
    // De-duplicated: the same unit appearing twice in the list must not double the intake on it.
    for (const code of new Set(group.codes)) {
      entryFor(code).fromNewIntake += intake * (group.shares?.[code] ?? 1);
    }
  }

  return [...byCode.entries()]
    .map(([code, entry]) => {
      const continuingBeforeRetention = entry.fromNamedPicks + entry.fromElectives;
      const continuingProjected = applyRetention(continuingBeforeRetention, retentionRate);
      const projected = continuingProjected + entry.fromNewIntake;

      return {
        code,
        fromNamedPicks: entry.fromNamedPicks,
        fromElectives: entry.fromElectives,
        fromNewIntake: entry.fromNewIntake,
        continuingBeforeRetention,
        continuingProjected,
        projected,
        headcount: roundHeadcount(projected),
      };
    })
    .sort((a, b) => b.projected - a.projected || a.code.localeCompare(b.code));
}

export interface AggregationTotals {
  units: number;
  /** Units whose headcount rounds to zero, so they are predicted not to run. */
  unitsWithNoStudents: number;
  /** Sum of the fractional projections, which is the honest total. */
  projected: number;
  /** Sum of the rounded per-unit figures. Differs from projected, deliberately, see the note above. */
  headcount: number;
  fromNewIntake: number;
}

export function totalsFor(units: AggregatedUnit[]): AggregationTotals {
  return {
    units: units.length,
    unitsWithNoStudents: units.filter((unit) => unit.headcount === 0).length,
    projected: units.reduce((sum, unit) => sum + unit.projected, 0),
    headcount: units.reduce((sum, unit) => sum + unit.headcount, 0),
    fromNewIntake: units.reduce((sum, unit) => sum + unit.fromNewIntake, 0),
  };
}
