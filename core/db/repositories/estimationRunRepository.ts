// ============================================================
// Saved class estimation runs.
//
// A run is a snapshot, not a view. It stores the figures AND the inputs that produced them, because an
// estimate read months later is meaningless without the retention rate, load cap and new-intake figure
// behind it, and re-deriving those from whatever the settings say today would misreport history.
//
// Prisma returns Decimal for the numeric columns, which is right for storage and awkward for callers, so
// everything here hands back plain numbers. The rounded headcount is stored alongside the fractional
// projection rather than recomputed on read: rounding is a decision the run made, and a later change to how
// rounding works must not silently rewrite what a past run reported.
// ============================================================

import { prisma } from '../client';

export interface EstimationRunUnitRecord {
  unitCode: string;
  /**
   * The unit's name as the catalogue has it now, looked up when the run is read rather than stored with it.
   * Empty when the unit is no longer in the catalogue. Only ever used for display, so a later rename showing
   * on an old run is harmless; the figures themselves are what the run saved.
   */
  unitName?: string;
  fromNamedPicks: number;
  fromElectives: number;
  fromNewIntake: number;
  projected: number;
  headcount: number;
}

export interface EstimationRunInput {
  label?: string | null;
  /** The course the batch was detected to belong to, or null if none was found. */
  course?: string | null;
  targetYear: number;
  targetSemester: 1 | 2;
  loadCap: number;
  retentionRate: number;
  newIntake: number;
  /** portal, import, mock, or mixed when a batch came from more than one. */
  source: string;
  studentCount: number;
  groupCount: number;
  commonCoreCount: number;
  units: EstimationRunUnitRecord[];
}

export interface EstimationRunSummary {
  id: string;
  createdAt: Date;
  label: string | null;
  /** Null on estimates saved before courses were recorded. */
  course: string | null;
  targetYear: number;
  targetSemester: number;
  loadCap: number;
  retentionRate: number;
  newIntake: number;
  source: string;
  studentCount: number;
  groupCount: number;
  commonCoreCount: number;
  /** Units in the run, so a list can show its size without loading every row. */
  unitCount: number;
  /** Sum of the rounded per-unit figures. */
  totalHeadcount: number;
}

export interface EstimationRunDetail extends EstimationRunSummary {
  units: EstimationRunUnitRecord[];
}

/** Prisma's Decimal, or anything numeric, as a plain number. */
function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Writes a run and its per-unit rows in one transaction, so a failure part way through cannot leave a run
 * with half its units, which would read as a complete estimate that quietly lost classes.
 */
export async function saveEstimationRun(input: EstimationRunInput): Promise<string> {
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.estimationRun.create({
      data: {
        label: input.label?.trim() || null,
        course: input.course?.trim() || null,
        target_year: input.targetYear,
        target_semester: input.targetSemester,
        load_cap: input.loadCap,
        retention_rate: input.retentionRate,
        new_intake: input.newIntake,
        source: input.source,
        student_count: input.studentCount,
        group_count: input.groupCount,
        common_core_count: input.commonCoreCount,
      },
    });

    if (input.units.length > 0) {
      await tx.estimationRunUnit.createMany({
        data: input.units.map((unit) => ({
          run_id: created.id,
          unit_code: unit.unitCode,
          from_named_picks: unit.fromNamedPicks,
          from_electives: unit.fromElectives,
          from_new_intake: unit.fromNewIntake,
          projected: unit.projected,
          headcount: unit.headcount,
        })),
      });
    }

    return created;
  });

  return run.id;
}

/** Runs newest first, without their per-unit rows. */
export async function listEstimationRuns(limit = 50): Promise<EstimationRunSummary[]> {
  const runs = await prisma.estimationRun.findMany({
    orderBy: { created_at: 'desc' },
    take: limit,
    include: {
      units: { select: { headcount: true } },
    },
  });

  return runs.map((run) => ({
    id: run.id,
    createdAt: run.created_at,
    label: run.label,
    course: run.course,
    targetYear: run.target_year,
    targetSemester: run.target_semester,
    loadCap: run.load_cap,
    retentionRate: toNumber(run.retention_rate),
    newIntake: run.new_intake,
    source: run.source,
    studentCount: run.student_count,
    groupCount: run.group_count,
    commonCoreCount: run.common_core_count,
    unitCount: run.units.length,
    totalHeadcount: run.units.reduce((sum, unit) => sum + unit.headcount, 0),
  }));
}

/** One run with every unit row, ordered as the estimate presented them: largest headcount first. */
export async function getEstimationRun(id: string): Promise<EstimationRunDetail | null> {
  const run = await prisma.estimationRun.findUnique({
    where: { id },
    include: { units: { orderBy: [{ headcount: 'desc' }, { unit_code: 'asc' }] } },
  });
  if (!run) return null;

  // One query for every name in the run. unit_code is stored as text, not a link, so a unit removed from the
  // catalogue since simply comes back without a name and the run still reads.
  const catalogue = await prisma.unit.findMany({
    where: { unit_code: { in: run.units.map((unit) => unit.unit_code) } },
    select: { unit_code: true, unit_name: true },
  });
  const nameOf = new Map(catalogue.map((unit) => [unit.unit_code, unit.unit_name]));

  const units: EstimationRunUnitRecord[] = run.units.map((unit) => ({
    unitCode: unit.unit_code,
    unitName: nameOf.get(unit.unit_code) ?? '',
    fromNamedPicks: toNumber(unit.from_named_picks),
    fromElectives: toNumber(unit.from_electives),
    fromNewIntake: toNumber(unit.from_new_intake),
    projected: toNumber(unit.projected),
    headcount: unit.headcount,
  }));

  return {
    id: run.id,
    createdAt: run.created_at,
    label: run.label,
    course: run.course,
    targetYear: run.target_year,
    targetSemester: run.target_semester,
    loadCap: run.load_cap,
    retentionRate: toNumber(run.retention_rate),
    newIntake: run.new_intake,
    source: run.source,
    studentCount: run.student_count,
    groupCount: run.group_count,
    commonCoreCount: run.common_core_count,
    unitCount: units.length,
    totalHeadcount: units.reduce((sum, unit) => sum + unit.headcount, 0),
    units,
  };
}

/** Deletes a run. The unit rows go with it, by the cascade on the foreign key. */
export async function deleteEstimationRun(id: string): Promise<boolean> {
  try {
    await prisma.estimationRun.delete({ where: { id } });
    return true;
  } catch {
    return false;   // already gone, which is the outcome the caller wanted anyway
  }
}
