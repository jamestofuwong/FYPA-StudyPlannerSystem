import type { RawStudentInput, UnitCategory } from './matching';
import type { ScrapedStudent, ScrapedCourseListItem } from './student';
import type { UnitState } from '../constants/grades';

// ============================================================
// Class Estimation — shared types
// One record per scraped student (ephemeral, in-memory only —
// see core/services/classEstimation/estimationStore.ts).
// ============================================================

/**
 * Where a transcript came from. Recorded so a run can report its mix and a problem can be traced, never
 * branched on: everything downstream of the record builder treats all sources identically, which is what
 * stops the portal and import paths drifting apart.
 */
export type EstimationSource = 'portal' | 'import' | 'mock';

/** A unit the student has already enrolled in for a future term, from a "Scheduled" transcript row. */
export interface ScheduledUnitRow {
  code: string;
  term: string;
}

export interface EstimationRecord {
  studentId: string;
  source: EstimationSource;
  name: string;
  /** Portal only. An imported transcript has no portal identifiers. */
  dbId?: number;
  enrollId?: number;
  /** Full portal payload when there was one, kept for traceability. Absent for an imported transcript. */
  scraped?: ScrapedStudent;
  /** The transcript rows themselves, always present whatever the source. */
  transcript: ScrapedCourseListItem[];
  /** Derived input ready for runMatchingPipeline. */
  rawInput: RawStudentInput;
  /**
   * Credit points earned, summed from the transcript's own Earned column rather than counting units at a
   * flat rate. Real transcripts carry 0-credit modules and 25-credit placements, so a count is wrong in
   * both directions, and credit-point requisites depend on this being right.
   */
  totalCreditsEarned: number;
  /**
   * Units already booked for a future term. Recorded for measurement only: by decision these are still
   * predicted normally rather than counted as certain, so the estimator can be measured honestly
   * end-to-end instead of scoring itself on enrolments it read off the transcript.
   */
  scheduledUnits: ScheduledUnitRow[];
  /** Unit codes rewritten by the alias map, as [from, to], so a wrong alias is visible rather than silent. */
  appliedAliases: Array<[string, string]>;
  /** Per-unit status (passed/in_progress/must_retake/not_taken), from resolveUnitStates(). */
  unitStates: Map<string, UnitState>;
  /**
   * Units held only as a Conceded Pass, from getConcededPassUnitCodes(). A CP earns credit, so the unit is
   * not owed again, but it cannot satisfy a prerequisite or corequisite, so eligibility needs it separately
   * from completedUnitCodes rather than inferring it.
   */
  concededPassUnitCodes: string[];
  /** Every field on rawInput that was defaulted/guessed rather than read directly from scraped data. */
  mappingWarnings: string[];
}

// ------------------------------------------------------------------
// Batching (Phase 4)
// ------------------------------------------------------------------
export interface StudentGroupKey {
  courseType: string;
  intakeYear: number;
  intakeSemester: 1 | 2;
  /** Sorted "unitCode:status" pairs — the group's completed/in-progress/failed signature. */
  unitSignature: string;
}

export interface StudentGroup {
  key: StudentGroupKey;
  representative: EstimationRecord;
  size: number;
}

// ------------------------------------------------------------------
// Per-student candidate resolution (Phase 3)
// ------------------------------------------------------------------
export type EstimationUnitCategory = Extract<UnitCategory, 'core' | 'majorCore' | 'prescribed' | 'freeElective'>;

export interface CandidateUnit {
  code: string;
  category: EstimationUnitCategory;
  /** Only set for pool-based categories (prescribed, freeElective) — how many pool slots remain unfilled. */
  poolSlotsRemaining?: number;
}

export interface RankedCandidateUnit extends CandidateUnit {
  /** From the matched planner's TemplateUnit row; undefined for pool-only units with no slot placement. */
  yearLevel?: number;
  semester?: number;
}

// ------------------------------------------------------------------
// Elective prediction (Phase 6)
// ------------------------------------------------------------------

/**
 * One pool unit and the share of a student's elective seats expected to land on it. Fractional on purpose:
 * nobody can say which elective a given student will pick, only how the cohort tends to spread across the
 * pool, so a student owing one prescribed slot contributes a fraction of a seat to every unit they could
 * choose. The fractions for one pool sum to the seats that pool was given. Rounding happens once, at
 * aggregation, so it is not applied repeatedly per student.
 */
export interface ElectiveExpectation {
  code: string;
  category: Extract<EstimationUnitCategory, 'prescribed' | 'freeElective'>;
  expectedSeats: number;
  /** Students in this batch who have already passed the unit, the weight behind the share. */
  popularity: number;
}

export interface ElectiveSplit {
  expectations: ElectiveExpectation[];
  /** Elective seats this student is expected to fill next semester, after the load cap. */
  prescribedSeats: number;
  freeElectiveSeats: number;
  /** Seats the student owes but has no eligible pool unit to put them on, so they go uncounted. */
  unplacedSeats: number;
}

// ------------------------------------------------------------------
// Aggregation (Phase 5)
// ------------------------------------------------------------------
export interface ClassEstimationConfig {
  loadCap: number;
  retentionRate: number;
  defaultHasWIL: boolean;
}

export const DEFAULT_CLASS_ESTIMATION_CONFIG: ClassEstimationConfig = {
  loadCap: 4,
  retentionRate: 0.85,
  defaultHasWIL: true,
};

export interface ManualNewIntake {
  plannerId: string;
  count: number;
}

export interface ClassEstimationResult {
  unitCode: string;
  projectedHeadcount: number;
}
