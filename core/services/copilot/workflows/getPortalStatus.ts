import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Output {
  scraperStatus: string;
  studentLoaded: boolean;
  studentName: string | null;
  ollamaAvailable: boolean;
  copilotModelReady: boolean;
}

export const getPortalStatusWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'get_portal_status',
  description: 'Checks the current status of the student data scraper and the AI (Ollama) service. Use this when the user asks if the system is ready, if data is loaded, or what the current status is.',
  params: [],
  async execute(_params: Record<string, never>, ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    return {
      ok: true,
      data: {
        scraperStatus: ctx.scraperStatus,
        studentLoaded: ctx.currentStudent !== null,
        studentName: ctx.currentStudent?.studentName ?? null,
        ollamaAvailable: ctx.ollamaStatus.ollama === 'available',
        copilotModelReady: ctx.ollamaStatus.model === 'ready',
      },
    };
  },
};
