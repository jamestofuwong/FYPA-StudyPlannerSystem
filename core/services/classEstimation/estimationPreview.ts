// ============================================================
// Diagnostic run of everything built so far (Phases 0-3) over the records a scrape left in estimationStore:
// match each student to a planner, resolve their candidate units, filter them by eligibility for the target
// semester, then rank and cap. Nothing downstream of Phase 3 exists yet, so this is the first place those
// pieces run in sequence against real data rather than in isolated unit tests. It aggregates nothing into a
// headcount, it reports what each phase did per student so a real run can be checked by eye: which planner a
// student landed on, what fell out at each step and why, and which mapper defaults were used.
// ============================================================

import * as plannerRepository from '../../db/repositories/plannerRepository';
import { runMatchingPipeline } from '../matching/matchingService';
import { buildPlannerTemplatesForMatching } from '../matching/plannerTemplateBuilder';
import { buildUnitMasterTable } from '../matching/unitMasterTableBuilder';
import { resetPlannerCache } from './plannerCache';
import { resolveCandidateUnits } from './plannerCandidateResolver';
import {
  buildEligibilityUnitsFromPlanner,
  isAvailableInTargetTerm,
  isOutsideRecommendedTerm,
} from './eligibilityEngine';
import { filterEligibleUnits } from './eligibilityFilter';
import { rankAndCapUnits } from './unitRanker';
import type {
  CandidateUnit,
  EstimationRecord,
  EstimationUnitCategory,
} from '../../shared/types/classEstimation';

export type IneligibleReason = 'not-in-planner' | 'not-offered-in-term' | 'requisites-unmet';

export interface PreviewPickedUnit {
  code: string;
  category: EstimationUnitCategory;
  yearLevel?: number;
  semester?: number;
}

export interface PreviewIneligibleUnit {
  code: string;
  category: EstimationUnitCategory;
  reason: IneligibleReason;
}

export interface StudentPreview {
  studentId: string;
  name: string;
  course: string;
  intake: { year: number; semester: 1 | 2 };
  /** matching pipeline status: detected | noMajorDetected | overridden */
  matchStatus?: string;
  planner: { id: string; majorName: string; matchPct: number; intakeYear: number; intakeSemester: 1 | 2 } | null;
  completedCount: number;
  /** creditsCompleted as the portal reported it, next to completedCount * 12.5 so the two can be compared. */
  creditsScraped: number;
  mappingWarnings: string[];
  candidateCount: number;
  eligibleCount: number;
  picked: PreviewPickedUnit[];
  /** Eligible core/majorCore units that ranked below loadCap and were dropped. */
  droppedByLoadCap: number;
  poolCandidates: { prescribed: number; freeElective: number };
  ineligible: PreviewIneligibleUnit[];
  /** Eligible units with no offering rows in the DB. canTake() treats those as offered every semester. */
  eligibleWithoutOfferingData: string[];
  /**
   * Picked units the planner does not recommend for this semester. Normal for a retake or a catch-up, so
   * they are still counted. Listed because a wrong offerings row shows up here first: a whole cohort
   * predicted into a semester their planner never uses is a reason to check that row.
   */
  outsideRecommendedTerm: string[];
  error?: string;
}

export interface PreviewSummary {
  targetTerm: 1 | 2;
  loadCap: number;
  students: number;
  withPlanner: number;
  noMajorOrPlanner: number;
  errors: number;
  totalCandidates: number;
  totalEligible: number;
  totalPicked: number;
  ineligibleByReason: Record<IneligibleReason, number>;
  eligibleWithoutOfferingData: number;
  /** How many picks fell outside the semester their planner recommends, across all students. */
  outsideRecommendedTerm: number;
  mappingWarningCounts: Record<string, number>;
  plannerCounts: Array<{ plannerId: string; majorName: string; intakeYear: number; intakeSemester: 1 | 2; students: number }>;
  /** How many students had each picked unit, most common first. Not a headcount estimate, Phase 5 does that. */
  pickedByUnit: Array<{ code: string; students: number }>;
}

export interface EstimationPreview {
  summary: PreviewSummary;
  students: StudentPreview[];
}

export interface PreviewOptions {
  targetTerm: 1 | 2;
  loadCap: number;
}


function count<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export async function runEstimationPreview(
  records: EstimationRecord[],
  options: PreviewOptions,
): Promise<EstimationPreview> {
  const { targetTerm, loadCap } = options;

  // A fresh run must not see planner data cached by an earlier one, planners may have been edited in between.
  resetPlannerCache();

  const dbPlanners = await plannerRepository.getAllPlannersWithUnits();
  if (dbPlanners.length === 0) throw new Error('No planner templates are loaded, import or sync a planner first');
  const planners = buildPlannerTemplatesForMatching(dbPlanners);
  const unitMasterTable = await buildUnitMasterTable();

  const students: StudentPreview[] = [];
  for (const record of records) {
    students.push(await previewStudent(record, planners, unitMasterTable, options));
  }

  const withPlanner = students.filter((s) => s.planner !== null);
  const ineligible = students.flatMap((s) => s.ineligible);
  const plannerKey = (s: StudentPreview) => s.planner!.id;
  const plannerCounts = Object.entries(count(withPlanner, plannerKey)).map(([plannerId, n]) => {
    const p = withPlanner.find((s) => s.planner!.id === plannerId)!.planner!;
    return { plannerId, majorName: p.majorName, intakeYear: p.intakeYear, intakeSemester: p.intakeSemester, students: n };
  }).sort((a, b) => b.students - a.students);

  const pickedCounts = count(students.flatMap((s) => s.picked), (u) => u.code);

  const summary: PreviewSummary = {
    targetTerm,
    loadCap,
    students: students.length,
    withPlanner: withPlanner.length,
    noMajorOrPlanner: students.filter((s) => s.planner === null && !s.error).length,
    errors: students.filter((s) => s.error).length,
    totalCandidates: students.reduce((sum, s) => sum + s.candidateCount, 0),
    totalEligible: students.reduce((sum, s) => sum + s.eligibleCount, 0),
    totalPicked: students.reduce((sum, s) => sum + s.picked.length, 0),
    ineligibleByReason: {
      'not-in-planner': ineligible.filter((u) => u.reason === 'not-in-planner').length,
      'not-offered-in-term': ineligible.filter((u) => u.reason === 'not-offered-in-term').length,
      'requisites-unmet': ineligible.filter((u) => u.reason === 'requisites-unmet').length,
    },
    eligibleWithoutOfferingData: students.reduce((sum, s) => sum + s.eligibleWithoutOfferingData.length, 0),
    outsideRecommendedTerm: students.reduce((sum, s) => sum + s.outsideRecommendedTerm.length, 0),
    mappingWarningCounts: count(students.flatMap((s) => s.mappingWarnings), (w) => w),
    plannerCounts,
    pickedByUnit: Object.entries(pickedCounts)
      .map(([code, n]) => ({ code, students: n }))
      .sort((a, b) => b.students - a.students || a.code.localeCompare(b.code)),
  };

  return { summary, students };
}

async function previewStudent(
  record: EstimationRecord,
  planners: ReturnType<typeof buildPlannerTemplatesForMatching>,
  unitMasterTable: Awaited<ReturnType<typeof buildUnitMasterTable>>,
  { targetTerm, loadCap }: PreviewOptions,
): Promise<StudentPreview> {
  const { rawInput } = record;
  const base: StudentPreview = {
    studentId: record.studentId,
    name: record.name,
    course: record.scraped?.course ?? '',
    intake: { year: rawInput.intakeYear, semester: rawInput.intakeSemester },
    planner: null,
    completedCount: rawInput.completedUnitCodes.length,
    // The portal's own figure, shown next to the transcript-derived total so the two can be compared.
    // An imported transcript has no portal figure, so it reports 0.
    creditsScraped: record.scraped?.creditsCompleted ?? 0,
    mappingWarnings: record.mappingWarnings,
    candidateCount: 0,
    eligibleCount: 0,
    picked: [],
    droppedByLoadCap: 0,
    poolCandidates: { prescribed: 0, freeElective: 0 },
    ineligible: [],
    eligibleWithoutOfferingData: [],
    outsideRecommendedTerm: [],
  };

  try {
    // preferIntakeYear: false, same as /api/match: a student whose intake year has no planner loaded falls back
    // to the most recent one instead of the pipeline throwing, which would fail most students on older intakes.
    const matchResult = runMatchingPipeline({
      student: rawInput,
      planners,
      unitMasterTable,
      config: { preferIntakeYear: false },
    });
    base.matchStatus = matchResult.payload.status;

    const resolution = await resolveCandidateUnits(matchResult, rawInput.completedUnitCodes);
    if (!resolution) return base;

    const top = matchResult.payload.rankedPlanners[0];
    base.planner = {
      id: resolution.plannerId,
      majorName: top.majorName,
      matchPct: top.matchPct,
      intakeYear: top.intakeYear,
      intakeSemester: top.intakeSemester,
    };
    base.candidateCount = resolution.candidates.length;

    const completedOrInProgress = new Set(rawInput.completedUnitCodes.map((c) => c.trim().toUpperCase()));
    // Summed from the transcript's Earned column by the record builder, which also handles the case of a
    // transcript carrying no credit figures at all. No fallback here on purpose: a zero would otherwise be
    // indistinguishable from missing data, and a student who genuinely holds no credit would be handed
    // enough to clear a credit-point gate they have not met.
    const totalCreditsEarned = record.totalCreditsEarned;

    const eligible = await filterEligibleUnits(resolution.candidates, resolution.plannerId, {
      targetTerm,
      completedOrInProgress,
      concededPass: new Set(record.concededPassUnitCodes),
      totalCreditsEarned,
    });
    base.eligibleCount = eligible.length;

    const eligibilityUnits = await buildEligibilityUnitsFromPlanner(resolution.plannerId);
    const eligibleCodes = new Set(eligible.map((c) => c.code));
    base.ineligible = resolution.candidates
      .filter((c) => !eligibleCodes.has(c.code))
      .map((c) => ({ code: c.code, category: c.category, reason: ineligibleReason(c, eligibilityUnits, targetTerm) }));
    base.eligibleWithoutOfferingData = eligible
      .filter((c) => eligibilityUnits.get(c.code)?.offeringSemesters.length === 0)
      .map((c) => c.code);
    base.outsideRecommendedTerm = eligible
      .filter((c) => {
        const unit = eligibilityUnits.get(c.code);
        return unit ? isOutsideRecommendedTerm(unit, targetTerm) : false;
      })
      .map((c) => c.code);

    const ranked = await rankAndCapUnits(eligible, resolution.plannerId, loadCap);
    base.picked = ranked.picked.map((u) => ({
      code: u.code, category: u.category, yearLevel: u.yearLevel, semester: u.semester,
    }));
    base.droppedByLoadCap = eligible.filter((c) => c.category === 'core' || c.category === 'majorCore').length - ranked.picked.length;
    base.poolCandidates = {
      prescribed: ranked.poolCandidates.filter((c) => c.category === 'prescribed').length,
      freeElective: ranked.poolCandidates.filter((c) => c.category === 'freeElective').length,
    };
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
  }

  return base;
}

// Labels why a candidate failed eligibility. Reporting only, the decision itself is still made by
// isUnitEligible(). It asks the same question in the same order, so the label cannot claim a unit failed on
// requisites when it actually failed on the semester it runs in.
function ineligibleReason(
  candidate: CandidateUnit,
  eligibilityUnits: Awaited<ReturnType<typeof buildEligibilityUnitsFromPlanner>>,
  targetTerm: 1 | 2,
): IneligibleReason {
  const unit = eligibilityUnits.get(candidate.code);
  if (!unit) return 'not-in-planner';
  if (!isAvailableInTargetTerm(unit, targetTerm)) return 'not-offered-in-term';
  return 'requisites-unmet';
}
