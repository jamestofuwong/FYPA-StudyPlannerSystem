import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  plannerId1: string;
  plannerId2: string;
}

interface UnitSummary {
  code: string;
  name: string;
}

interface Output {
  planner1Name: string;
  planner2Name: string;
  sharedCount: number;
  onlyInPlanner1Count: number;
  onlyInPlanner2Count: number;
  shared: UnitSummary[];
  onlyInPlanner1: UnitSummary[];
  onlyInPlanner2: UnitSummary[];
}

export const compareTwoPlannersWorkflow: Workflow<Input, Output> = {
  id: 'compare_two_planners',
  description: 'Compares two study planners and shows which units are shared between them and which are unique to each. Use this when the user wants to know the difference between two majors or programs, or how similar two plans are.',
  params: [
    {
      name: 'plannerId1',
      type: 'string',
      description: 'The UUID of the first planner. Use list_planners or find_planner_by_major to get IDs.',
      required: true,
    },
    {
      name: 'plannerId2',
      type: 'string',
      description: 'The UUID of the second planner.',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const [p1, p2] = await Promise.all([
        plannerRepository.getPlannerById(params.plannerId1),
        plannerRepository.getPlannerById(params.plannerId2),
      ]);

      if (!p1) return { ok: false, error: `Planner "${params.plannerId1}" not found. Use list_planners to see available planners.` };
      if (!p2) return { ok: false, error: `Planner "${params.plannerId2}" not found. Use list_planners to see available planners.` };

      // Build code → name maps for each planner (template units only, not elective pool)
      const buildUnitMap = (planner: typeof p1) => {
        const map = new Map<string, string>();
        for (const tu of planner!.units) {
          if (!tu.unit) continue;
          map.set(tu.unit.unit_code.toUpperCase(), tu.unit.unit_name);
        }
        return map;
      };

      const map1 = buildUnitMap(p1);
      const map2 = buildUnitMap(p2);

      const shared: UnitSummary[] = [];
      const onlyIn1: UnitSummary[] = [];
      const onlyIn2: UnitSummary[] = [];

      for (const [code, name] of map1) {
        if (map2.has(code)) {
          shared.push({ code, name });
        } else {
          onlyIn1.push({ code, name });
        }
      }
      for (const [code, name] of map2) {
        if (!map1.has(code)) {
          onlyIn2.push({ code, name });
        }
      }

      const p1Name = `${p1.major?.name ?? 'Unknown'} (${p1.course_type}, ${p1.intake_year})`;
      const p2Name = `${p2.major?.name ?? 'Unknown'} (${p2.course_type}, ${p2.intake_year})`;

      return {
        ok: true,
        data: {
          planner1Name: p1Name,
          planner2Name: p2Name,
          sharedCount: shared.length,
          onlyInPlanner1Count: onlyIn1.length,
          onlyInPlanner2Count: onlyIn2.length,
          shared,
          onlyInPlanner1: onlyIn1,
          onlyInPlanner2: onlyIn2,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to compare planners.' };
    }
  },
};
