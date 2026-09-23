import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../core/db/client';
import {
  buildCustomPlan,
  mapUnitToSchedulable,
  validateSchedulerConfig,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';
import { toSchedulableUnit } from '../../../../core/shared/scheduling/schedulableUnit';

// Field extraction for this app's Prisma schema. The student app has its own
// adapter; the mapping rules they share live in core/shared/scheduling.
function toSchedulable(
  unit: { unit_code: string; unit_name: string; offerings: { offered_in: number }[]; requisite_groups: any[] },
  category: string
): SchedulableUnit {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      plannerId, completedUnitCodes, startYear, startSemester, injectedMinorIds,
      concededPassUnitCodes, config,
    } = body;

    if (
      !plannerId ||
      typeof startYear !== 'number' ||
      (startSemester !== 1 && startSemester !== 2)
    ) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const configCheck = validateSchedulerConfig(config);
    if (!configCheck.ok) {
      return NextResponse.json({ error: `Invalid scheduler config: ${configCheck.error}` }, { status: 400 });
    }

    if (
      concededPassUnitCodes !== undefined &&
      !(Array.isArray(concededPassUnitCodes) && concededPassUnitCodes.every((c: unknown) => typeof c === 'string'))
    ) {
      return NextResponse.json({ error: 'concededPassUnitCodes must be an array of unit codes' }, { status: 400 });
    }

    const planner = await prisma.plannerTemplate.findUnique({
      where: { id: plannerId },
      include: {
        units: {
          include: {
            unit: {
              include: {
                offerings: true,
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

    if (planner.intake_month == null) {
      console.warn(`[custom-planner] planner ${plannerId} has no intake_month, assuming a Feb/Mar intake`);
    }
    const intakeSemester: 1 | 2 = (planner.intake_month ?? 1) >= 7 ? 2 : 1;

    const normalizedCompleted = new Set(
      (completedUnitCodes as string[]).map((c) => c.trim().toUpperCase())
    );

    // The core pool is all planner units the student has not yet completed/enrolled in
    const remainingUnits: SchedulableUnit[] = planner.units
      .filter((tu) => tu.unit !== null && !normalizedCompleted.has(tu.unit.unit_code.toUpperCase()))
      .map((tu) => mapUnitToSchedulable(tu.unit!, String(tu.category)));

    // Minor injection
    const minorIds: string[] = Array.isArray(injectedMinorIds) ? injectedMinorIds : [];
    if (minorIds.length > 0) {
      const minors = await prisma.minor.findMany({
        where: { id: { in: minorIds } },
        include: {
          units: {
            include: {
              unit: {
                include: {
                  offerings: true,
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
          remainingUnits.push(mapUnitToSchedulable(mu.unit, 'minor'));
          poolCodes.add(code);
        }
      }
    }

    const result = buildCustomPlan(
      remainingUnits,
      completedUnitCodes as string[],
      startYear as number,
      startSemester as 1 | 2,
      intakeSemester,
      (concededPassUnitCodes as string[] | undefined) ?? [],
      configCheck.config
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[custom-planner]', error);
    return NextResponse.json({ error: 'Failed to generate custom plan' }, { status: 500 });
  }
}
