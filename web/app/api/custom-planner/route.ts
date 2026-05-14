import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';
import {
  buildCustomPlan,
  type SchedulableUnit,
  type RequisiteCondition,
} from '../../../../core/services/scheduling/customPlannerScheduler';

/** Convert a raw unit + its requisite groups into a SchedulableUnit. */
function toSchedulable(
  unit: { unit_code: string; unit_name: string; offered_in: number | null; requisite_groups: any[] },
  category: string
): SchedulableUnit {
  const requisiteGroups: RequisiteCondition[][] = (unit.requisite_groups ?? [])
    .map((group: any) =>
      group.conditions
        .map((c: any): RequisiteCondition | null => {
          if (c.type === 'credit_points') {
            return { type: 'credit_points', creditPoints: Number(c.credit_points) };
          }
          if (c.type === 'unit' && c.unit !== null) {
            return {
              type: 'unit',
              requisiteType: (c.requisite_type ?? 'prerequisite') as 'prerequisite' | 'corequisite' | 'antirequisite',
              unitCode: c.unit.unit_code.toUpperCase(),
            };
          }
          return null;
        })
        .filter((c: RequisiteCondition | null): c is RequisiteCondition => c !== null)
    )
    .filter((g: RequisiteCondition[]) => g.length > 0);

  const offeringSemesters: (1 | 2)[] =
    unit.offered_in === 1 ? [1] : unit.offered_in === 2 ? [2] : [];

  return { code: unit.unit_code, name: unit.unit_name, category, offeringSemesters, requisiteGroups };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { plannerId, completedUnitCodes, startYear, startSemester, injectedMinorIds } = body;

    if (
      !plannerId ||
      typeof startYear !== 'number' ||
      (startSemester !== 1 && startSemester !== 2)
    ) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    // Fetch planner with full unit + requisite data in a single query
    const planner = await prisma.plannerTemplate.findUnique({
      where: { id: plannerId },
      include: {
        units: {
          include: {
            unit: {
              include: {
                requisite_groups: {
                  include: { conditions: { include: { unit: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!planner) {
      return NextResponse.json({ error: 'Planner not found' }, { status: 404 });
    }

    const normalizedCompleted = new Set(
      (completedUnitCodes as string[]).map((c) => c.trim().toUpperCase())
    );

    // Build the core pool — all planner units the student has not yet completed/enrolled in
    const remainingUnits: SchedulableUnit[] = planner.units
      .filter((tu) => tu.unit !== null && !normalizedCompleted.has(tu.unit.unit_code.toUpperCase()))
      .map((tu) => toSchedulable(tu.unit!, String(tu.category)));

    // ── Minor injection ────────────────────────────────────────────────────
    const minorIds: string[] = Array.isArray(injectedMinorIds) ? injectedMinorIds : [];
    if (minorIds.length > 0) {
      const minors = await prisma.minor.findMany({
        where: { id: { in: minorIds } },
        include: {
          units: {
            include: {
              unit: {
                include: {
                  requisite_groups: {
                    include: { conditions: { include: { unit: true } } },
                  },
                },
              },
            },
          },
        },
      });

      const poolCodes = new Set([
        ...normalizedCompleted,
        ...remainingUnits.map((u) => u.code.toUpperCase()),
      ]);

      for (const minor of minors) {
        for (const mu of minor.units) {
          const code = mu.unit.unit_code.toUpperCase();
          if (poolCodes.has(code)) continue;
          remainingUnits.push(toSchedulable(mu.unit, 'minor'));
          poolCodes.add(code);
        }
      }
    }

    const result = buildCustomPlan(
      remainingUnits,
      completedUnitCodes as string[],
      startYear as number,
      startSemester as 1 | 2
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[custom-planner]', error);
    return NextResponse.json({ error: 'Failed to generate custom plan' }, { status: 500 });
  }
}
