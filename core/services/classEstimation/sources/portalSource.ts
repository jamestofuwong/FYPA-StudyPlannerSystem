// ============================================================
// The contract a transcript source satisfies, so the scrape flow can run against the real portal or
// against generated data without a second code path.
//
// The point of routing the mock through this rather than straight into the store is that everything the
// real portal exercises still runs: the per-student loop, the enrolment selection, the progress stream,
// cancellation, the record builder. A mock that injected records directly would skip all of it and test
// nothing that matters.
//
// getStudents is async here even though the real portal answers from memory, because the mock has to build
// its cohort from the planners in the database first.
// ============================================================

import type { ScrapedStudent } from '../../../shared/types/student';

export type PortalSourceId = 'portal' | 'mock';

export interface PortalStudentSummary {
  student_id: string;
  name: string;
  db_id: number;
}

export interface PortalEnrollment {
  EnrollId: number;
  EnrollmentDesc: string;
}

export interface SourceReadiness {
  ready: boolean;
  /** Why it is not usable, shown to the user. */
  reason?: string;
}

export interface PortalSource {
  readonly id: PortalSourceId;
  /** Human-readable, for the source picker and for run reports. */
  readonly label: string;
  /** True when this source needs a portal session. The mock never does, which is the whole point. */
  readonly requiresLogin: boolean;

  readiness(): Promise<SourceReadiness>;
  getStudents(): Promise<PortalStudentSummary[]>;
  fetchEnrollments(dbId: number): Promise<PortalEnrollment[]>;
  fetchDegreeAudit(dbId: number, enrollId: number, studentNumber?: string): Promise<ScrapedStudent>;
}
