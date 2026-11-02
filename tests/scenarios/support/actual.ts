/**
 * The "what actually happens" side. Each runner feeds a test student to the real feature the way the app does.
 *
 *  - Matching:   runDashboardMatch, called with the same inputs the dashboard sends to /api/match.
 *  - Pathway:    the real POST /api/custom-planner handler, with the request body the pathway page builds.
 *  - Graduation: auditGraduation, the one function the dashboard's Graduation tab and the copilot share.
 */
import { NextRequest } from 'next/server';
import {
  getCompletedUnitCodes,
  getConcededPassUnitCodes,
  resolveUnitStates,
} from '../../../core/shared/constants/grades';
import { auditGraduation } from '../../../core/services/graduation/graduationAudit';
import { normaliseCode } from '../../../core/services/scheduling/customPlannerScheduler';
import type { PlannerView, ScenarioData } from './db';
import type { Transcript } from './transcript';

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface MatchActual {
  status: string;
  primaryMajor: string | null;
  primaryPlannerId: string | null;
  primaryIntake: string | null;
  primaryPct: number | null;
  secondMajor: string | null;
  ranked: { major: string; plannerId: string; intake: string; pct: number }[];
  error?: string;
}

export async function runMatching(t: Transcript, intake: { year: number; semester: 1 | 2 }, courseCode = 'BA-CS'): Promise<MatchActual> {
  try {
    const { runDashboardMatch } = await import('../../../core/services/matching/dashboardMatch');
    const res = await runDashboardMatch({
      studentID: 'SCENARIO',
      courseCode,
      intakeYear: intake.year,
      intakeSemester: intake.semester,
      completedUnitCodes: getCompletedUnitCodes(t.rows),
      hasWIL: false,
    });
    const d = res.data as any;
    const pv = d.primaryMajor?.plannerVersion;
    const label = (y?: number, s?: number) => (y != null ? `${y}/S${s}` : null);
    // The display object for the primary major carries no planner id, so find its record in the ranked list.
    const primaryRecord = d.primaryMajor
      ? (d.rankedPlanners ?? []).find((r: any) => r.majorName === d.primaryMajor.majorName && r.intakeYear === pv?.intakeYear && r.intakeSemester === pv?.intakeSemester)
      : null;
    return {
      status: d.status,
      primaryMajor: d.primaryMajor?.majorName ?? null,
      primaryPlannerId: primaryRecord?.plannerID ?? null,
      primaryIntake: label(pv?.intakeYear, pv?.intakeSemester),
      primaryPct: d.primaryMajor?.matchPct ?? null,
      secondMajor: d.secondMajor?.majorName ?? null,
      ranked: (d.rankedPlanners ?? []).slice(0, 6).map((r: any) => ({ major: r.majorName, plannerId: r.plannerID, intake: label(r.intakeYear, r.intakeSemester) ?? '', pct: r.matchPct })),
    };
  } catch (e) {
    return { status: 'error', primaryMajor: null, primaryPlannerId: null, primaryIntake: null, primaryPct: null, secondMajor: null, ranked: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Graduation (the shared audit the Graduation tab and the copilot both call)
// ---------------------------------------------------------------------------

export interface GraduationActual {
  isEligible: boolean;
  coreMissing: string[];
  prescribedMissing: string[];
  wilMissing: string | null;
  electiveShortfallUnits: number;
  concededPasses: string[];
  concededOverLimit: boolean;
  inProgress: string[];
  creditsCompleted: number;
  creditsRequired: number;
  reasons: string[];
}

export function runGraduation(planner: PlannerView, t: Transcript): GraduationActual {
  const audit = auditGraduation(
    {
      units: planner.units.map((u) => ({ unit: { unit_code: u.code, unit_name: u.name }, category: u.category, semester: u.semester })),
      elective_groups: [{ units: planner.electiveGroupCodes.map((c) => ({ unit: { unit_code: c } })) }],
      core_cp: planner.coreCp, major_cp: planner.majorCp, elective_cp: planner.electiveCp, wil_cp: planner.wilCp,
    },
    t.rows,
    // The portal supplies this figure; the suite uses the credits the transcript actually earned.
    { creditsCompleted: t.creditsCompleted(), creditsRequired: 300 },
  );
  return {
    isEligible: audit.eligible,
    coreMissing: audit.coreMissing.map((u) => u.code),
    prescribedMissing: audit.prescribedMissing.map((u) => u.code),
    wilMissing: audit.wilMissing?.code ?? null,
    electiveShortfallUnits: audit.electiveShortfallUnits,
    concededPasses: audit.concededPasses,
    concededOverLimit: audit.concededOverLimit,
    inProgress: audit.inProgress,
    creditsCompleted: audit.creditsCompleted,
    creditsRequired: audit.creditsRequired,
    reasons: audit.reasons,
  };
}

// ---------------------------------------------------------------------------
// Pathway (the pathway page's request, sent to the real route)
// ---------------------------------------------------------------------------

export interface PathwayActual {
  httpStatus: number;
  success: boolean;
  error?: string;
  semesters: { year: number; semester: 1 | 2; units: { code: string; category: string; recommended?: boolean }[] }[];
  unschedulable: { code: string; category: string }[];
  warnings: { kind: string; unitCode?: string; unitCodes?: string[]; [k: string]: unknown }[];
  startYear: number | null;
  startSemester: number | null;
  breakMilestones: { unitCode: string }[];
  requirements: { category: string; creditPoints: number }[];
  retakeCodes: string[];
  requestedCompleted: string[];
}

export async function runPathway(planner: PlannerView, t: Transcript, data: ScenarioData): Promise<PathwayActual> {
  // --- body construction, copied from generateCustomPlan() in pathway/page.tsx ---
  const allRows = t.rows;
  const rawCompleted = getCompletedUnitCodes(allRows);
  const concededCodes = getConcededPassUnitCodes(allRows);
  const passedSet = new Set(rawCompleted);

  const unpassed = planner.units.filter((u) => !passedSet.has(u.code.toUpperCase()));
  const activePrereq = new Set<string>();
  for (const u of unpassed) {
    for (const group of data.units.get(u.code)?.groups ?? []) {
      for (const cond of group) {
        if (cond.type === 'unit' && (cond.requisiteType === 'prerequisite' || cond.requisiteType === 'corequisite')) {
          activePrereq.add(cond.unitCode.trim().toUpperCase());
        }
      }
    }
  }
  const blockingCp = new Set(concededCodes.filter((c) => activePrereq.has(normaliseCode(c))));
  const completedForScheduler = rawCompleted.filter((c) => !blockingCp.has(normaliseCode(c)));
  const effectiveConceded = concededCodes.filter((c) => !blockingCp.has(normaliseCode(c)));
  const states = resolveUnitStates(allRows);
  const retake = new Set([...[...states].filter(([, s]) => s === 'must_retake').map(([c]) => c), ...blockingCp]);

  const body = {
    plannerId: planner.id,
    completedUnitCodes: completedForScheduler,
    concededPassUnitCodes: effectiveConceded,
    courseList: t.rows,
    injectedMinorIds: [],
    selectedDoubleMajorId: null,
  };

  try {
    const { POST } = await import('../../../web/app/api/custom-planner/route');
    const res = await POST(new NextRequest('http://localhost/api/custom-planner', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    const json = await res.json();
    return {
      httpStatus: res.status,
      success: !!json.success,
      error: json.error,
      semesters: json.data?.semesters ?? [],
      unschedulable: json.data?.unschedulableUnits ?? [],
      warnings: json.data?.warnings ?? [],
      startYear: json.startYear ?? null,
      startSemester: json.startSemester ?? null,
      breakMilestones: json.breakMilestones ?? [],
      requirements: json.requirements ?? [],
      retakeCodes: [...retake],
      requestedCompleted: completedForScheduler,
    };
  } catch (e) {
    return { httpStatus: 0, success: false, error: e instanceof Error ? e.message : String(e), semesters: [], unschedulable: [], warnings: [], startYear: null, startSemester: null, breakMilestones: [], requirements: [], retakeCodes: [], requestedCompleted: [] };
  }
}
