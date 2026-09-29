// ============================================================
// Phase 7, batching. Groups students the estimator cannot tell apart, so the pipeline runs once per distinct
// situation instead of once per student.
//
// This is only ever allowed to be an optimisation. Grouped and ungrouped runs must produce byte-identical
// per-unit figures, and there is a test that asserts exactly that, because a grouping bug would not look
// like a crash. It would look like a slightly wrong headcount that nothing else contradicts.
//
// Which makes the grouping key the whole job. It has to cover every field the pipeline reads and nothing
// else. Too narrow and two students who deserve different answers share one, silently. Too wide and the
// grouping simply stops saving anything, which is harmless. So the key errs wide: everything in rawInput
// except the student's own ID, plus the two record fields eligibility depends on.
//
// Verified against what the per-student pipeline actually consumes:
//   rawInput                 handed whole to runMatchingPipeline, so every field of it counts
//   totalCreditsEarned       credit-point requisites such as "150cp before the capstone"
//   concededPassUnitCodes    a Conceded Pass earns credit but cannot satisfy a requisite
// Everything else on a record is display only, name, studentId, the raw portal payload, the mapping
// warnings, so two students differing only in those are genuinely the same case to the estimator.
//
// Worth being honest about the payoff: on a 500-student mock cohort this collapses about a tenth of the
// work, because the pipeline was already cheap once plannerCache.ts removed the repeated database reads.
// The stronger reason to have it is that it makes an estimate auditable. "47 students in this one situation
// each contribute these 4 units" is a statement the HoD can check. 47 separate identical rows is not.
// ============================================================

import type { EstimationRecord } from '../../shared/types/classEstimation';

export interface StudentGroup {
  /** What the students in this group have in common, as a stable string. */
  key: string;
  /** The member whose pipeline result stands for the whole group. */
  representative: EstimationRecord;
  /** Every member, in the order they arrived, so an aggregate figure can be traced back to students. */
  members: EstimationRecord[];
}

function canonicalCodes(codes: readonly string[]): string {
  return [...new Set(codes.map((code) => code.trim().toUpperCase()))].sort().join(',');
}

/**
 * The string two records must share to be treated as one case.
 *
 * studentID is deliberately left out, it is the one rawInput field the pipeline does not act on. Unit codes
 * are uppercased, de-duplicated and sorted so that two transcripts listing the same units in a different
 * order, or with different padding, land in the same group rather than looking distinct.
 */
export function groupingKeyFor(record: EstimationRecord): string {
  const { rawInput } = record;
  return [
    rawInput.courseType,
    rawInput.intakeYear,
    rawInput.intakeSemester,
    rawInput.currentSemester,
    rawInput.hasWIL ? 'wil' : 'noWil',
    // Never set on a bulk run, but it would change the detected major outright if it were.
    rawInput.manualOverride ?? '',
    // Held to 2 decimal places: credit totals come off a transcript as halves at the finest, so a float
    // comparison would be the only thing splitting two otherwise identical students.
    record.totalCreditsEarned.toFixed(2),
    canonicalCodes(rawInput.completedUnitCodes),
    canonicalCodes(record.concededPassUnitCodes),
  ].join('|');
}

/**
 * Groups records by that key, preserving the order groups were first seen and the order of members within
 * each group, so a run is reproducible rather than dependent on hash iteration order.
 */
export function groupIdenticalStudents(records: EstimationRecord[]): StudentGroup[] {
  const groups = new Map<string, StudentGroup>();

  for (const record of records) {
    const key = groupingKeyFor(record);
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(record);
    } else {
      groups.set(key, { key, representative: record, members: [record] });
    }
  }

  return [...groups.values()];
}

export interface GroupingStats {
  students: number;
  groups: number;
  /** Members in the biggest group, so an unexpectedly large one is visible. */
  largestGroup: number;
  /** Pipeline runs avoided, as a share of the cohort. 0 means every student was distinct. */
  workSaved: number;
}

export function summariseGrouping(groups: StudentGroup[]): GroupingStats {
  const students = groups.reduce((sum, group) => sum + group.members.length, 0);
  return {
    students,
    groups: groups.length,
    largestGroup: groups.reduce((max, group) => Math.max(max, group.members.length), 0),
    workSaved: students === 0 ? 0 : (students - groups.length) / students,
  };
}
