import type { AgentSessionStore } from '../../../../core/services/agent/types';

const agentStore: AgentSessionStore = {
  history: [],
  lastStudent: null,
  lastMatchResult: null,
  pendingExport: null,
  loadedStudentId: undefined,
};

export function getAgentStore(): AgentSessionStore { return agentStore; }

export function resetAgentSession(): void {
  agentStore.history = [];
  agentStore.lastStudent = null;
  agentStore.lastMatchResult = null;
  agentStore.pendingExport = null;
  agentStore.loadedStudentId = undefined;
}
