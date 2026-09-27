// ============================================================
// A stand-in portal that needs no login, so the whole scrape flow can be exercised without portal access.
//
// It answers the same four questions the live portal does, so the SSE route, the per-student loop, the
// enrolment selection, the progress stream, cancellation and the record builder all run unchanged. The
// only thing it cannot reproduce is portal-specific failure: session expiry, auth errors mid-run,
// malformed responses. Those still need the real thing.
//
// Students are generated from the planners loaded in the system, so a mock cohort follows the real majors
// rather than an invented curriculum. The cohort is built once and cached, since a scrape run asks for the
// student list and then each transcript separately and they have to agree with each other.
// ============================================================

import * as plannerRepository from '../../../db/repositories/plannerRepository';
import {
  generateStudents,
  plannersToFixtures,
  toCourseList,
  type GeneratedStudent,
} from '../dpaImport/fixtureGenerator';
import type { ScrapedStudent } from '../../../shared/types/student';
import type { PortalEnrollment, PortalSource, PortalStudentSummary } from './portalSource';

export interface MockPortalOptions {
  count?: number;
  seed?: number;
}

// Roughly a real Bachelor of Computer Science population across all year levels, so the aggregated figures
// are the scale the HoD would actually see. Measured against the loaded planners, coverage saturates at 300:
// all 25 major and intake combinations are represented from there on, and nothing about the spread improves
// past it. 500 sits safely beyond that point and costs nothing, a 1000-student run previews in the same time
// as a 100-student one because the planner fetch is cached and the per-student work is cheap.
const DEFAULT_COUNT = 500;
const DEFAULT_SEED = 1;

// core/db has no per-unit credit field, so the known exceptions are supplied. Same list the fixture script
// uses, taken from a real DPA export.
const CREDITS_BY_CODE: Record<string, number> = { AIMFECS: 0, ICT20026: 25, ICT20016: 25 };

// A real student carries an MPU enrolment alongside their degree enrolment, and the scrape loop picks the
// highest non-MPU one. Handing back both keeps that selection exercised rather than bypassed.
const MPU_ENROLLMENT_DESC = 'Mata Pelajaran Umum';

interface MockCohort {
  students: GeneratedStudent[];
  byDbId: Map<number, GeneratedStudent>;
}

let cached: MockCohort | null = null;
let cachedKey = '';

function cohortKey(options: MockPortalOptions): string {
  return `${options.count ?? DEFAULT_COUNT}:${options.seed ?? DEFAULT_SEED}`;
}

async function buildCohort(options: MockPortalOptions): Promise<MockCohort> {
  const planners = plannersToFixtures(
    await plannerRepository.getAllPlannersWithUnits(),
    { creditsByCode: CREDITS_BY_CODE },
  );

  if (planners.length === 0) {
    throw new Error('No planners are loaded, so mock students cannot be generated. Import or sync a planner first.');
  }

  const students = generateStudents({
    planners,
    count: options.count ?? DEFAULT_COUNT,
    seed: options.seed ?? DEFAULT_SEED,
  });

  // db_id is the portal's own internal key. Any stable number works, so the position in the cohort is used.
  const byDbId = new Map(students.map((student, index) => [index + 1, student]));
  return { students, byDbId };
}

async function getCohort(options: MockPortalOptions): Promise<MockCohort> {
  const key = cohortKey(options);
  if (!cached || cachedKey !== key) {
    cached = await buildCohort(options);
    cachedKey = key;
  }
  return cached;
}

/** Drops the cached cohort, so a later run picks up planner changes or a different seed. */
export function resetMockCohort(): void {
  cached = null;
  cachedKey = '';
}

function toScrapedStudent(student: GeneratedStudent): ScrapedStudent {
  const courseList = toCourseList(student);
  const creditsCompleted = courseList
    .filter((row) => row.status === 'Complete')
    .reduce((sum, row) => sum + (Number(row.creditsEarned) || 0), 0);
  const scheduledCredits = courseList
    .filter((row) => row.status === 'Current' || row.status === 'Scheduled')
    .reduce((sum, row) => sum + (Number(row.credits) || 0), 0);

  return {
    studentId: student.studentId,
    studentName: `Mock Student ${student.studentId}`,
    course: student.majorName,
    status: 'Active',
    cgpa: 0,
    creditsRequired: 300,
    creditsCompleted,
    gradeLevel: `Year ${Math.ceil(student.semestersElapsed / 2)}`,
    // Left empty on purpose. Intake is derived from the transcript's term codes, and supplying a date here
    // would hide it if that derivation ever regressed.
    enrollmentDate: '',
    graduationDate: null,
    scheduledCredits,
    courseList,
  };
}

export function createMockPortalSource(options: MockPortalOptions = {}): PortalSource {
  return {
    id: 'mock',
    label: 'Mock data (no login)',
    requiresLogin: false,

    async readiness() {
      try {
        const { students } = await getCohort(options);
        return students.length > 0
          ? { ready: true }
          : { ready: false, reason: 'The mock cohort came back empty.' };
      } catch (err) {
        return { ready: false, reason: err instanceof Error ? err.message : String(err) };
      }
    },

    async getStudents(): Promise<PortalStudentSummary[]> {
      const { byDbId } = await getCohort(options);
      return [...byDbId.entries()].map(([db_id, student]) => ({
        student_id: student.studentId,
        name: `Mock Student ${student.studentId}`,
        db_id,
      }));
    },

    async fetchEnrollments(dbId: number): Promise<PortalEnrollment[]> {
      const { byDbId } = await getCohort(options);
      const student = byDbId.get(dbId);
      if (!student) throw new Error(`No mock student with db_id ${dbId}`);

      return [
        { EnrollId: dbId * 10, EnrollmentDesc: student.majorName },
        { EnrollId: dbId * 10 + 1, EnrollmentDesc: MPU_ENROLLMENT_DESC },
      ];
    },

    async fetchDegreeAudit(dbId: number): Promise<ScrapedStudent> {
      const { byDbId } = await getCohort(options);
      const student = byDbId.get(dbId);
      if (!student) throw new Error(`No mock student with db_id ${dbId}`);
      return toScrapedStudent(student);
    },
  };
}
