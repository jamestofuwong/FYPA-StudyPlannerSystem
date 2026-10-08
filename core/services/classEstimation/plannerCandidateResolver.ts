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
import { getPrescribedPoolCodes, getFreeElectivePoolCodes } from '../matching/plannerTemplateBuilder';
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

  // scoringEngine.ts does subtract completed units from these lists, but it subtracts profile.completedCore
  // and profile.completedMajorCore, which are built by categorising each of the student's units with the ONE
  // global category unitMasterTableBuilder.ts resolved for it across every planner (major_core beats
  // prescribed_elective beats core). A unit that is core in the matched planner but major_core in some other
  // planner therefore lands in completedMajorCore, never in completedCore, so the matched planner's
  // missingCore still lists it even though the student has passed it. Nine of the 65 units in the loaded
  // planners sit in more than one category, COS20007 and COS10003 among them, so this is not a corner case.
  // Filtering against the raw completed set here is category-blind and cannot be fooled that way.
  // The underlying scoring bug is not fixed here, it also depresses matchPct and belongs to /api/match.
  for (const code of payload.primaryMajor.breakdown.core.missingUnits ?? []) {
    if (completed.has(code.trim().toUpperCase())) continue;
    candidates.push({ code, category: 'core' });
  }
  for (const code of payload.primaryMajor.breakdown.majorCore.missingUnits ?? []) {
    if (completed.has(code.trim().toUpperCase())) continue;
    candidates.push({ code, category: 'majorCore' });
  }

  const prescribedSlots = payload.primaryMajor.breakdown.prescribed.missingSlots ?? 0;
  if (prescribedSlots > 0) {
    for (const code of new Set(getPrescribedPoolCodes(planner))) {
      if (completed.has(code)) continue;
      candidates.push({ code, category: 'prescribed', poolSlotsRemaining: prescribedSlots });
    }
  }

  const freeElectiveSlots = payload.primaryMajor.breakdown.freeElective.missingSlots ?? 0;
  if (freeElectiveSlots > 0) {
    for (const code of new Set(getFreeElectivePoolCodes(planner))) {
      if (completed.has(code)) continue;
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
  const sameCourse: typeof ranked = [];
  for (const record of ranked) {
    const candidate = await getCachedPlannerById(record.plannerID);
    if (candidate && courseName(candidate) === course) sameCourse.push(record);
  }

  // A unit is only proposed if EVERY candidate planner in that course still wants it from this student. One
  // planner having already had it satisfied, or not requiring it at all, is enough to leave it out.
  const owedByAll = sameCourse
    .map((record) => new Set(record.missingCore.map((code) => code.trim().toUpperCase())))
    .reduce((shared, next) => new Set([...shared].filter((code) => next.has(code))));

  const candidates: CandidateUnit[] = [...owedByAll]
    .filter((code) => !completed.has(code))
    .sort()
    .map((code) => ({ code, category: 'core' as const }));

  return { plannerId, candidates, basis: 'commonCore' };
}
