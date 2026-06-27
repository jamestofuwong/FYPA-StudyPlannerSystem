import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { NOTICE_VERSION } from '../../../../lib/privacyNoticeContent';
import { parseCohortExcel } from '../../../../../core/services/cohort/cohortExcelParser';
import { runMatchingPipeline } from '../../../../../core/services/matching/matchingService';
import * as plannerRepository from '../../../../../core/db/repositories/plannerRepository';
import type { PlannerTemplate, UnitMasterEntry, CourseType } from '../../../../../core/shared/types/matching';
import {
  createSession,
  updateStudentResult,
  getActiveSession,
  type CohortStudentResult,
} from '../store';

export const runtime = 'nodejs';

// Priority for resolving a unit's category when it appears in multiple planners.
const CATEGORY_PRIORITY: Record<string, number> = {
  major_core: 5,
  prescribed_elective: 4,
  core: 3,
  elective: 2,
  wil: 1,
};

function toMatchingCategory(prismaCategory: string): UnitMasterEntry['category'] | null {
  switch (prismaCategory) {
    case 'core':                return 'core';
    case 'major_core':          return 'majorCore';
    case 'prescribed_elective': return 'prescribed';
    case 'elective':            return 'freeElective';
    case 'wil':                 return 'WIL';
    default:                    return null; // mpu excluded
  }
}

function summariseForCohort(
  matchResult: any,
  graduationCheck: any,
): CohortStudentResult['matchResult'] {
  return {
    detectedMajor: matchResult?.primaryMajor?.majorName ?? null,
    majorName: matchResult?.primaryMajor?.majorName ?? null,
    matchPct: matchResult?.primaryMajor?.matchPct ?? 0,
    atRiskLevel: matchResult?.riskReport?.level ?? 'unknown',
    graduationEligible: graduationCheck?.isEligible ?? false,
    missingCoreCount: matchResult?.unmatchedCore?.length ?? 0,
    status: matchResult?.status ?? 'noMajorDetected',
  };
}

export async function POST(req: NextRequest) {
  // Privacy gate (REQ-PRI-101)
  const acknowledged = await prisma.privacyEvent.findFirst({
    where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
  });
  if (!acknowledged) {
    return NextResponse.json(
      { error: 'Privacy notice has not been acknowledged. Please restart the application and accept the privacy notice before processing cohort data.' },
      { status: 403 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const students = parseCohortExcel(buffer);

    if (students.length === 0) {
      return NextResponse.json({ error: 'No students found in the uploaded file.' }, { status: 400 });
    }

    // Read config once
    const thresholdRow = await prisma.systemConfig
      .findUnique({ where: { key: 'second_major_threshold' } })
      .catch(() => null);
    const secondMajorThreshold = thresholdRow
      ? Math.min(1, Math.max(0, parseFloat(thresholdRow.value)))
      : 0.70;

    // Fetch planners once outside the per-student loop
    const dbPlanners = await plannerRepository.getAllPlannersWithUnits();

    // Build unitMasterTable once
    const masterMap = new Map<string, { category: string; priority: number }>();
    for (const planner of dbPlanners) {
      for (const tu of planner.units) {
        if (!tu.unit) continue;
        const code = tu.unit.unit_code;
        const priority = CATEGORY_PRIORITY[tu.category] ?? 0;
        const existing = masterMap.get(code);
        if (!existing || priority > existing.priority) {
          masterMap.set(code, { category: tu.category, priority });
        }
      }
    }

    const unitMasterTable: UnitMasterEntry[] = [];
    for (const [code, entry] of masterMap) {
      const category = toMatchingCategory(entry.category);
      if (!category) continue;
      unitMasterTable.push({ code, name: '', category, creditHours: 12.5, subjectTags: [], requisites: [] });
    }

    // Map DB planners to PlannerTemplate shape once
    const formattedPlanners: PlannerTemplate[] = dbPlanners.map((p) => ({
      plannerID: p.id,
      majorName: p.major?.name ?? '',
      intakeYear: p.intake_year,
      intakeSemester: ((p.intake_month ?? 1) >= 7 ? 2 : 1) as 1 | 2,
      courseType: (p.course_type as CourseType) || 'degree',
      durationSemesters: p.duration_semesters || 8,
      requiredCore: p.units
        .filter((u) => u.category === 'core' && u.unit)
        .map((u) => u.unit!.unit_code),
      requiredMajorCore: new Set(
        p.units
          .filter((u) => u.category === 'major_core' && u.unit)
          .map((u) => u.unit!.unit_code),
      ),
      prescribedElectiveCategories: p.elective_groups.map((eg) => ({
        categoryCode: eg.id,
        pool: new Set(eg.units.map((egu) => egu.unit.unit_code)),
        slots: 1,
      })),
      freeElectivePool: new Set(
        p.units
          .filter((u) => u.category === 'elective' && u.unit)
          .map((u) => u.unit!.unit_code),
      ),
      freeElectiveSlotsRequired: p.units.filter((u) => u.category === 'elective').length,
    }));

    // Create session
    const session = createSession('excel', students.length);

    // Initialise all student results as pending
    for (const s of students) {
      session.results.push({
        studentId: s.studentId,
        studentName: s.studentName,
        status: 'pending',
      });
    }

    // Process each student synchronously
    for (const student of students) {
      updateStudentResult(student.studentId, { status: 'processing' });

      try {
        // Build completedUnitCodes: units with status 'Complete' or creditsEarned > 0
        const completedUnitCodes = student.courseList
          .filter((item) => item.status === 'Complete' || item.creditsEarned > 0)
          .map((item) => item.courseId);

        // Determine WIL: any Complete item with 'WIL' in courseId or 'work integrated' in courseTitle
        const hasWIL = student.courseList.some(
          (item) =>
            (item.status === 'Complete' || item.creditsEarned > 0) &&
            (item.courseId.toUpperCase().includes('WIL') ||
              item.courseTitle.toLowerCase().includes('work integrated')),
        );

        const intakeSemester = (student.intakeMonth <= 6 ? 1 : 2) as 1 | 2;

        const result = runMatchingPipeline({
          student: {
            studentID: student.studentId,
            intakeYear: student.intakeYear,
            intakeSemester,
            completedUnitCodes,
            hasWIL,
            courseType: 'degree',
            currentSemester: 1,
          },
          planners: formattedPlanners,
          unitMasterTable,
          config: { preferIntakeYear: false, secondMajorThreshold },
        });

        const payload = result.payload as any;
        const totalCredits = payload.totalCredits ?? 0;
        const graduationCheck = {
          isEligible:
            (payload.unmatchedCore?.length ?? 0) === 0 && totalCredits >= 300,
        };

        updateStudentResult(student.studentId, {
          status: 'done',
          matchResult: summariseForCohort(payload, graduationCheck),
        });
      } catch (err: any) {
        updateStudentResult(student.studentId, {
          status: 'error',
          error: err?.message ?? 'Matching failed',
        });
      }
    }

    const finalSession = getActiveSession();

    return NextResponse.json({
      sessionId: session.id,
      totalCount: session.totalCount,
      results: finalSession?.results ?? session.results,
    });
  } catch (error: any) {
    console.error('[Cohort Upload] Error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to process cohort file.' },
      { status: 500 },
    );
  }
}
