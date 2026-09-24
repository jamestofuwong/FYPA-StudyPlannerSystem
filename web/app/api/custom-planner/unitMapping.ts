// Field extraction for this app's Prisma schema, shared by the custom-planner
// route and its catalogue route so both hand the scheduler identically shaped
// units. The student app has its own adapter; the mapping rules they share live
// in core/shared/scheduling.

import {
  toSchedulableUnit,
} from '../../../../core/shared/scheduling/schedulableUnit';
import type { SchedulableUnit } from '../../../../core/services/scheduling/customPlannerScheduler';

/** The nested include every schedulable unit needs, for planner, minor, elective-group and catalogue rows alike. */
export const UNIT_INCLUDE = {
  offerings: true,
  requisite_groups: {
    include: { conditions: { include: { unit: true } } },
  },
} as const;

export type RawUnitRow = {
  unit_code: string;
  unit_name: string;
  offerings: { offered_in: number }[];
  requisite_groups: any[];
};

export function toSchedulable(unit: RawUnitRow, category: string): SchedulableUnit {
  return toSchedulableUnit({
    code: unit.unit_code,
    name: unit.unit_name,
    category,
    offeringTerms: (unit.offerings ?? []).map((o) => o.offered_in),
    requisiteGroups: (unit.requisite_groups ?? []).map((group: any) =>
      (group.conditions ?? []).map((c: any) => ({
        type: c.type,
        unitCode: c.unit?.unit_code ?? null,
        creditPoints: c.credit_points,
        requisiteType: c.requisite_type,
      })),
    ),
  });
}

/**
 * The leading letters of a unit code, e.g. COS30015 to COS.
 *
 * This is the only thing in the schema that says which discipline a unit belongs
 * to. Unit has no course column, and a unit reaches a Course only by sitting on
 * some planner (TemplateUnit to PlannerTemplate to Course), so filtering by
 * Course would show nothing for a discipline that has no planner yet. Software
 * Engineering is exactly that case: there are SWE units but no SWE planner.
 * The Units page groups by prefix for the same reason.
 */
export function unitPrefix(unitCode: string): string {
  return (unitCode.trim().match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
}