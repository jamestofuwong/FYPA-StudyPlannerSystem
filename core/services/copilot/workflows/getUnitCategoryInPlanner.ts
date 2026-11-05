import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  plannerId: string;
  unitCode: string;
}

interface Output {
  plannerId: string;
  plannerName: string;
  unitCode: string;
  unitName: string | null;
  found: boolean;
  category: string | null;
  yearLevel: number | null;
  semesterNumber: number | null;
}

export const getUnitCategoryInPlannerWorkflow: Workflow<Input, Output> = {
  id: 'get_unit_category_in_planner',
  description: 'Gives the category (core, major core, elective, WIL) and the year and semester of ONE unit in ONE named planner. Use this when the user asks if a unit is core or elective in a program, or when it is scheduled there. Not for all planners (use get_planners_containing_unit).',
  keywords: ['core or elective', 'category of unit', 'which year', 'when is scheduled', 'what type', 'is it core', 'scheduled in'],
  params: [
    {
      name: 'plannerId',
      type: 'string',
      description: 'The UUID of the planner. Use list_planners or find_planner_by_major to get IDs.',
      required: true,
    },
    {
      name: 'unitCode',
      type: 'string',
      description: 'The unit code to look up (e.g. "COS30049")',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const planner = await plannerRepository.getPlannerById(params.plannerId);

      if (!planner) {
        return { ok: false, error: `Planner "${params.plannerId}" not found. Use list_planners to see available planners.` };
      }

      const targetCode = params.unitCode.trim().toUpperCase();
      const plannerName = `${planner.major?.name ?? 'Unknown'} — ${planner.course?.name ?? 'Unknown'} (${planner.course_type}, ${planner.intake_year})`;

      const match = planner.units.find(
        (tu) => tu.unit?.unit_code.toUpperCase() === targetCode,
      );

      if (!match) {
        return {
          ok: true,
          data: {
            plannerId: params.plannerId,
            plannerName,
            unitCode: params.unitCode,
            unitName: null,
            found: false,
            category: null,
            yearLevel: null,
            semesterNumber: null,
          },
        };
      }

      return {
        ok: true,
        data: {
          plannerId: params.plannerId,
          plannerName,
          unitCode: match.unit!.unit_code,
          unitName: match.unit!.unit_name,
          found: true,
          category: match.category ?? 'core',
          yearLevel: match.year_level ?? null,
          semesterNumber: match.semester ?? null,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch unit category in planner.' };
    }
  },
};
