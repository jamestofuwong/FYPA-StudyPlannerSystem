import { randomUUID } from 'crypto';
import type { ScrapedStudent, ScrapedCourseListItem } from '../../shared/types/student';
import { getCompletedUnitCodes } from '../../shared/constants/grades';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../portal/portalSessionService';
import { selectEnrollment } from './workflows/enrollmentSelector';

// ---------------------------------------------------------------------------
// Dashboard handoff
//
// When a copilot answer is about one student, the answer's button opens the
// dashboard (or pathway) page already showing that student, with no second
// round trip to the portal at click time. This module builds the exact data the
// dashboard would have built itself, keeps it in memory for a short while, and
// hands it over by id.
//
// REQ-SEC-101: held in server memory only, never written to disk, and dropped
// after HANDOFF_TTL_MS.
// ---------------------------------------------------------------------------

export const HANDOFF_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 20;
const WAIT_TIMEOUT_MS = 60 * 1000;

export interface HandoffRequest {
  studentId: string;
  enrollMode: string;
  /** Planner to show selected; defaults to the best match. */
  plannerId?: string;
}

export interface DashboardHandoff {
  studentId: string;
  enrollMode: string;
  dbId: number;
  studentName: string | null;
  enrollments: { EnrollId: number; EnrollmentDesc: string }[];
  student: ScrapedStudent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dashboardData: any;
  /** The planner the answer was about, if any, so a page already showing this student can switch to it. */
  requestedPlannerId?: string;
  /** Index into dashboardData.planners; -1 means `manualPlanner` is active. */
  selectedPlannerIdx: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manualPlanner: any | null;
}

type Entry = {
  key: string;
  createdAt: number;
  promise: Promise<DashboardHandoff>;
};

declare global {
  var __copilotHandoffs: Map<string, Entry> | undefined;
}

// Anchored on globalThis so it survives Next.js dev reloads, like the portal store.
const entries: Map<string, Entry> = (globalThis.__copilotHandoffs ??= new Map());

function requestKey(req: HandoffRequest): string {
  return [req.studentId.trim().toUpperCase(), req.enrollMode, req.plannerId ?? ''].join('|');
}

function pruneExpired(now = Date.now()) {
  for (const [id, entry] of entries) {
    if (now - entry.createdAt > HANDOFF_TTL_MS) entries.delete(id);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * Starts preparing a student's dashboard data and returns the id to open it
 * with straight away; the data arrives in the background. Asking again for the
 * same student, mode and planner reuses the entry.
 */
export function requestDashboardHandoff(req: HandoffRequest): string {
  pruneExpired();
  const key = requestKey(req);
  for (const [id, entry] of entries) {
    if (entry.key === key) return id;
  }

  const id = randomUUID();
  const promise = buildDashboardHandoff(req);
  entries.set(id, { key, createdAt: Date.now(), promise });
  // A failed build must not stay cached, or asking again could never succeed.
  // Whoever opens the link in the meantime gets the error, then falls back to a
  // normal search on the dashboard.
  promise.catch((err) => {
    console.warn('[Copilot] Dashboard handoff failed:', err instanceof Error ? err.message : err);
    if (entries.get(id)?.promise === promise) entries.delete(id);
  });
  return id;
}

/**
 * Waits for a prepared handoff. Returns null if the id is unknown or expired;
 * throws if preparing it failed or took too long.
 */
export async function getDashboardHandoff(id: string): Promise<DashboardHandoff | null> {
  pruneExpired();
  const entry = entries.get(id);
  if (!entry) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      entry.promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Preparing the student took too long.')), WAIT_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    entries.delete(id);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test hook. */
export function clearDashboardHandoffs() {
  entries.clear();
}

// ---------------------------------------------------------------------------
// Building the data
// ---------------------------------------------------------------------------

/**
 * Mirrors the client-side steps in the dashboard page (portal fetch, MPU merge,
 * /api/match, top three planners) so that what arrives equals what a search on
 * the dashboard would have produced.
 */
export async function buildDashboardHandoff(req: HandoffRequest): Promise<DashboardHandoff> {
  const studentId = req.studentId.trim();
  const mode = req.enrollMode || 'latest';

  const matches = searchStudents(studentId);
  const found = matches.find((s) => s.student_id === studentId) ?? matches[0] ?? null;
  if (!found) {
    throw new Error(`Student "${studentId}" not found. Make sure the portal is logged in and the student list is loaded.`);
  }

  const enrollments = await fetchEnrollments(found.db_id);
  if (!enrollments.length) throw new Error(`No enrollments found for student ${studentId}.`);

  const selected = selectEnrollment(enrollments, mode);
  if (!selected) throw new Error(`No ${mode} enrollment found for student ${studentId}.`);

  const audit = await fetchDegreeAudit(found.db_id, selected.EnrollId, studentId);

  // Latest and earliest also merge the MPU enrollment's courses, as the dashboard does.
  let mpuCourseList: ScrapedCourseListItem[] = [];
  if (mode !== 'mpu') {
    const mpu = selectEnrollment(enrollments, 'mpu');
    if (mpu && mpu.EnrollId !== selected.EnrollId) {
      mpuCourseList = (await fetchDegreeAudit(found.db_id, mpu.EnrollId, studentId)).courseList;
    }
  }

  const student: ScrapedStudent = {
    ...audit,
    studentName: audit.studentName || found.name || undefined,
    enrollmentOptions: enrollments.map((e) => ({ text: e.EnrollmentDesc })),
    selectedEnrollment: selected.EnrollmentDesc,
  };

  const completedUnits = getCompletedUnitCodes([...student.courseList, ...mpuCourseList]);

  // enrollmentDate is DD/MM/YYYY, so the second segment is the month
  const enrollStr = student.enrollmentDate ?? '';
  const yearMatch = enrollStr.match(/\b(20\d{2})\b/);
  const intakeYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  const monthMatch = enrollStr.match(/^\d{1,2}\/(\d{1,2})\//);
  const intakeMonth = monthMatch ? parseInt(monthMatch[1], 10) : 1;
  const intakeSemester: 1 | 2 = intakeMonth >= 7 ? 2 : 1;

  const { runDashboardMatch } = await import('../matching/dashboardMatch');
  const plannerRepository = await import('../../db/repositories/plannerRepository');

  const match = await runDashboardMatch({
    studentID: studentId,
    courseCode: student.course,
    intakeYear,
    intakeSemester,
    completedUnitCodes: completedUnits,
    hasWIL: false,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ranked: any[] = (match.data as any).rankedPlanners.slice(0, 3);
  if (ranked.length === 0) throw new Error('No matching planner found for this student.');

  const planners = await Promise.all(ranked.map((r) => plannerRepository.getPlannerById(r.plannerID)));
  if (planners.some((p) => !p)) throw new Error('A matched planner could not be loaded.');

  let selectedPlannerIdx = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let manualPlanner: any | null = null;
  if (req.plannerId) {
    const idx = ranked.findIndex((r) => r.plannerID === req.plannerId);
    if (idx >= 0) {
      selectedPlannerIdx = idx;
    } else {
      // Not among the top three: show it as the manually chosen planner.
      const extra = await plannerRepository.getPlannerById(req.plannerId);
      if (extra) {
        manualPlanner = extra;
        selectedPlannerIdx = -1;
      }
    }
  }

  return {
    studentId,
    enrollMode: mode,
    dbId: found.db_id,
    studentName: student.studentName ?? null,
    enrollments,
    student,
    dashboardData: {
      match: match.data,
      planners,
      completedCodes: completedUnits,
      intakeYear,
      student,
      studentId,
      enrollmentMode: mode,
      mpuCourseList,
    },
    requestedPlannerId: req.plannerId,
    selectedPlannerIdx,
    manualPlanner,
  };
}
