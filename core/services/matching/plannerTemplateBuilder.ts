// ============================================================
// Shared PlannerTemplate[] builder for runMatchingPipeline().
// Extracted from web/app/api/match/route.ts so /api/match and the new
// class-estimation module build the exact same planner shape and stay
// consistent with each other. Unlike unitMasterTableBuilder.ts, this
// mapping wasn't broken, it's moved here verbatim, not fixed.
//
// Note on what each DB unit_category becomes here (confirmed by reading
// core/db/repositories/plannerRepository.ts's savePlannerFromImport):
//  - core, major_core: TemplateUnit rows with an explicit slot, mapped
//    to requiredCore / requiredMajorCore.
//  - elective: TemplateUnit rows that DO carry a year_level/semester
//    slot become freeElectivePool entries. Elective units with NO slot
//    become ElectiveGroupUnit pool entries instead, and those pools
//    become prescribedElectiveCategories below. So "prescribed" in the
//    matching pipeline's sense is the DB's unslotted elective pool, not
//    the prescribed_elective category.
//  - prescribed_elective, wil, mpu: TemplateUnit rows exist for these,
//    but the matching pipeline's PlannerTemplate type has no field for
//    them (WIL is scored from the student's own hasWIL flag, not from
//    planner-specific units), so they're intentionally not read here.
// ============================================================

import type { CourseType, PlannerTemplate } from '../../shared/types/matching';

type DbPlannerWithUnits = Awaited<ReturnType<
  typeof import('../../db/repositories/plannerRepository').getAllPlannersWithUnits
>>[number];

// A structural minimum both getAllPlannersWithUnits()'s and getPlannerById()'s per-planner shapes satisfy,
// so the two pool helpers below work against either without needing their own duplicate copy of this
// filtering logic. core/services/classEstimation/plannerCandidateResolver.ts uses these directly against a
// getPlannerById() result, instead of re-deriving the same pools with its own copy of this logic.
export interface PlannerUnitsSource {
  units: Array<{ category: string; unit: { unit_code: string } | null }>;
  elective_groups: Array<{ units: Array<{ unit: { unit_code: string } }> }>;
}

// The DB's unslotted elective pool (ElectiveGroup/ElectiveGroupUnit), which is what "prescribed" means in
// the matching pipeline's own scoring, see the note above on category mapping.
export function getPrescribedPoolCodes(planner: PlannerUnitsSource): string[] {
  return planner.elective_groups.flatMap((eg) => eg.units.map((egu) => egu.unit.unit_code));
}

// TemplateUnit rows with category 'elective' that DO carry a year_level/semester slot.
export function getFreeElectivePoolCodes(planner: PlannerUnitsSource): string[] {
  return planner.units
    .filter((u) => u.category === 'elective' && u.unit)
    .map((u) => u.unit!.unit_code);
}

export function buildPlannerTemplatesForMatching(dbPlanners: DbPlannerWithUnits[]): PlannerTemplate[] {
  return dbPlanners.map((p) => ({
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
        .map((u) => u.unit!.unit_code)
    ),
    prescribedElectiveCategories: p.elective_groups.map((eg) => ({
      categoryCode: eg.id,
      pool: new Set(eg.units.map((egu) => egu.unit.unit_code)),
      slots: 1,
    })),
    freeElectivePool: new Set(getFreeElectivePoolCodes(p)),
    freeElectiveSlotsRequired: p.units.filter((u) => u.category === 'elective').length,
  }));
}
