export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[]; items?: Record<string, unknown> }>;
      required?: string[];
    };
  };
}

export interface AgentContext {
  currentDate: string;
  loadedStudentId?: string;
}

export interface AgentSessionStore {
  history: AgentMessage[];
  lastStudent: any | null;    // ScrapedStudent
  lastMatchResult: any | null; // DisplayPayload
  pendingExport: any | null;
  loadedStudentId?: string;
}
