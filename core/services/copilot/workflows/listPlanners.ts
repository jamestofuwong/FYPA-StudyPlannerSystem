import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Output {
  total: number;
  planners: { id: string; majorName: string; courseType: string; intakeYear: number }[];
}

export const listPlannersWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'list_planners',
  description: 'Lists EVERY study planner in the system, with no filter. Use this when the user asks which planners, majors, programs or study plans exist or are available. Not for one intake year and not for one major.',
  keywords: ['all planners', 'every planner', 'all majors', 'all programs', 'study plans', 'what do we offer', 'available planners', 'what exists'],
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
