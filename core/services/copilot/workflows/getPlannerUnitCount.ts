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
  description: 'Counts the units in ONE planner by category (core, major core, elective, WIL). Use this when the user asks how many units, core units or electives a plan or program has. Not for the electives that a student can still choose (use get_student_elective_options).',
  keywords: ['how many units', 'count', 'number of units', 'core units', 'how many electives', 'total units'],
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
