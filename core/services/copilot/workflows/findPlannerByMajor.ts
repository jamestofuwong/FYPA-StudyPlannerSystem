import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  majorName: string;
  intakeYear?: number;
}

interface PlannerMatch {
  id: string;
  majorName: string;
  course: string;
  courseType: string;
  intakeYear: number;
  intakeMonth: number | null;
  unitCount: number;
}

interface Output {
  query: string;
  totalFound: number;
  planners: PlannerMatch[];
}

export const findPlannerByMajorWorkflow: Workflow<Input, Output> = {
  id: 'find_planner_by_major',
  description: 'Searches for study planners by major or course name. Returns matching planner IDs and intake years. Use this when the user asks what planner exists for a specific major or program, or wants to find a planner ID before running get_planner_details.',
  params: [
    {
      name: 'majorName',
      type: 'string',
      description: 'The major or program name to search for (e.g. "Software Engineering", "Computer Science")',
      required: true,
    },
    {
      name: 'intakeYear',
      type: 'number',
      description: 'Filter by a specific intake year (e.g. 2023). Optional.',
      required: false,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const all = await plannerRepository.getAllPlanners();

      const query = params.majorName.toLowerCase().trim();

      let matches = all.filter((p) => {
        const majorMatch = (p.major?.name ?? '').toLowerCase().includes(query);
        const courseMatch = (p.course?.name ?? '').toLowerCase().includes(query);
        return majorMatch || courseMatch;
      });

      if (params.intakeYear) {
        matches = matches.filter((p) => p.intake_year === params.intakeYear);
      }

      return {
        ok: true,
        data: {
          query: params.majorName,
          totalFound: matches.length,
          planners: matches.map((p) => ({
            id: p.id,
            majorName: p.major?.name ?? 'Unknown',
            course: p.course?.name ?? 'Unknown',
            courseType: p.course_type ?? 'degree',
            intakeYear: p.intake_year,
            intakeMonth: p.intake_month ?? null,
            unitCount: p._count?.units ?? 0,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to search planners.' };
    }
  },
};
