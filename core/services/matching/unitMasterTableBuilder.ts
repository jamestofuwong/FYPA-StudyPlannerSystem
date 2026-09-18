// ============================================================
// Shared unitMasterTable builder for runMatchingPipeline().
// Replaces the placeholder construction that used to live inline in
// web/app/api/match/route.ts (name: '', creditHours: 12.5 hardcoded,
// requisites: [] always empty). Wires in the real unit name, real
// offering semesters, and a real flat Requisite[] read from the DB.
// ============================================================

import * as unitRepository from '../../db/repositories/unitRepository';
import * as plannerRepository from '../../db/repositories/plannerRepository';
import type { Requisite, RequisiteType, UnitMasterEntry } from '../../shared/types/matching';

// core/db has no per-unit credit_points field, and customPlannerScheduler.ts
// already assumes this same flat rate for every unit, so we follow it too.
const FLAT_CREDIT_HOURS = 12.5;

// Priority for resolving a unit's category when it appears in multiple planners
// with different categories. Higher value wins. Moved here from
// web/app/api/match/route.ts so /api/match and class estimation can share it.
export const CATEGORY_PRIORITY: Record<string, number> = {
  major_core: 5,
  prescribed_elective: 4,
  core: 3,
  elective: 2,
  wil: 1,
};

export function toMatchingCategory(prismaCategory: string): UnitMasterEntry['category'] | null {
  switch (prismaCategory) {
    case 'core':                return 'core';
    case 'major_core':          return 'majorCore';
    case 'prescribed_elective': return 'prescribed';
    case 'elective':            return 'freeElective';
    case 'wil':                 return 'WIL';
    default:                    return null;         // mpu, etc, excluded from scoring
  }
}

// The DB uses "corequisite"; the matching domain's Requisite type uses "concurrent"
// for the same concept (core/shared/types/matching.ts).
function toMatchingRequisiteType(dbRequisiteType: string | null | undefined): RequisiteType | null {
  switch (dbRequisiteType) {
    case 'prerequisite':  return 'prerequisite';
    case 'corequisite':   return 'concurrent';
    case 'antirequisite': return 'antirequisite';
    default:               return null;
  }
}

type RawRequisiteGroup = {
  conditions: Array<{
    type: string;
    requisite_type: string | null;
    unit: { unit_code: string } | null;
  }>;
};

// Flattens a unit's requisite_groups (OR of AND) into the matching domain's flat
// Requisite[]. This drops "credit_points" conditions, since Requisite has no
// representation for them. That's fine here: this flat list only feeds the
// retrospective checkRequisites() in profileBuilder.ts. The forward-looking
// eligibility engine in classEstimation reads requisite_groups straight from
// the DB instead, so credit-point requisites aren't lost for eligibility.
function flattenRequisites(requisiteGroups: RawRequisiteGroup[]): Requisite[] {
  const flat: Requisite[] = [];
  for (const group of requisiteGroups ?? []) {
    for (const condition of group.conditions ?? []) {
      if (condition.type !== 'unit') continue;
      const unitCode = condition.unit?.unit_code;
      if (!unitCode) continue;
      const type = toMatchingRequisiteType(condition.requisite_type);
      if (!type) continue;
      flat.push({ type, unitCode });
    }
  }
  return flat;
}

// Builds a real UnitMasterEntry[] for runMatchingPipeline(), covering every unit
// that appears in at least one planner template. Category is resolved by the
// same cross-planner CATEGORY_PRIORITY dedup the planner-template builder uses,
// so both stay consistent with each other.
export async function buildUnitMasterTable(): Promise<UnitMasterEntry[]> {
  const [allUnits, dbPlanners] = await Promise.all([
    unitRepository.getAllUnits(),
    plannerRepository.getAllPlannersWithUnits(),
  ]);

  const categoryByCode = new Map<string, { category: string; priority: number }>();
  for (const planner of dbPlanners) {
    for (const tu of planner.units) {
      if (!tu.unit) continue;
      const code = tu.unit.unit_code;
      const priority = CATEGORY_PRIORITY[tu.category] ?? 0;
      const existing = categoryByCode.get(code);
      if (!existing || priority > existing.priority) {
        categoryByCode.set(code, { category: tu.category, priority });
      }
    }
  }

  const unitMasterTable: UnitMasterEntry[] = [];
  for (const unit of allUnits) {
    const resolved = categoryByCode.get(unit.unit_code);
    if (!resolved) continue;                          // unit isn't placed in any planner
    const category = toMatchingCategory(resolved.category);
    if (!category) continue;                           // mpu, etc

    unitMasterTable.push({
      code: unit.unit_code,
      name: unit.unit_name,
      category,
      creditHours: FLAT_CREDIT_HOURS,
      subjectTags: [],
      offeringSemesters: unit.offerings.filter((term): term is 1 | 2 => term === 1 || term === 2),
      requisites: flattenRequisites(unit.requisites),
    });
  }

  return unitMasterTable;
}
