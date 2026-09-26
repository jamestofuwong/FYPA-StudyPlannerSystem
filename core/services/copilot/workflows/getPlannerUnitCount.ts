import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  plannerId: string;
}

interface Output {
  plannerId: string;
  plannerName: string;
  unitCount: number;
  byCategory: Record<string, number>;
}

export const getPlannerUnitCountWorkflow: Workflow<Input, Output> = {
  id: 'get_planner_unit_count',
  description: 'Returns the total number of units in a specific study planner, broken down by category (core, major_core, elective, etc.). Use this when the user asks how many units are in a plan or how many core/elective units a program has.',
  params: [
    {
      name: 'plannerId',
      type: 'string',
      description: 'The UUID of the planner. Use list_planners or find_planner_by_major to get IDs.',
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

      const byCategory: Record<string, number> = {};
      for (const tu of planner.units) {
        const cat = tu.category ?? 'core';
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      }

      const plannerName = `${planner.major?.name ?? 'Unknown'} — ${planner.course?.name ?? 'Unknown'} (${planner.course_type}, ${planner.intake_year})`;

      return {
        ok: true,
        data: {
          plannerId: params.plannerId,
          plannerName,
          unitCount: planner.units.length,
          byCategory,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch planner unit count.' };
    }
  },
};
