import type { ChatMessage, CopilotLink, PlannerRef, WorkflowContext } from '../../../../../core/services/copilot/types';
import { routeAndExtract } from '../../../../../core/services/copilot/copilotService';
import { streamResponse } from '../../../../../core/services/copilot/responseFormatter';
import { workflowRegistry, allWorkflows } from '../../../../../core/services/copilot/workflowRegistry';
import { linksForWorkflow } from '../../../../../core/services/copilot/workflowLinks';
import { requestDashboardHandoff } from '../../../../../core/services/copilot/handoff';
import { ollamaStore } from '../../ollama/store';
import { getStatus } from '../../../../../core/services/portal/portalSessionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANNOT_HANDLE =
  "Sorry, I'm not able to help with that. I can answer questions about the currently loaded student's major, graduation status, and completed units, check system status, and list available study planners.";

const READ_ONLY =
  "I can only look things up. I can't change grades, planners, units or any other data. Ask me what the data says and I'll check it.";

/** What to ask the advisor for. Advisors know planner names, not planner ids. */
const PARAM_QUESTIONS: Record<string, string> = {
  studentId: "the student's ID number",
  plannerId: 'which study planner (for example "Data Science 2025")',
  plannerId1: 'the first study planner (for example "Data Science")',
  plannerId2: 'the second study planner (for example "Cybersecurity")',
  newPlannerId: 'which study planner the student would move to (for example "Cybersecurity")',
  unitCode: 'the unit code (for example COS10009)',
  semester: 'which semester (1, 2, summer or winter)',
  intakeYear: 'which intake year (for example 2025)',
  majorName: 'the name of the major',
  prefix: 'the unit code prefix (for example COS)',
};
const askFor = (names: string[]) => names.map((n) => PARAM_QUESTIONS[n] ?? n).join(', and ');

/** The study planners, in the form that the name resolver needs. Loaded only when a question needs a planner. */
async function loadPlanners(): Promise<PlannerRef[]> {
  const plannerRepository = await import('../../../../../core/db/repositories/plannerRepository');
  const all = await plannerRepository.getAllPlanners();
  return all.map((p) => ({
    id: p.id,
    majorName: p.major?.name ?? null,
    courseName: p.course?.name ?? null,
    intakeYear: p.intake_year,
    intakeMonth: p.intake_month ?? null,
  }));
}

function validateParams(
  workflow: ReturnType<typeof workflowRegistry.get>,
  params: Record<string, unknown>
): string[] {
  if (!workflow) return [];
  return workflow.params
    .filter((p) => p.required && !(p.name in params))
    .map((p) => p.name);
}

function workflowLabel(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Buttons for an answer. A link about one student also starts preparing that
 * student's dashboard data in the background, so the page opens already
 * populated; the handoff id travels in the link's query.
 */
function buildLinks(workflowId: string, params: Record<string, unknown>, data: unknown): CopilotLink[] {
  return linksForWorkflow(workflowId, params, data).map(({ student, ...link }) => {
    if (!student) return link;
    try {
      const handoff = requestDashboardHandoff(student);
      return { ...link, query: { ...link.query, handoff } };
    } catch (err) {
      console.warn('[Copilot] Could not start a dashboard handoff:', err);
      return link;
    }
  });
}

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ type: 'reply', content: 'Invalid JSON body' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ type: 'reply', content: 'messages array is required' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  const ctx: WorkflowContext = {
    ollamaStatus: {
      ollama: ollamaStore.ollama,
      model: ollamaStore.model,
    },
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      }

      try {
        // ── Phase 1: Route & Extract ────────────────────────────────────────
        emit({ type: 'status', message: 'Thinking…' });

        // If the model is cold (not yet loaded in memory), the first Ollama
        // call can stall for several seconds. Emit a dedicated message after
        // 3 s so the user knows the app hasn't frozen.
        const coldStartTimer = setTimeout(
          () => emit({ type: 'status', message: 'Warming up AI model…' }),
          3000,
        );

        const routeStart = Date.now();
        let route;
        try {
          route = await routeAndExtract(messages, allWorkflows, { loadPlanners });
        } catch (err) {
          clearTimeout(coldStartTimer);
          console.error('[Copilot] routeAndExtract failed:', err);
          emit({ type: 'reply', content: 'The AI service is currently unavailable. Make sure Ollama is running and the model is ready.' });
          controller.close();
          return;
        }
        clearTimeout(coldStartTimer);
        emit({ type: 'routed', ms: Date.now() - routeStart });

        if (route.refusal === 'read_only') {
          emit({ type: 'reply', content: READ_ONLY });
          controller.close();
          return;
        }

        if (!route.canHandle) {
          emit({ type: 'reply', content: CANNOT_HANDLE });
          controller.close();
          return;
        }

        if (route.missingParams.length > 0) {
          emit({ type: 'reply', content: `To do that, I need a bit more information. Could you tell me ${askFor(route.missingParams)}?` });
          controller.close();
          return;
        }

        const workflow = workflowRegistry.get(route.workflowId!);
        if (!workflow) {
          emit({ type: 'reply', content: CANNOT_HANDLE });
          controller.close();
          return;
        }

        const stillMissing = validateParams(workflow, route.params);
        if (stillMissing.length > 0) {
          emit({ type: 'reply', content: `I need a bit more information to continue. Could you tell me ${askFor(stillMissing)}?` });
          controller.close();
          return;
        }

        for (const note of route.notes ?? []) emit({ type: 'status', message: note });

        // ── Portal session check ────────────────────────────────────────────
        // Workflows that include a studentId param require live portal data.
        const needsPortal = workflow.params.some((p) => p.name === 'studentId');
        if (needsPortal && getStatus().sessionStatus !== 'logged-in') {
          emit({ type: 'reply', content: 'This requires access to the student portal. Please log in to the portal first, then try again.' });
          controller.close();
          return;
        }

        // ── Phase 2: Execute Workflow ───────────────────────────────────────
        emit({ type: 'status', message: `Calling ${workflowLabel(route.workflowId!)}…` });

        const result = await workflow.execute(route.params, ctx);

        if (!result.ok) {
          console.warn(`[Copilot] Workflow "${route.workflowId}" returned error:`, result.error);
          emit({ type: 'reply', content: `I wasn't able to complete that. ${result.error}` });
          controller.close();
          return;
        }

        // Buttons come from the workflow that ran, so they are ready even if
        // writing the reply fails below.
        const links = buildLinks(route.workflowId!, route.params, result.data);

        // ── Phase 3: Stream Response ────────────────────────────────────────
        emit({ type: 'status', message: 'Generating response…' });

        try {
          let full = '';
          for await (const token of streamResponse(messages, workflow, result)) {
            full += token;
            emit({ type: 'token', content: token });
          }
          // Say which planner a name was taken to be, so a wrong guess is easy to see
          for (const note of route.notes ?? []) {
            const line = `\n\n_${note}_`;
            full += line;
            emit({ type: 'token', content: line });
          }
          emit({ type: 'reply', content: full, workflowId: route.workflowId, links });
        } catch (err) {
          console.error(`[Copilot] streamResponse failed for workflow "${route.workflowId}":`, err);
          emit({ type: 'reply', content: `Here is what I found:\n\`\`\`\n${JSON.stringify(result.data, null, 2)}\n\`\`\``, workflowId: route.workflowId, links });
        }
        controller.close();
      } catch (err) {
        console.error('[Copilot] Unhandled error in chat stream:', err);
        emit({ type: 'reply', content: 'An unexpected error occurred. Please try again.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
