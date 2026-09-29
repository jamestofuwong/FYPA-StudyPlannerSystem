import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Output {
  total: number;
  planners: { id: string; majorName: string; courseType: string; intakeYear: number }[];
}

export const listPlannersWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'list_planners',
  description: 'Lists all study planner templates stored in the system. Use this when the user asks what planners, majors, or programs are available.',
  params: [],
  async execute(_params: Record<string, never>, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const planners = await plannerRepository.getAllPlanners();
      return {
        ok: true,
        data: {
          total: planners.length,
          planners: planners.map((p) => ({
            id: p.id,
            majorName: p.major?.name ?? 'Unknown',
            courseType: p.course_type ?? 'degree',
            intakeYear: p.intake_year,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch planners.' };
    }
  },
};
