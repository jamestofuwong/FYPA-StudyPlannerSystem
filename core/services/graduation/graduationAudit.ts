// The graduation audit: can this student graduate on this planner, and if not, what do they still owe?
//
// One function, used by the dashboard's Graduation tab and the copilot, so the two cannot disagree. (The tab
// used to work this out inline in the page, and the copilot had a separate credits-only rule.)
//
// A student can graduate when ALL of these hold:
//   1. every compulsory unit on the planner is passed: core, major core, prescribed elective, and the work
//      placement (WIL) where the planner lists one
//   2. enough elective credit is earned. The planner's elective credits count prescribed electives and any
//      other unit the student passed that is not compulsory. On older planners, where wil_cp is empty, the
//      25-credit placement is folded into the elective requirement and is worth two elective units.
//   3. nothing is still in progress, because results are not in yet
//   4. at most one Conceded Pass (Swinburne Conceded Pass form, 2023; see MAX_CONCEDED_PASSES)
//   5. the credit total reaches what the course needs (the portal's own figure when given)
//
// MPU units are left out. Which unit of a pair applies depends on the student's nationality, which the
// portal data does not carry.

import {
  MAX_CONCEDED_PASSES,
  getConcededPassUnitCodes,
  normaliseUnitCode,
  resolveUnitStates,
} from '../../shared/constants/grades';
import type { ScrapedCourseListItem } from '../../shared/types/student';

type TranscriptRow = Partial<ScrapedCourseListItem>;

export interface AuditPlannerUnit {
  unit: { unit_code: string; unit_name?: string | null } | null;
  category: string;
  semester?: number | null;
}

/** The parts of a planner the audit reads. A planner row from the database satisfies this. */
export interface AuditPlanner {
  units: AuditPlannerUnit[];
  elective_groups?: Array<{ units?: Array<{ unit?: { unit_code?: string | null } | null }> }>;
  core_cp?: number | null;
  major_cp?: number | null;
  elective_cp?: number | null;
  wil_cp?: number | null;
}

export interface AuditUnit {
  code: string;
  name: string | null;
  semester: number | null;
  category: string;
}

export interface CreditBar {
  key: 'core-major' | 'elective' | 'wil';
  label: string;
  achieved: number;
  required: number;
}

export interface GraduationAudit {
  eligible: boolean;
  /** Core and major-core units not yet passed. */
  coreMissing: AuditUnit[];
  /** Prescribed electives not yet passed. */
  prescribedMissing: AuditUnit[];
  /** The work placement, when the planner lists one and it is not yet passed. */
  wilMissing: AuditUnit | null;
  /** Elective units still to take, beyond the prescribed electives listed above. */
  electiveShortfallUnits: number;
  /** Every unit the student is enrolled in but has no result for. */
  inProgress: string[];
  /** Units passed on a Conceded Pass (and not since passed outright). */
  concededPasses: string[];
  concededOverLimit: boolean;
  creditsCompleted: number;
  creditsRequired: number;
  creditsOk: boolean;
  bars: CreditBar[];
  /** One plain sentence for each reason the student cannot graduate yet. Empty when eligible. */
  reasons: string[];
}

export interface AuditOptions {
  /** The portal's completed-credit figure. When omitted it is worked out from the transcript. */
  creditsCompleted?: number | null;
  /** The course's credit requirement. Defaults to 300. */
  creditsRequired?: number | null;
}

const UNIT_CREDIT = 12.5;
const DEFAULT_REQUIRED = 300;

function wilDefaultCredit(code: string): number {
  return code.includes('ICT20016') || code.includes('ICT20026') ? 25 : UNIT_CREDIT;
}

export function auditGraduation(planner: AuditPlanner, transcript: ReadonlyArray<TranscriptRow>, options: AuditOptions = {}): GraduationAudit {
  const states = resolveUnitStates(transcript);
  const passed = new Set([...states].filter(([, s]) => s === 'passed').map(([c]) => c));
  const inProgress = [...states].filter(([, s]) => s === 'in_progress').map(([c]) => c);
  const conceded = getConcededPassUnitCodes(transcript);

  // Credit earned for each unit: the best attempt's figure, or the standard value for an exemption that
  // carries none.
  const earnedByCode = new Map<string, number>();
  for (const row of transcript) {
    const code = normaliseUnitCode(row?.courseId);
    if (!code) continue;
    const earned = Number(row?.creditsEarned ?? 0) || 0;
    if (earned > (earnedByCode.get(code) ?? 0)) earnedByCode.set(code, earned);
  }
  const creditFor = (code: string) => {
    const earned = earnedByCode.get(code) ?? 0;
    if (earned > 0) return earned;
    return code.startsWith('MPU') ? 0 : wilDefaultCredit(code);
  };

  const named = planner.units.filter((u): u is AuditPlannerUnit & { unit: NonNullable<AuditPlannerUnit['unit']> } => u.unit !== null);
  const toAuditUnit = (u: (typeof named)[number]): AuditUnit => ({
    code: normaliseUnitCode(u.unit.unit_code),
    name: u.unit.unit_name ?? null,
    semester: u.semester ?? null,
    category: u.category,
  });
  const isPassed = (u: (typeof named)[number]) => passed.has(normaliseUnitCode(u.unit.unit_code));

  const coreMissing = named.filter((u) => (u.category === 'core' || u.category === 'major_core') && !isPassed(u)).map(toAuditUnit);
  const prescribedMissing = named.filter((u) => u.category === 'prescribed_elective' && !isPassed(u)).map(toAuditUnit);
  const wilUnit = named.find((u) => u.category === 'wil');
  const wilMissing = wilUnit && !isPassed(wilUnit) ? toAuditUnit(wilUnit) : null;

  // ---- elective credit ----
  const compulsory = new Set(
    named.filter((u) => ['core', 'major_core', 'prescribed_elective', 'wil'].includes(u.category)).map((u) => normaliseUnitCode(u.unit.unit_code)),
  );
  const prescribed = new Set(named.filter((u) => u.category === 'prescribed_elective').map((u) => normaliseUnitCode(u.unit.unit_code)));
  const wilCode = wilUnit ? normaliseUnitCode(wilUnit.unit.unit_code) : null;
  const wilInElectives = !!wilCode && planner.wil_cp == null;

  const electiveEarned = [...passed]
    .filter((c) => !c.startsWith('MPU'))
    .filter((c) => prescribed.has(c) || !compulsory.has(c) || (wilInElectives && c === wilCode))
    .reduce((sum, c) => sum + creditFor(c), 0);
  const electiveRequired = planner.elective_cp ?? 0;
  // Prescribed electives (and the placement, where it counts as electives) still owed are already listed above.
  const prescribedOwed = prescribedMissing.length * UNIT_CREDIT;
  const wilOwed = wilInElectives && wilMissing ? creditFor(wilCode!) : 0;
  const electiveShortfallUnits = Math.max(0, Math.ceil((electiveRequired - electiveEarned - prescribedOwed - wilOwed) / UNIT_CREDIT));

  // ---- credits ----
  const fromTranscript = [...passed].reduce((sum, c) => sum + (c.startsWith('MPU') ? 0 : creditFor(c)), 0);
  const creditsCompleted = options.creditsCompleted ?? fromTranscript;
  const creditsRequired = options.creditsRequired || DEFAULT_REQUIRED;
  const creditsOk = creditsCompleted >= creditsRequired;

  // ---- credit bars (what the tab draws) ----
  const achievedFor = (categories: string[], includeElectiveGroups = false) => {
    const inCategory = named.filter((u) => categories.includes(u.category));
    const seen = new Set(inCategory.map((u) => normaliseUnitCode(u.unit.unit_code)));
    let sum = inCategory.reduce((total, u) => {
      const code = normaliseUnitCode(u.unit.unit_code);
      return passed.has(code) ? total + (earnedByCode.get(code) ?? 0) : total;
    }, 0);
    if (includeElectiveGroups) {
      // A unit the planner only offers as a group candidate still counts, once.
      for (const group of planner.elective_groups ?? []) {
        for (const gu of group.units ?? []) {
          const code = normaliseUnitCode(gu.unit?.unit_code);
          if (!code || seen.has(code)) continue;
          seen.add(code);
          if (passed.has(code)) sum += earnedByCode.get(code) ?? 0;
        }
      }
    }
    return sum;
  };
  const bars: CreditBar[] = [];
  if (planner.core_cp != null || planner.major_cp != null) {
    bars.push({ key: 'core-major', label: 'Core & Major Credits', achieved: achievedFor(['core', 'major_core']), required: (planner.core_cp ?? 0) + (planner.major_cp ?? 0) });
  }
  if (planner.elective_cp != null) {
    bars.push({ key: 'elective', label: 'Elective Credits', achieved: achievedFor(['elective', 'prescribed_elective'], true), required: planner.elective_cp });
  }
  if (planner.wil_cp != null) {
    bars.push({ key: 'wil', label: 'WIL Credits', achieved: achievedFor(['wil']), required: planner.wil_cp });
  }

  // ---- verdict ----
  const concededOverLimit = conceded.length > MAX_CONCEDED_PASSES;
  const reasons: string[] = [];
  const missingCount = coreMissing.length + prescribedMissing.length + (wilMissing ? 1 : 0);
  if (coreMissing.length) reasons.push(`${coreMissing.length} core or major unit(s) not yet passed`);
  if (prescribedMissing.length) reasons.push(`${prescribedMissing.length} prescribed elective(s) not yet passed`);
  if (wilMissing) reasons.push(`the work placement (${wilMissing.code}) is not yet passed`);
  if (electiveShortfallUnits > 0) reasons.push(`${electiveShortfallUnits} more elective unit(s) needed`);
  if (inProgress.length) reasons.push(`${inProgress.length} unit(s) still in progress`);
  if (concededOverLimit) reasons.push(`${conceded.length} Conceded Passes (the maximum for graduation is ${MAX_CONCEDED_PASSES})`);
  if (!creditsOk) reasons.push(`${creditsCompleted} of ${creditsRequired} credits completed`);

  return {
    eligible: missingCount === 0 && electiveShortfallUnits === 0 && inProgress.length === 0 && !concededOverLimit && creditsOk,
    coreMissing,
    prescribedMissing,
    wilMissing,
    electiveShortfallUnits,
    inProgress,
    concededPasses: conceded,
    concededOverLimit,
    creditsCompleted,
    creditsRequired,
    creditsOk,
    bars,
    reasons,
  };
}
