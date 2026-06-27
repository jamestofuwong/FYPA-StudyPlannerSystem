export type CohortStudentStatus = 'pending' | 'processing' | 'done' | 'error';
export type CohortSessionStatus = 'idle' | 'processing' | 'complete' | 'error';

export interface CohortStudentResult {
  studentId: string;
  studentName?: string;
  status: CohortStudentStatus;
  matchResult?: {
    detectedMajor: string | null;
    majorName?: string | null;
    matchPct: number;
    atRiskLevel: string;
    graduationEligible: boolean;
    missingCoreCount: number;
    status: string;
  };
  error?: string;
}

export interface CohortSession {
  id: string;
  createdAt: Date;
  mode: 'excel' | 'sequential';
  totalCount: number;
  processedCount: number;
  results: CohortStudentResult[];
  status: CohortSessionStatus;
}

// Module-level singleton — shared across all API route invocations in the same
// Node.js process. One active cohort session at a time.
let activeSession: CohortSession | null = null;

export function getActiveSession(): CohortSession | null {
  return activeSession;
}

export function clearSession(): void {
  activeSession = null;
}

export function createSession(
  mode: 'excel' | 'sequential',
  totalCount: number,
): CohortSession {
  const session: CohortSession = {
    id: crypto.randomUUID(),
    createdAt: new Date(),
    mode,
    totalCount,
    processedCount: 0,
    results: [],
    status: 'idle',
  };
  activeSession = session;
  return session;
}

export function updateStudentResult(
  studentId: string,
  update: Partial<CohortStudentResult>,
): void {
  if (!activeSession) return;
  const idx = activeSession.results.findIndex((r) => r.studentId === studentId);
  if (idx >= 0) {
    activeSession.results[idx] = { ...activeSession.results[idx], ...update };
  }
  activeSession.processedCount = activeSession.results.filter(
    (r) => r.status === 'done' || r.status === 'error',
  ).length;
  if (activeSession.processedCount >= activeSession.totalCount) {
    activeSession.status = 'complete';
  }
}
