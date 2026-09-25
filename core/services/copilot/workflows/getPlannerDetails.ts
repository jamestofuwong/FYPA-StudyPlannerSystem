import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  plannerId: string;
}

interface PlannerUnit {
  code: string;
  name: string;
  yearLevel: number | null;
  semester: number | null;
  category: string;
  offeredIn: number[];
}

interface Output {
  plannerId: string;
  plannerName: string;
  course: string;
  courseType: string;
  intakeYear: number;
  intakeMonth: number | null;
  durationSemesters: number;
  totalUnits: number;
  units: PlannerUnit[];
}

export const getPlannerDetailsWorkflow: Workflow<Input, Output> = {
  id: 'get_planner_details',
  description: 'Returns the full structure of a specific study planner: course, major, intake year, and all required units grouped by year and semester. Use this when the user wants to know what units are in a specific plan or program.',
  params: [
    {
      name: 'plannerId',
      type: 'string',
      description: 'The UUID of the planner template. Use list_planners or find_planner_by_major to get the ID.',
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

      const units: PlannerUnit[] = planner.units.map((tu) => ({
        code: tu.unit?.unit_code ?? '',
        name: tu.unit?.unit_name ?? '',
        yearLevel: tu.year_level ?? null,
        semester: tu.semester ?? null,
        category: tu.category ?? 'core',
        offeredIn: (tu.unit?.offerings ?? []).map((o) => o.offered_in).sort((a, b) => a - b),
      }));

      // Sort by year then semester for readability
      units.sort((a, b) => (a.yearLevel ?? 0) - (b.yearLevel ?? 0) || (a.semester ?? 0) - (b.semester ?? 0));

      return {
        ok: true,
        data: {
          plannerId: planner.id,
          plannerName: `${planner.major?.name ?? 'Unknown'} (${planner.intake_year})`,
          course: planner.course?.name ?? 'Unknown',
          courseType: planner.course_type ?? 'degree',
          intakeYear: planner.intake_year,
          intakeMonth: planner.intake_month ?? null,
          durationSemesters: planner.duration_semesters ?? 0,
          totalUnits: units.length,
          units,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch planner details.' };
    }
  },
};
