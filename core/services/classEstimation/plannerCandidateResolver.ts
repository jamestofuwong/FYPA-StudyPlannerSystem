// ============================================================
// Turns a completed matching-pipeline run into a list of candidate units a student has not yet taken.
// Core and major core come straight from DisplayPayload's own missingUnits lists, the matching pipeline
// already computed those. Prescribed and free elective are pool-based categories in the matching pipeline's
// own scoring (see plannerTemplateBuilder.ts), DisplayPayload only exposes a missingSlots count for them,
// not which specific units are left, so this resolver pulls the real candidate pool for the matched planner
// straight from the DB (via the same pool helpers plannerTemplateBuilder.ts uses) and subtracts what the
// student has completed. WIL contributes no candidate units at all, it's scored from the student's own
// hasWIL flag, not from planner-specific units.
//
// resolveCommonCoreUnits() at the bottom handles the students no major could be detected for, which is a
// fifth of a real cohort and expected rather than broken, see its own note.
// ============================================================

import { getCachedPlannerById } from './plannerCache';
import { getPrescribedPoolCodes, getFreeElectivePoolCodes, getStarredElectiveCodes } from '../matching/plannerTemplateBuilder';
import type { MatchingServiceResult } from '../matching/matchingService';
import type { CandidateUnit } from '../../shared/types/classEstimation';

/** The course a planner belongs to, for keeping the shared-core fallback inside one course. */
function courseName(planner: unknown): string {
  return ((planner as { course?: { name?: string | null } | null }).course?.name ?? '').trim();
}

export interface CandidateResolution {
  plannerId: string;
  candidates: CandidateUnit[];
  /**
   * How the candidates were arrived at.
   *   major       a major was detected, so this student's own planner decided everything
   *   commonCore  no major was detected, so only the units every candidate planner agrees on are proposed
   */
  basis: 'major' | 'commonCore';
}

// primaryMajor is always rankedPlanners[0] unless a manualOverride was set on the student's RawStudentInput,
// which scrapedStudentMapper.ts never sets for a bulk estimation run, so this lookup is safe here.
export async function resolveCandidateUnits(
  matchResult: MatchingServiceResult,
  completedUnitCodes: string[],
): Promise<CandidateResolution | null> {
  const { payload } = matchResult;
  if (!payload.primaryMajor) return null; // no major detected, nothing to estimate for this student

  const plannerId = payload.rankedPlanners[0]?.plannerID;
  if (!plannerId) return null;

  const planner = await getCachedPlannerById(plannerId);
  if (!planner) return null;

  const completed = new Set(completedUnitCodes.map((code) => code.trim().toUpperCase()));
  const candidates: CandidateUnit[] = [];

  // scoringEngine.ts already builds these lists from the student's whole completed set. The completed check
  // below is kept as a guard, since it is category-blind and cheap.
  // A required unit is owed once per student. A code listed as both core and major core, or also sitting in an
  // elective pool, would otherwise put the same student in that class twice. The first, stricter category wins.
  const named = new Set<string>();
  for (const [list, category] of [
    [payload.primaryMajor.breakdown.core.missingUnits, 'core'],
    [payload.primaryMajor.breakdown.majorCore.missingUnits, 'majorCore'],
  ] as const) {
    for (const code of list ?? []) {
      const key = code.trim().toUpperCase();
      if (completed.has(key) || named.has(key)) continue;
      named.add(key);
      candidates.push({ code, category });
    }
  }

  // Starred prescribed electives, which the matcher does not read. Each unpassed one is a whole seat on that unit,
  // in the semester the planner puts it. A student who picks another unit from the approved list is still counted
  // here: that over-prepares the starred unit, on purpose, and keeps the student's number of seats right.
  for (const code of new Set(getStarredElectiveCodes(planner))) {
    if (completed.has(code) || named.has(code)) continue;
    named.add(code);
    candidates.push({ code, category: 'prescribed' });
  }

  const prescribedSlots = payload.primaryMajor.breakdown.prescribed.missingSlots ?? 0;
  if (prescribedSlots > 0) {
    // Every group of the planner, filled or not, on purpose: which elective a student picks is unknown, so the
    // forecast leans towards preparing a seat too many rather than one too few.
    for (const code of new Set(getPrescribedPoolCodes(planner))) {
      if (completed.has(code) || named.has(code)) continue;
      candidates.push({ code, category: 'prescribed', poolSlotsRemaining: prescribedSlots });
    }
  }

  const freeElectiveSlots = payload.primaryMajor.breakdown.freeElective.missingSlots ?? 0;
  if (freeElectiveSlots > 0) {
    // Same rule as scoringEngine.ts: a unit in a prescribed pool never also counts as a free elective.
    const prescribedPool = new Set(getPrescribedPoolCodes(planner));
    for (const code of new Set(getFreeElectivePoolCodes(planner))) {
      if (completed.has(code) || named.has(code) || prescribedPool.has(code)) continue;
      candidates.push({ code, category: 'freeElective', poolSlotsRemaining: freeElectiveSlots });
    }
  }

  return { plannerId, candidates, basis: 'major' };
}

/**
 * Candidates for a student whose major could not be detected.
 *
 * About a fifth of any real cohort lands here, and it is not a failure of the matching algorithm: every
 * major in this course shares the same first-year units, so a student one or two semesters in has taken
 * nothing that distinguishes one major from another. There is genuinely no answer to detect yet.
 *
 * Dropping those students would undercount the estimate by that fifth, and guessing a major for them would
 * predict major-specific units they may never take. Neither is necessary, because the thing that makes the
 * major undetectable is the same thing that makes it unnecessary: the units are common to every major. All
 * five planners at each intake require the identical 8 core units, so what a student still owes from that
 * set is certain no matter which major they end up in.
 *
 * So this proposes the intersection of what every candidate planner still wants from them, and abstains
 * from the rest. Major core and the elective pools differ by major by definition, so they are left out
 * rather than guessed. Those units re-enter the estimate on their own once the student is far enough in for
 * a major to be detected.
 */
export async function resolveCommonCoreUnits(
  matchResult: MatchingServiceResult,
  completedUnitCodes: string[],
): Promise<CandidateResolution | null> {
  const { payload } = matchResult;

  // filterPlanners has already narrowed these to the student's own intake, so every record here is a
  // planner they could plausibly be on.
  const ranked = payload.rankedPlanners;
  if (ranked.length === 0) return null;

  // The best-scoring planner stands in for the eligibility and ordering lookups. It is only a stand-in: the
  // units proposed below are in every one of these planners, and the requisites and offerings that decide
  // eligibility belong to the unit rather than the planner, so any of them would give the same answer. The
  // recommended semester does differ, but that is reported and never gates anything.
  const plannerId = ranked[0].plannerID;
  const planner = await getCachedPlannerById(plannerId);
  if (!planner) return null;

  const completed = new Set(completedUnitCodes.map((code) => code.trim().toUpperCase()));

  // Only planners of the student's own course. Every planner for the intake is a candidate, Business ones
  // too once they are loaded, and Business and Computer Science share no core units, so intersecting across
  // both would leave a first-year with nothing predicted at all. The best-scoring planner decides the course:
  // a first-year transcript is far closer to its own course's planners than to another course's.
  const course = courseName(planner);
  const sameCourse: Array<{ record: (typeof ranked)[number]; starred: string[] }> = [];
  for (const record of ranked) {
    const candidate = await getCachedPlannerById(record.plannerID);
    if (candidate && courseName(candidate) === course) {
      sameCourse.push({ record, starred: getStarredElectiveCodes(candidate).map((code) => code.trim().toUpperCase()) });
    }
  }

  // A unit is only proposed if EVERY candidate planner in that course still wants it from this student. One
  // planner having already had it satisfied, or not requiring it at all, is enough to leave it out. Starred
  // prescribed electives count too: COS10003 is a starred Year 1 unit in every major.
  const shared = (lists: string[][]) => lists
    .map((list) => new Set(list.map((code) => code.trim().toUpperCase())))
    .reduce((all, next) => new Set([...all].filter((code) => next.has(code))));
  const coreByAll = shared(sameCourse.map(({ record }) => record.missingCore));
  const starredByAll = shared(sameCourse.map(({ starred }) => starred));

  const owed = (codes: Set<string>, category: 'core' | 'prescribed'): CandidateUnit[] =>
    [...codes].filter((code) => !completed.has(code)).sort().map((code) => ({ code, category }));
  const candidates: CandidateUnit[] = [
    ...owed(coreByAll, 'core'),
    ...owed(new Set([...starredByAll].filter((code) => !coreByAll.has(code))), 'prescribed'),
  ];

  return { plannerId, candidates, basis: 'commonCore' };
}
