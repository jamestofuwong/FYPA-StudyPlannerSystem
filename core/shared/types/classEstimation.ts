import type { RawStudentInput, UnitCategory } from './matching';
import type { ScrapedStudent } from './student';
import type { UnitState } from '../constants/grades';

// ============================================================
// Class Estimation — shared types
// One record per scraped student (ephemeral, in-memory only —
// see core/services/classEstimation/estimationStore.ts).
// ============================================================

export interface EstimationRecord {
  studentId: string;
  name: string;
  dbId: number;
  enrollId: number;
  /** Raw scraped data, kept for traceability/debugging. */
  scraped: ScrapedStudent;
  /** Derived input ready for runMatchingPipeline. */
  rawInput: RawStudentInput;
  /** Per-unit status (passed/in_progress/must_retake/not_taken), from resolveUnitStates(). */
  unitStates: Map<string, UnitState>;
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
