// ---------------------------------------------------------------------------
// portalSessionService — central service for the CampusNexus portal pipeline
//
// Owns all portal session state (singleton via globalThis so it survives
// Next.js HMR module reloads in dev, no-op in production Electron).
//
// Exposes:
//   loginAuto / loginManualStep1 / loginAdvanceStep — authentication flow
//   logout                                          — clear session
//   getStatus                                       — polling snapshot
//   getStudents / searchStudents                    — cached student list
//   fetchEnrollments / fetchDegreeAudit             — portal data APIs
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { ScrapedStudent, ScrapedCourseListItem } from '../../shared/types/student';
import { captureLoginSession } from './captureLoginSession';
import {
  step1_launch,
  step2_navigateDegree1,
  step3_loadExtension,
  step4_collect,
  resetManualSession,
  STEP_LABELS,
  type ManualStep,
} from './manualLoginSession';
import { portalFetch, PortalAuthError, type PortalCredentials } from './portalFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';

export type PortalStudent = {
  Id: number;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  StudentNumber: string;
};

type PortalSessionState = {
  sessionStatus: SessionStatus;
  cookies: string | null;
  portalToken: string | null;
  sessionError: string | null;
  manualMode: boolean;
  manualStep: 0 | 1 | 2 | 3 | 4;
  manualStepError: string | null;
};

type PortalStore = {
  students: PortalStudent[];
};

// ─── Portal API response shapes ───────────────────────────────────────────────

type StudentListResponse = {
  DataList: [{ value: PortalStudent[] }];
};

type EnrollmentResponse = {
  DataList: { EnrollId: number; EnrollmentDesc: string }[];
};

type PortalCourseRecord = {
  CourseCode: string;
  CourseDescription: string;
  Units: number;
  UnitEarned: number;
  CourseStatus: string;
  CourseLetterGrade: string;
  TermCode: string;
};

type PortalAuditRecord = {
  Description: string;
  CurrentEnrollmetStatus: string;        // portal typo: missing 'n'
  OverallEnrollmentCumGPA: number;
  OverallEnrollmentunitRequired: number;
  OverallEnrollmentunitEarned: number;
  ScheduledCredits: number;
  GradeLevel: string;
  AreasOfStudies: string;
  EnrollmeDate: string;                  // portal typo: missing 'nt'
  OriginalGraduateDate: string;
  CourseTakenInfoMessageList: PortalCourseRecord[];
};

type DegreeAuditResponse = {
  DataList: PortalAuditRecord[];
  ErrorMessage: string | null;
};

// ─── Global singletons ────────────────────────────────────────────────────────
// Anchored on globalThis to survive Next.js HMR module reloads in dev mode.

declare global {
  // eslint-disable-next-line no-var
  var __portalSessionStore: PortalSessionState | undefined;
  // eslint-disable-next-line no-var
  var __portalStore: PortalStore | undefined;
}

if (!globalThis.__portalSessionStore) {
  globalThis.__portalSessionStore = {
    sessionStatus: 'idle',
    cookies: null,
    portalToken: null,
    sessionError: null,
    manualMode: false,
    manualStep: 0,
    manualStepError: null,
  };
}

if (!globalThis.__portalStore) {
  globalThis.__portalStore = { students: [] };
}

const session = globalThis.__portalSessionStore;
const store   = globalThis.__portalStore;

// ─── Session file persistence ─────────────────────────────────────────────────

function getSessionFilePath(): string | null {
  const dir = process.env.APP_DATA_DIR;
  if (!dir) return null;
  return path.join(dir, 'portal-session.json');
}

function loadSession(): boolean {
  const filePath = getSessionFilePath();
  if (!filePath) return false;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as { cookies?: string; portalToken?: string };
    if (data.cookies && data.portalToken) {
      session.cookies = data.cookies;
      session.portalToken = data.portalToken;
      session.sessionStatus = 'logged-in';
      return true;
    }
  } catch {
    // No file or corrupt — start idle
  }
  return false;
}

function saveSession(): void {
  const filePath = getSessionFilePath();
  if (!filePath) return;
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ cookies: session.cookies, portalToken: session.portalToken }),
      'utf-8',
    );
  } catch {
    // Non-fatal — session just won't persist across restarts
  }
}

function clearSession(): void {
  const filePath = getSessionFilePath();
  if (filePath) {
    try { fs.unlinkSync(filePath); } catch { /* already gone */ }
  }
  session.cookies = null;
  session.portalToken = null;
  session.sessionStatus = 'idle';
  session.sessionError = null;
  session.manualMode = false;
  session.manualStep = 0;
  session.manualStepError = null;
  store.students = [];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchAndStoreStudents(creds: PortalCredentials): Promise<void> {
  const query = encodeURIComponent(
    'Students?$select=Id,FirstName,MiddleName,LastName,StudentNumber&$filter=IsActive+eq+true',
  );
  const data = await portalFetch<StudentListResponse>(
    `/WebServices/api/HelperService/GetODataWrapper?query=${query}`,
    creds,
  );
  store.students = data.DataList?.[0]?.value ?? [];
}

function mapToScrapedStudent(audit: PortalAuditRecord, studentNumber: string): ScrapedStudent {
  const courseList: ScrapedCourseListItem[] = (audit.CourseTakenInfoMessageList ?? []).map(c => ({
    courseId:      c.CourseCode,
    courseTitle:   c.CourseDescription,
    level:         '',
    credits:       c.Units,
    creditsEarned: c.UnitEarned,
    status:        c.CourseStatus,
    grade:         c.CourseLetterGrade,
    term:          c.TermCode,
  }));

  return {
    studentId:        studentNumber,
    course:           audit.Description ?? '',
    status:           audit.CurrentEnrollmetStatus ?? '',
    cgpa:             audit.OverallEnrollmentCumGPA ?? 0,
    creditsRequired:  audit.OverallEnrollmentunitRequired ?? 0,
    creditsCompleted: audit.OverallEnrollmentunitEarned ?? 0,
    scheduledCredits: audit.ScheduledCredits ?? 0,
    gradeLevel:       audit.GradeLevel ?? '',
    enrollmentDate:   audit.EnrollmeDate ?? '',
    graduationDate:   audit.OriginalGraduateDate ?? null,
    areasOfStudy:     audit.AreasOfStudies ? [audit.AreasOfStudies] : undefined,
    courseList,
  };
}

function requireAuth(): PortalCredentials {
  if (session.sessionStatus !== 'logged-in' || !session.cookies || !session.portalToken) {
    throw new Error('Not logged in to portal');
  }
  return { cookies: session.cookies, portalToken: session.portalToken };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts the full auto login pipeline (fire-and-forget).
 * Updates session state internally; callers poll getStatus() for completion.
 */
export function loginAuto(opts: { keepOpen?: boolean; onLog?: (msg: string) => void } = {}): void {
  const { keepOpen = false, onLog = (m: string) => console.log('[Portal login]', m) } = opts;

  session.sessionStatus = 'login-pending';
  session.sessionError = null;
  session.manualMode = false;
  session.manualStep = 0;
  session.manualStepError = null;

  void (async () => {
    try {
      const { cookieHeader, portalToken } = await captureLoginSession(onLog, keepOpen);
      session.cookies = cookieHeader;
      session.portalToken = portalToken;
      session.sessionStatus = 'logged-in';
      session.sessionError = null;
      saveSession();
      await fetchAndStoreStudents({ cookies: cookieHeader, portalToken });
      console.log(`[Portal] Student list loaded: ${store.students.length} students`);
    } catch (err) {
      console.error('[Portal login] Failed:', err);
      session.sessionStatus = 'login-error';
      session.sessionError = err instanceof Error ? err.message : 'Login failed';
    }
  })();
}

/**
 * Launches the browser for manual step-through login (fire-and-forget, step 1 only).
 * Subsequent steps are advanced via loginAdvanceStep().
 */
export function loginManualStep1(onLog?: (msg: string) => void): void {
  const log = onLog ?? ((m: string) => console.log('[Portal login step 1]', m));

  session.sessionStatus = 'login-pending';
  session.sessionError = null;
  session.manualMode = true;
  session.manualStep = 0;
  session.manualStepError = null;

  void (async () => {
    try {
      await step1_launch(log);
      session.manualStep = 1;
    } catch (err) {
      session.sessionStatus = 'login-error';
      session.sessionError = err instanceof Error ? err.message : 'Step 1 failed';
      session.manualStep = 0;
    }
  })();
}

/**
 * Advances the manual login pipeline. Awaited by the caller — resolves when the
 * step completes or rejects with the step error.
 */
export async function loginAdvanceStep(
  step: 2 | 3 | 4,
  keepOpen = false,
  onLog?: (msg: string) => void,
): Promise<{ label: string }> {
  const log = onLog ?? ((m: string) => console.log(`[ManualLogin step ${step}]`, m));

  try {
    if (step === 2) {
      await step2_navigateDegree1(log);
      session.manualStep = 2;
      session.manualStepError = null;
    } else if (step === 3) {
      await step3_loadExtension(log);
      session.manualStep = 3;
      session.manualStepError = null;
    } else {
      const { cookieHeader, portalToken } = await step4_collect(keepOpen, log);
      session.cookies = cookieHeader;
      session.portalToken = portalToken;
      session.sessionStatus = 'logged-in';
      session.sessionError = null;
      session.manualStep = 4;
      session.manualStepError = null;
      session.manualMode = false;
      saveSession();
      fetchAndStoreStudents({ cookies: cookieHeader, portalToken })
        .then(() => console.log(`[Portal] Student list loaded: ${store.students.length}`))
        .catch((err) => console.error('[Portal] Student list fetch failed:', err));
    }
    return { label: STEP_LABELS[step as ManualStep] };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Step ${step} failed`;
    session.manualStepError = message;
    if (step <= 2) {
      session.sessionStatus = 'login-error';
      session.sessionError = message;
      await resetManualSession().catch(() => {});
    }
    throw err;
  }
}

/** Clears the portal session (in-memory + persisted file). */
export function logout(): void {
  clearSession();
}

/** Returns the current session and manual-step snapshot for status polling. */
export function getStatus() {
  return {
    sessionStatus:   session.sessionStatus,
    sessionError:    session.sessionError,
    studentCount:    store.students.length,
    manualMode:      session.manualMode,
    manualStep:      session.manualStep,
    manualStepError: session.manualStepError,
  };
}

/** Returns all cached students in the frontend-friendly format. */
export function getStudents(): { student_id: string; name: string; db_id: number }[] {
  return store.students.map(s => ({
    student_id: s.StudentNumber ?? '',
    name: [s.FirstName, s.MiddleName, s.LastName].filter(Boolean).join(' '),
    db_id: s.Id,
  }));
}

/** Searches cached students by name or student number (case-insensitive, max 10 results). */
export function searchStudents(q: string): { student_id: string; name: string; db_id: number }[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return store.students
    .filter(s => {
      const fullName = [s.FirstName, s.MiddleName, s.LastName].filter(Boolean).join(' ').toLowerCase();
      const studentNum = (s.StudentNumber ?? '').toLowerCase();
      return fullName.includes(query) || studentNum.includes(query);
    })
    .slice(0, 10)
    .map(s => ({
      student_id: s.StudentNumber ?? '',
      name: [s.FirstName, s.MiddleName, s.LastName].filter(Boolean).join(' '),
      db_id: s.Id,
    }));
}

/** Fetches the enrollment list for a student from the portal API. */
export async function fetchEnrollments(dbId: number): Promise<{ EnrollId: number; EnrollmentDesc: string }[]> {
  const creds = requireAuth();
  try {
    const data = await portalFetch<EnrollmentResponse>(
      `/WebServices/api/CourseRegistration/GetEnrollmentDetailsByStudentId?StudentId=${dbId}`,
      creds,
    );
    return data.DataList ?? [];
  } catch (err) {
    if (err instanceof PortalAuthError) clearSession();
    throw err;
  }
}

/** Fetches the degree audit for a student enrollment and maps it to ScrapedStudent. */
export async function fetchDegreeAudit(
  dbId: number,
  enrollID: number,
  studentNumber = '',
): Promise<ScrapedStudent> {
  const creds = requireAuth();
  try {
    const data = await portalFetch<DegreeAuditResponse>(
      `/WebServices/api/CourseRegistration/DegreeAudit?enrollID=${enrollID}&Studentid=${dbId}`,
      creds,
    );
    if (data.ErrorMessage) throw new Error(data.ErrorMessage);
    const auditRecord = data.DataList?.[0];
    if (!auditRecord) throw new Error('No audit data returned');
    return mapToScrapedStudent(auditRecord, studentNumber);
  } catch (err) {
    if (err instanceof PortalAuthError) clearSession();
    throw err;
  }
}

export { PortalAuthError };

// ─── Auto-load persisted session on module init ───────────────────────────────
loadSession();
