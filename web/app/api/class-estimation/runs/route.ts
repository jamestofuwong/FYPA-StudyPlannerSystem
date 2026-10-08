// ============================================================
// Saved estimation runs: list them, or save the one currently in memory.
//
// POST re-runs the estimate server-side rather than accepting figures from the browser. A saved run is a
// record of what the system predicted, so the numbers have to come from the pipeline, not from whatever a
// client posted. It also means the stored inputs cannot disagree with the stored figures.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getEstimationRecords } from '../../../../../core/services/classEstimation/estimationStore';
import { runEstimationPreview } from '../../../../../core/services/classEstimation/estimationPreview';
import { describeAcademicNow } from '../../../../../core/services/classEstimation/academicCalendar';
import {
  resolveRetentionRate,
  parseStoredRetentionRate,
} from '../../../../../core/services/classEstimation/retention';
import { DEFAULT_CLASS_ESTIMATION_CONFIG } from '../../../../../core/shared/types/classEstimation';
import {
  saveEstimationRun,
  listEstimationRuns,
} from '../../../../../core/db/repositories/estimationRunRepository';
import { prisma } from '../../../../../core/db/client';
import { NEW_INTAKE_KEY, parseNewIntakeTotal } from '../../../../../core/services/classEstimation/newIntakeSetting';

export const dynamic = 'force-dynamic';

const RETENTION_KEY = 'class_estimation_retention_rate';

async function storedNumber(key: string): Promise<string | null> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Where a batch came from. "mixed" when a cohort was assembled from more than one source. */
function sourceOf(records: ReturnType<typeof getEstimationRecords>): string {
  const sources = new Set(records.map((record) => record.source));
  if (sources.size === 0) return 'none';
  if (sources.size === 1) return [...sources][0];
  return 'mixed';
}

export async function GET() {
  try {
    return NextResponse.json({ runs: await listEstimationRuns() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation runs] list failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const records = getEstimationRecords();
  if (records.length === 0) {
    return NextResponse.json(
      { error: 'No students in memory. Run a scrape or import a batch before saving a run.' },
      { status: 400 },
    );
  }

  let body: { label?: string } = {};
  try {
    body = await req.json();
  } catch {
    // A label is optional, so an empty or absent body is fine.
  }

  const academicNow = describeAcademicNow();
  const retentionRate =
    parseStoredRetentionRate(await storedNumber(RETENTION_KEY))
    ?? DEFAULT_CLASS_ESTIMATION_CONFIG.retentionRate;

  const newIntakeCount = parseNewIntakeTotal(await storedNumber(NEW_INTAKE_KEY)) ?? 0;

  try {
    const preview = await runEstimationPreview(records, {
      targetTerm: academicNow.next.semester,
      targetYear: academicNow.next.year,
      loadCap: DEFAULT_CLASS_ESTIMATION_CONFIG.loadCap,
      retentionRate: resolveRetentionRate(retentionRate, DEFAULT_CLASS_ESTIMATION_CONFIG.retentionRate),
      newIntakeCount,
    });

    const id = await saveEstimationRun({
      label: body.label ?? null,
      course: preview.summary.course.course,
      targetYear: academicNow.next.year,
      targetSemester: academicNow.next.semester,
      loadCap: DEFAULT_CLASS_ESTIMATION_CONFIG.loadCap,
      retentionRate: preview.summary.retentionRate,
      newIntake: preview.summary.newIntakeCount,
      source: sourceOf(records),
      studentCount: preview.summary.students,
      groupCount: preview.summary.grouping.groups,
      commonCoreCount: preview.summary.commonCoreOnly,
      units: preview.summary.projectedByUnit.map((unit) => ({
        unitCode: unit.code,
        fromNamedPicks: unit.fromNamedPicks,
        fromElectives: unit.fromElectives,
        fromNewIntake: unit.fromNewIntake,
        projected: unit.projected,
        headcount: unit.headcount,
      })),
    });

    return NextResponse.json({ id, units: preview.summary.projectedByUnit.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation runs] save failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
