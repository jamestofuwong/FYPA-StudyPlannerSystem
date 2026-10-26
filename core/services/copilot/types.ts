export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RouteResult {
  canHandle: boolean;
  workflowId: string | null;
  params: Record<string, unknown>;
  missingParams: string[];
  /** Set when the advisor asked to change data. The copilot only reads, so no workflow is chosen. */
  refusal?: 'read_only';
  /** Things the advisor should know about how their words were understood, e.g. which planner a name stands for. */
  notes?: string[];
}

/** A study planner as the name resolver sees it. */
export interface PlannerRef {
  id: string;
  majorName: string | null;
  courseName: string | null;
  intakeYear: number;
  intakeMonth: number | null;
}

export interface RouteOptions {
  /**
   * Loads the study planners, so that "the Data Science planner" can be turned into a planner id. It is called only when the
   * chosen workflow needs a planner and the message has no planner id.
   */
  loadPlanners?: () => Promise<PlannerRef[]>;
  /** The date that "this semester" refers to. Defaults to now. */
  now?: Date;
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
  /**
   * Everyday words that an advisor uses for this workflow but that the description does not contain ("transcript", "intern").
   * The keyword filter reads them like the description. The model does not see them.
   */
  keywords?: string[];
  params: ParamSchema[];
  execute: (params: TInput, ctx: WorkflowContext) => Promise<WorkflowResult<TOutput>>;
}
