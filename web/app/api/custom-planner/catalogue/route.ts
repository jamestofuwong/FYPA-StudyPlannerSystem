import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { normaliseCode, type SchedulableUnit } from '../../../../../core/services/scheduling/customPlannerScheduler';
import { UNIT_INCLUDE, toSchedulable, unitPrefix } from '../unitMapping';

export type CatalogueUnit = SchedulableUnit & { prefix: string };

/**
 * Every unit the advisor may add to a plan from outside the student's planner.
 *
 * Loaded on demand, when the catalogue picker is opened, rather than with the
 * generated plan, which is already a large response. The whole catalogue is
 * under 100 units, so it comes back in one request with no paging.
 *
 * A unit from outside the planner is recorded as an elective. That is how a
 * free elective is normally treated, and it makes the elective requirement
 * credit the unit, but it is an assumption: the planner itself says nothing
 * about a unit it never listed.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const plannerId = params.get('plannerId');
    const completed = (params.get('completed') ?? '')
      .split(',')
      .map((code) => normaliseCode(code))
      .filter((code) => code.length > 0);

    // Anything the student's own planner names is already offered by the other
    // picker, so it is not "outside" and would otherwise appear in both.
    const plannerCodes = new Set<string>();
    if (plannerId) {
      const planner = await prisma.plannerTemplate.findUnique({
        where: { id: plannerId },
        include: { units: { include: { unit: { select: { unit_code: true } } } } },
      });
      if (!planner) {
        return NextResponse.json({ error: 'Planner not found' }, { status: 404 });
      }
      for (const tu of planner.units) {
        if (tu.unit) plannerCodes.add(normaliseCode(tu.unit.unit_code));
      }
    }

    const excluded = new Set([...plannerCodes, ...completed]);

    const rows = await prisma.unit.findMany({
      orderBy: { unit_code: 'asc' },
      include: UNIT_INCLUDE,
    });

    const units: CatalogueUnit[] = rows
      .filter((row) => !excluded.has(normaliseCode(row.unit_code)))
      // MPU units are never added to a semester. The catalogue already drops
      // everything the student's own planner names, so any MPU left here is from
      // a different MPU generation, and students follow their own planner's set.
      // They belong in the Remaining MPU Units table, not in the plan.
      .filter((row) => unitPrefix(row.unit_code) !== 'MPU')
      .map((row) => ({
        ...toSchedulable(row, 'elective'),
        outsidePlanner: true,
        prefix: unitPrefix(row.unit_code),
      }));

    const prefixes = [...new Set(units.map((u) => u.prefix))].filter(Boolean).sort();

    return NextResponse.json({ success: true, units, prefixes });
  } catch (error) {
    console.error('[custom-planner/catalogue]', error);
    return NextResponse.json({ error: 'Failed to load the unit catalogue' }, { status: 500 });
  }
}