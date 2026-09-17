import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { getStatus } from '../../portal/portalSessionService';

interface Output {
  sessionStatus: string;
  studentCount: number;
  ollamaAvailable: boolean;
  copilotModelReady: boolean;
}

export const getPortalStatusWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'get_portal_status',
  description: 'Checks the current status of the student portal session and the AI (Ollama) service. Use this when the user asks if the system is ready, if the portal is logged in, how many students are loaded, or what the current status is.',
  params: [],
  async execute(_params: Record<string, never>, ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    const portalStatus = getStatus();
    return {
      ok: true,
      data: {
        sessionStatus: portalStatus.sessionStatus,
        studentCount: portalStatus.studentCount,
        ollamaAvailable: ctx.ollamaStatus.ollama === 'available',
        copilotModelReady: ctx.ollamaStatus.model === 'ready',
      },
    };
  },
};
