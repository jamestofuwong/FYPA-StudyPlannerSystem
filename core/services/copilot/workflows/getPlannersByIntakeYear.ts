import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  intakeYear: number;
}

interface PlannerSummary {
  id: string;
  majorName: string;
  course: string;
  courseType: string;
  intakeMonth: number | null;
  unitCount: number;
}

interface Output {
  intakeYear: number;
  totalFound: number;
  planners: PlannerSummary[];
}

export const getPlannersByIntakeYearWorkflow: Workflow<Input, Output> = {
  id: 'get_planners_by_intake_year',
  description: 'Lists all study planners available for a specific intake year. Use this when the user asks what programs or majors are available for a given year, or how many planners exist for a particular intake.',
  params: [
    {
      name: 'intakeYear',
      type: 'number',
      description: 'The intake year to filter by (e.g. 2023)',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const all = await plannerRepository.getAllPlanners();

      const year = Number(params.intakeYear);
      const matched = all.filter((p) => p.intake_year === year);

      return {
        ok: true,
        data: {
          intakeYear: year,
          totalFound: matched.length,
          planners: matched.map((p) => ({
            id: p.id,
            majorName: p.major?.name ?? 'Unknown',
            course: p.course?.name ?? 'Unknown',
            courseType: p.course_type ?? 'degree',
            intakeMonth: p.intake_month ?? null,
            unitCount: p._count?.units ?? 0,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch planners.' };
    }
  },
};
