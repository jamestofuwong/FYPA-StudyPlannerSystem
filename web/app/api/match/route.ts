import { NextResponse } from 'next/server';
import { runMatchingPipeline } from '../../../../core/services/matching/matchingService';
import * as plannerRepository from '../../../../core/db/repositories/plannerRepository';
import type { PlannerTemplate, UnitMasterEntry } from '../../../../core/shared/types/matching';

// Priority for resolving a unit's category when it appears in multiple planners.
// Higher value wins.
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
    default:                    return null; // mpu, etc. excluded from scoring
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawStudent = body.student;

    if (!rawStudent) return NextResponse.json({ error: "Missing student data" }, { status: 400 });

    const student = {
      ...rawStudent,
      courseType: rawStudent.courseType || "degree",
      currentSemester: rawStudent.currentSemester || 1,
    };

    const dbPlanners = await plannerRepository.getAllPlannersWithUnits();

    // Build unitMasterTable from all template units across all planners.
    // When a unit appears in multiple planners with different categories,
    // the higher-priority category wins (major_core > prescribed > core > elective > wil).
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

    // Map DB planners to the PlannerTemplate shape expected by the matching pipeline.
    const formattedPlanners: PlannerTemplate[] = dbPlanners.map((p) => ({
      plannerID: p.id,
      majorName: p.major?.name ?? '',
      intakeYear: p.intake_year,
      intakeSemester: ((p.intake_month ?? 1) >= 7 ? 2 : 1) as 1 | 2,
      requiredCore: p.units
        .filter((u) => u.category === 'core' && u.unit)
        .map((u) => u.unit!.unit_code),
      requiredMajorCore: new Set(
        p.units
          .filter((u) => u.category === 'major_core' && u.unit)
          .map((u) => u.unit!.unit_code)
      ),
      prescribedElectiveCategories: p.elective_groups.map((eg) => ({
        categoryCode: eg.id,
        pool: new Set(eg.units.map((egu) => egu.unit.unit_code)),
        slots: 1,
      })),
      freeElectivePool: new Set(
        p.units
          .filter((u) => u.category === 'elective' && u.unit)
          .map((u) => u.unit!.unit_code)
      ),
      freeElectiveSlotsRequired: p.units.filter((u) => u.category === 'elective').length,
    }));

    const result = runMatchingPipeline({
      student,
      planners: formattedPlanners,
      unitMasterTable,
      config: { preferIntakeYear: false },
    });

    const payload = result.payload as any;
    const graduationCheck = {
        isEligible: (payload.unmatchedCore?.length === 0) && (payload.totalCredits >= 300),
        details: {
            creditsProgress: `${payload.totalCredits} / 300`,
            missingCount: payload.unmatchedCore?.length || 0,
            hasFailedUnits: student.completedUnitCodes?.some((u: any) => u.grade === 'F')
        }
    };

    return NextResponse.json({
      success: true,
      data: result.payload,
      graduationCheck,
      processingTime: result.durationMs,
    });

  } catch (error) {
    console.error("Matching API Error:", error);
    return NextResponse.json({ success: false, error: "Failed to run matching pipeline" }, { status: 500 });
  }
}
