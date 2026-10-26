import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  unitCode: string;
}

interface PlannerMatch {
  id: string;
  majorName: string;
  course: string;
  courseType: string;
  intakeYear: number;
  category: string;
}

interface Output {
  unitCode: string;
  unitName: string | null;
  plannerCount: number;
  planners: PlannerMatch[];
}

export const getPlannersContainingUnitWorkflow: Workflow<Input, Output> = {
  id: 'get_planners_containing_unit',
  description: 'Finds ALL planners that include ONE named unit, and the category that the unit has in each (core, major core, elective). Use this when the user asks which programs or majors require, include or use a unit. Not for one named planner (use get_unit_category_in_planner).',
  keywords: ['which planners contain', 'which majors include', 'which programs require', 'used in', 'part of which', 'appears in', 'where is unit used'],
  params: [
    {
      name: 'unitCode',
      type: 'string',
      description: 'The unit code to search for (e.g. "COS30049")',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const all = await plannerRepository.getAllPlannersWithUnits();
      const targetCode = params.unitCode.trim().toUpperCase();

      const planners: PlannerMatch[] = [];
      let unitName: string | null = null;

      for (const p of all) {
        for (const tu of p.units) {
          if (!tu.unit) continue;
          if (tu.unit.unit_code.toUpperCase() === targetCode) {
            unitName = unitName ?? tu.unit.unit_name;
            planners.push({
              id: p.id,
              majorName: p.major?.name ?? 'Unknown',
              course: p.course?.name ?? 'Unknown',
              courseType: p.course_type ?? 'degree',
              intakeYear: p.intake_year,
              category: tu.category ?? 'core',
            });
            break; // one entry per planner
          }
        }
      }

      return {
        ok: true,
        data: {
          unitCode: params.unitCode,
          unitName,
          plannerCount: planners.length,
          planners,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to search planners.' };
    }
  },
};
