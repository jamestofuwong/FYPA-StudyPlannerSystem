import type { ScrapedStudent } from '../../shared/types/student';

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

export interface ParamSchema {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

export interface WorkflowContext {
  currentStudent: ScrapedStudent | null;
  scraperStatus: string;
  ollamaStatus: { ollama: string; model: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Workflow<TInput = Record<string, any>, TOutput = unknown> {
  id: string;
  description: string;
  params: ParamSchema[];
  execute: (params: TInput, ctx: WorkflowContext) => Promise<WorkflowResult<TOutput>>;
}
