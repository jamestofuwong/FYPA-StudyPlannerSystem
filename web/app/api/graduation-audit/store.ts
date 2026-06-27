import type { ScrapedStudent } from '../../../../core/shared/types/student';

export interface AuditSession {
  sessionId: string;
  auditRef: string;
  createdAt: Date;
  student: ScrapedStudent;
  matchResult: any;
  generatedBy?: string;
}

const auditSessions = new Map<string, AuditSession>();

export function generateAuditRef(studentId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AUDIT-${date}-${studentId}-${random}`;
}

export function createAuditSession(
  data: Omit<AuditSession, 'sessionId' | 'auditRef' | 'createdAt'>,
): AuditSession {
  const sessionId = crypto.randomUUID();
  const auditRef = generateAuditRef(data.student.studentId ?? 'UNKNOWN');
  const session: AuditSession = {
    sessionId,
    auditRef,
    createdAt: new Date(),
    ...data,
  };
  auditSessions.set(sessionId, session);
  return session;
}

export function getAuditSession(sessionId: string): AuditSession | undefined {
  return auditSessions.get(sessionId);
}

export function clearAuditSession(sessionId: string): void {
  auditSessions.delete(sessionId);
}
