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
  description: 'Lists the planners of ONE intake year. Use this when the user names a year and asks which planners, programs or majors exist for it. It needs a year: not for all planners.',
  keywords: ['intake', 'intake year', 'cohort', 'started in', 'batch', 'year of entry', 'for 2025'],
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
