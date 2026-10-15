export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RouteResult {
  canHandle: boolean;
  workflowId: string | null;
  params: Record<string, unknown>;
  missingParams: string[];
}

export type WorkflowResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Pages a copilot answer can point at. The web layer maps these to paths. */
export type LinkTarget = 'dashboard' | 'pathway' | 'planners' | 'units' | 'scraping';

/** A button shown under an answer, as sent to the browser. */
export interface CopilotLink {
  label: string;
  target: LinkTarget;
  /** Query parameters for the destination page, e.g. plannerId, q, handoff. */
  query?: Record<string, string>;
  /** Part of the destination to jump to, e.g. a dashboard tab. */
  section?: string;
}

/**
 * A link as a workflow describes it. `student` asks the chat route to prepare
 * that student's dashboard data before the click, so the page opens already
 * populated; the route then adds a `handoff` id to the query.
 */
export interface WorkflowLink extends CopilotLink {
  student?: { studentId: string; enrollMode: string; plannerId?: string };
}

export interface ParamSchema {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

// Only web-layer state that core services cannot import directly.
// Portal session state is read via portalSessionService directly inside workflows.
export interface WorkflowContext {
  ollamaStatus: { ollama: string; model: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Workflow<TInput = Record<string, any>, TOutput = unknown> {
  id: string;
  description: string;
  params: ParamSchema[];
  execute: (params: TInput, ctx: WorkflowContext) => Promise<WorkflowResult<TOutput>>;
}
