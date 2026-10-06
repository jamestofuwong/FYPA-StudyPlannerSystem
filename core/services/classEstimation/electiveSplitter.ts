// ============================================================
// Phase 6, elective prediction.
//
// Core and major core units can be predicted individually: the planner says which ones a student still owes
// and roughly when they take them, so unitRanker.ts picks named units. Electives cannot. A student owing two
// prescribed slots will pick two units out of a pool of a 12, and nothing in the transcript says which.
// Naming two would be a guess presented as a fact, and it would swing a unit's headcount between 0 and the
// whole cohort depending on which way the guess fell.
//
// So this spreads each student's elective seats fractionally across every pool unit they could actually take.
// One student owing one slot from a pool of five contributes 0.2 of a seat to each, not 1 seat to a guess.
// Summed over a cohort those fractions land close to the real spread even though no individual prediction is
// right with a signal this weak.
//
// Three things narrow the pool before it gets here:
//   major        the pool comes from the matched planner's own elective groups (plannerCandidateResolver.ts)
//   eligibility  requisites are already checked against the student's transcript (eligibilityFilter.ts)
//   offering     units not running in the semester being estimated are already gone (eligibilityEngine.ts)
//
// Weighting is by how many students IN THIS BATCH have already passed the unit. There is no historical
// enrolment data to draw on, by the HoD's own account, so the current cohort's revealed choices are the only
// popularity signal available. It is a weak one, and it is meant to be: the requirement for electives was
// eligibility, offering and major, with accuracy explicitly not the goal.
// ============================================================

import type {
  CandidateUnit,
  ElectiveExpectation,
  ElectiveSplit,
  EstimationRecord,
  RankedCandidateUnit,
} from '../../shared/types/classEstimation';

type PoolCategory = ElectiveExpectation['category'];

/**
 * Add-one smoothing on the popularity weights.
 *
 * Without it, a unit nobody in the batch has passed gets a weight of zero and is predicted to draw nobody. 
 * A newly offered elective has no history by definition, and a pool where nobody has passed anything would 
 * divide by zero. Adding one to every weight makes an all-new pool come out as a plain uniform split and keeps 
 * a popular unit ahead without letting it take everything.
 */
const SMOOTHING = 1;

/**
 * How many students in this batch have passed or are taking each unit.
 *
 * Counted across every record, not just pool units, because the lookup is only read for codes that are
 * in some student's pool and filtering first would cost more than it saves. A unit a student has already
 * passed is not in their own candidate pool, plannerCandidateResolver.ts subtracts it, so a student never
 * weights a unit they themselves being predicted into.
 */
export function buildElectivePopularity(records: EstimationRecord[]): Map<string, number> {
  const popularity = new Map<string, number>();
  for (const record of records) {
    for (const code of record.rawInput.completedUnitCodes) {
      const key = code.trim().toUpperCase();
      popularity.set(key, (popularity.get(key) ?? 0) + 1);
    }
  }
  return popularity;
}

/**
 * Seats a student is expected to fill from one pool: what they still owe, limited by the load they have left
 * once their named core and major core units are accounted for.
 */
function seatsFor(slotsOwed: number, loadRemaining: number): number {
  return Math.max(0, Math.min(slotsOwed, loadRemaining));
}

/** Every distinct code in one category of the candidate list, in a stable order. */
function poolCodes(candidates: CandidateUnit[], category: PoolCategory): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const candidate of candidates) {
    if (candidate.category !== category) continue;
    if (seen.has(candidate.code)) continue;
    seen.add(candidate.code);
    codes.push(candidate.code);
  }
  return codes;
}

/** Slots owed for a category. Every candidate of a category carries the same figure, so the first will do. */
function slotsOwedFor(candidates: CandidateUnit[], category: PoolCategory): number {
  const candidate = candidates.find((c) => c.category === category);
  return candidate?.poolSlotsRemaining ?? 0;
}

function spread(
  codes: string[],
  category: PoolCategory,
  seats: number,
  popularity: Map<string, number>,
): ElectiveExpectation[] {
  if (codes.length === 0 || seats <= 0) return [];

  const weights = codes.map((code) => (popularity.get(code) ?? 0) + SMOOTHING);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return codes.map((code, index) => ({
    code,
    category,
    expectedSeats: (seats * weights[index]) / totalWeight,
    popularity: popularity.get(code) ?? 0,
  }));
}

/**
 * Spreads one student's elective seats across the pool units they could take.
 *
 * Prescribed is served before free elective when both compete for the same remaining load. A prescribed slot
 * has to be filled from a named group, while a free elective slot is the loosest requirement in the degree,
 * so when a student has room for only one of the two the constrained one is the safer bet.
 */
export function splitElectivePicks(
  poolCandidates: CandidateUnit[],
  picked: RankedCandidateUnit[],
  loadCap: number,
  popularity: Map<string, number>,
): ElectiveSplit {
  const loadRemaining = Math.max(0, loadCap - picked.length);

  const prescribedOwed = slotsOwedFor(poolCandidates, 'prescribed');
  const prescribedSeats = seatsFor(prescribedOwed, loadRemaining);

  const freeOwed = slotsOwedFor(poolCandidates, 'freeElective');
  const freeSeats = seatsFor(freeOwed, loadRemaining - prescribedSeats);

  const prescribedCodes = poolCodes(poolCandidates, 'prescribed');
  const freeCodes = poolCodes(poolCandidates, 'freeElective');

  const expectations = [
    ...spread(prescribedCodes, 'prescribed', prescribedSeats, popularity),
    ...spread(freeCodes, 'freeElective', freeSeats, popularity),
  ];

  // Seats the student owes and has the load for, but with no eligible unit to put them on. Reported rather
  // than dropped: a pool emptied by the eligibility filter means a student with nothing to enrol in, which
  // is worth seeing instead of a quietly smaller estimate.
  const unplacedSeats =
    (prescribedCodes.length === 0 ? prescribedSeats : 0) + (freeCodes.length === 0 ? freeSeats : 0);

  return { expectations, prescribedSeats, freeElectiveSeats: freeSeats, unplacedSeats };
}
