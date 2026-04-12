// ============================================================
// SUMS – Matching Algorithm Types
// Shared type definitions for MM-01 through MM-09
// ============================================================

// ------------------------------------------------------------------
// Algorithm Configuration (MM-01)
// All weights and thresholds live here – never hardcoded in logic.
// ------------------------------------------------------------------
export interface AlgorithmConfig {
  // Scoring weights – must sum to exactly 1.0
  weightCore: number;              // default 0.40
  weightMajorCore: number;         // default 0.30
  weightPrescribedElective: number;// default 0.20
  weightFreeElective: number;      // default 0.05
  weightWIL: number;               // default 0.05

  // WIL exemption
  wilExemptionCount: number;       // default 2 (university-wide constant)

  // Detection thresholds
  secondMajorThreshold: number;    // default 0.70
  noMajorThreshold: number;        // default 0.30
  minorUnitThreshold: number;      // default 3

  // Planner selection behaviour
  preferIntakeYear: boolean;       // default true
  preferIntakeSemester: boolean;   // default true
}

export const DEFAULT_CONFIG: AlgorithmConfig = {
  weightCore: 0.40,
  weightMajorCore: 0.30,
  weightPrescribedElective: 0.20,
  weightFreeElective: 0.05,
  weightWIL: 0.05,
  wilExemptionCount: 2,
  secondMajorThreshold: 0.70,
  noMajorThreshold: 0.30,
  minorUnitThreshold: 3,
  preferIntakeYear: true,
  preferIntakeSemester: true,
};

// ------------------------------------------------------------------
// Unit Master Table entry (MM-03 / MM-04)
// ------------------------------------------------------------------
export type UnitCategory = "core" | "majorCore" | "prescribed" | "freeElective" | "WIL";

export interface UnitMasterEntry {
  code: string;             // canonical uppercase, no whitespace
  name: string;
  category: UnitCategory;
  creditHours: number;
  subjectTags: string[];    // used for minor detection (Phase 7)
  semester?: number;        // 1 or 2 – needed for WIL exemption ordering
}

// ------------------------------------------------------------------
// Student Profile (MM-04)
// Raw input before Phase 2a categorisation.
// ------------------------------------------------------------------
export interface RawStudentInput {
  studentID: string;
  intakeYear: number;
  intakeSemester: 1 | 2;
  completedUnitCodes: string[];   // flat, un-normalised
  hasWIL: boolean;
}

// Enriched profile produced by Phase 2a (MM-04)
export interface StudentProfile {
  studentID: string;
  intakeYear: number;
  intakeSemester: 1 | 2;
  completedUnits: Set<string>;          // all codes, normalised
  completedCore: Set<string>;
  completedMajorCore: Set<string>;
  completedPrescribed: Set<string>;
  completedFreeElectives: Set<string>;
  electivesByTag: Map<string, Set<string>>; // tag → unit codes
  hasWIL: boolean;
  unclassifiedUnits: string[];          // logged but excluded from scoring
}

// ------------------------------------------------------------------
// Planner Template (MM-02)
// ------------------------------------------------------------------
export interface PrescribedElectiveCategory {
  categoryCode: string;
  pool: Set<string>;   // approved unit codes for this category
  slots: number;       // how many slots the student must fill
}

export interface PlannerTemplate {
  plannerID: string;
  majorName: string;
  intakeYear: number;
  intakeSemester: 1 | 2;
  requiredCore: string[];          // ordered; order matters for WIL exemption removal
  requiredMajorCore: Set<string>;
  prescribedElectiveCategories: PrescribedElectiveCategory[];
  freeElectivePool: Set<string>;
  freeElectiveSlotsRequired: number;
}

// ------------------------------------------------------------------
// Per-planner Score Record (MM-05 output)
// ------------------------------------------------------------------
export interface PlannerScoreRecord {
  plannerID: string;
  majorName: string;

  matchPct: number;          // 0–100
  majorCoreScore: number;    // 0–1, used as primary ranking signal

  // Raw counts for display
  coreMatched: number;
  coreRequired: number;
  majorCoreMatched: number;
  majorCoreRequired: number;
  prescribedMatched: number;
  prescribedPossible: number;
  freeMatched: number;
  freePossible: number;
  wilScore: number;          // 0 or 1
  wilExemptionApplied: boolean;

  // Missing unit lists (MM-06)
  missingCore: string[];
  missingMajorCore: string[];
  missingPrescribed: Array<{ categoryCode: string; unfilledSlots: number }>;
  missingFreeSlots: number;
}

// ------------------------------------------------------------------
// Detection Result (MM-07)
// ------------------------------------------------------------------
export type DetectionStatus =
  | "detected"
  | "noMajorDetected"
  | "overridden";

export interface DetectionResult {
  primaryMajor: PlannerScoreRecord | null;
  secondMajor: PlannerScoreRecord | null;
  status: DetectionStatus;
  rankedPlanners: PlannerScoreRecord[];
  manualOverride?: string;          // override major name if set by admin
  algorithmPrimary?: PlannerScoreRecord; // preserved when override is active
}

// ------------------------------------------------------------------
// Display Payload (MM-08)
// ------------------------------------------------------------------
export interface CategoryBreakdown {
  matched: number;
  required: number;
  missingUnits?: string[];
  missingSlots?: number;
}

export interface MajorDisplay {
  majorName: string;
  matchPct: number;
  majorCoreScore: number;
  breakdown: {
    core: CategoryBreakdown;
    majorCore: CategoryBreakdown;
    prescribed: CategoryBreakdown;
    freeElective: CategoryBreakdown;
    wil: CategoryBreakdown;
  };
}

export interface DisplayPayload {
  studentID: string;
  status: DetectionStatus;
  isOverride: boolean;
  primaryMajor: MajorDisplay | null;
  detectedPrimary?: MajorDisplay; // preserved original when override active
  secondMajor: MajorDisplay | null;
  topAlternatives: MajorDisplay[]; // top-3 for noMajorDetected
  detectedMinors: string[];        // Phase 7 extension
  rankedPlanners: PlannerScoreRecord[];
}
