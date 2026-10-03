import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import * as plannerRepository from '../../../../../core/db/repositories/plannerRepository';
import { UNIT_INCLUDE, toSchedulable } from '../../custom-planner/unitMapping';
import { PLAN_FILE_LIMITS, type PlanPayloadPlannerKey } from '../../../../../core/shared/planFile';

// Resolves a plan file's planner key (course + major + intake year + intake
// month) to a real PlannerTemplate, without ever trusting a stored UUID:
// UUIDs are not stable across a reseed or a different machine (REQ-DB-102's
// premise), but this natural key is. Also resolves the file's minor names
// and double-major major name to real ids on the matched planner, and the
// outside-planner unit codes to real Unit rows, so the client that calls
// this never has to invent or trust unit data from the file itself.

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= PLAN_FILE_LIMITS.maxStringLength;
}

function isValidPlannerKey(value: unknown): value is PlanPayloadPlannerKey {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.courseName)) return false;
  if (v.courseCode !== null && !isNonEmptyString(v.courseCode)) return false;
  if (v.majorName !== null && !isNonEmptyString(v.majorName)) return false;
  if (typeof v.intakeYear !== 'number' || !Number.isFinite(v.intakeYear)) return false;
  if (v.intakeMonth !== null && typeof v.intakeMonth !== 'number') return false;
  return true;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => isNonEmptyString(v))
    .slice(0, PLAN_FILE_LIMITS.maxCodesPerList);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Malformed request body.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ success: false, error: 'Malformed request body.' }, { status: 400 });
  }

  const { planner: plannerKey, minorNames: rawMinorNames, doubleMajorMajorName, outsidePlannerUnitCodes: rawOutsideCodes } =
    body as Record<string, unknown>;

  if (!isValidPlannerKey(plannerKey)) {
    return NextResponse.json({ success: false, error: 'Malformed planner key.' }, { status: 400 });
  }
  if (doubleMajorMajorName !== null && doubleMajorMajorName !== undefined && !isNonEmptyString(doubleMajorMajorName)) {
    return NextResponse.json({ success: false, error: 'Malformed double major name.' }, { status: 400 });
  }
  const minorNames = sanitizeStringArray(rawMinorNames);
  const outsidePlannerUnitCodes = sanitizeStringArray(rawOutsideCodes).map((c) => c.trim().toUpperCase());

  try {
    const course = plannerKey.courseCode
      ? await prisma.course.findUnique({ where: { code: plannerKey.courseCode } })
      : await prisma.course.findFirst({ where: { name: plannerKey.courseName } });

    if (!course) {
      return NextResponse.json({
        success: false,
        error: `This file is for "${plannerKey.courseName}", which is not in this database.`,
      });
    }

    const major = plannerKey.majorName
      ? await prisma.major.findUnique({ where: { course_id_name: { course_id: course.id, name: plannerKey.majorName } } })
      : null;
    if (plannerKey.majorName && !major) {
      return NextResponse.json({
        success: false,
        error: `This file is for "${plannerKey.majorName}" (${plannerKey.courseName}), which is not in this database.`,
      });
    }

    const monthLabel = plannerKey.intakeMonth != null ? ` intake month ${plannerKey.intakeMonth}` : '';
    // findFirst with a flat where, not findUnique's generated compound-key
    // shape: the @@unique constraint still applies at the database level
    // (at most one row can match), but the generated compound-key TS type
    // does not accept null for a nullable column in the key, even though
    // both major_id and intake_month are genuinely nullable here.
    const template = await prisma.plannerTemplate.findFirst({
      where: {
        course_id: course.id,
        major_id: major?.id ?? null,
        intake_year: plannerKey.intakeYear,
        intake_month: plannerKey.intakeMonth ?? null,
      },
    });

    if (!template) {
      return NextResponse.json({
        success: false,
        error: `This file is for ${plannerKey.majorName ?? plannerKey.courseName}, ${plannerKey.intakeYear}${monthLabel}, which is not in this database.`,
      });
    }

    const planner = await plannerRepository.getPlannerById(template.id);
    if (!planner) {
      return NextResponse.json({ success: false, error: 'The matched planner could not be loaded.' });
    }

    // Minor names -> ids on THIS planner. A name the file carries that no
    // longer exists here is reported, never silently dropped.
    const minorIds: string[] = [];
    const unmatchedMinorNames: string[] = [];
    for (const name of minorNames) {
      const minor = (planner.minors ?? []).find((m) => m.name === name);
      if (minor) minorIds.push(minor.id);
      else unmatchedMinorNames.push(name);
    }

    // Double major: selectedDoubleMajorId on the page is actually a SIBLING
    // planner's id (same course/year/month, a different major), not a Major
    // id, so resolution looks for that sibling by major name.
    let doubleMajorPlannerId: string | null = null;
    let doubleMajorUnmatched = false;
    if (doubleMajorMajorName) {
      const sibling = await prisma.plannerTemplate.findFirst({
        where: {
          course_id: course.id,
          intake_year: plannerKey.intakeYear,
          intake_month: plannerKey.intakeMonth ?? null,
          major: { name: doubleMajorMajorName },
        },
      });
      if (sibling) doubleMajorPlannerId = sibling.id;
      else doubleMajorUnmatched = true;
    }

    // Outside-planner units: resolved from the database by code, never
    // trusted from the file. A code that no longer exists is reported.
    const outsidePlannerUnits: ReturnType<typeof toSchedulable>[] = [];
    const unresolvedOutsidePlannerUnitCodes: string[] = [];
    if (outsidePlannerUnitCodes.length > 0) {
      const rows = await prisma.unit.findMany({
        where: { unit_code: { in: outsidePlannerUnitCodes } },
        include: UNIT_INCLUDE,
      });
      const byCode = new Map(rows.map((r) => [r.unit_code.toUpperCase(), r]));
      for (const code of outsidePlannerUnitCodes) {
        const row = byCode.get(code);
        if (row) outsidePlannerUnits.push(toSchedulable(row, 'elective'));
        else unresolvedOutsidePlannerUnitCodes.push(code);
      }
    }

    return NextResponse.json({
      success: true,
      planner,
      minorIds,
      unmatchedMinorNames,
      doubleMajorPlannerId,
      doubleMajorUnmatched,
      outsidePlannerUnits,
      unresolvedOutsidePlannerUnitCodes,
    });
  } catch (err) {
    console.error('[plan-file/resolve]', err);
    return NextResponse.json({ success: false, error: 'Failed to resolve the planner for this file.' }, { status: 500 });
  }
}
