// ============================================================
// SUMS – Matching Algorithm Types
// Shared type definitions for MM-01 through MM-09
// ============================================================

// ------------------------------------------------------------------
// Course type - determines which planners are eligible for a student
// ------------------------------------------------------------------
export type CourseType =
  | "degree"       // e.g. Bachelor of Computer Science (3 years)
  | "diploma"      // e.g. Diploma of IT (1.5–2 years)
  | "foundation"   // e.g. Foundation Studies (1 year)
  | "masters"      // postgraduate coursework
  | "other";       // catch-all for any unlisted course type

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
// Requisite types - prerequisite, concurrent, anti-requisite
// ------------------------------------------------------------------
export type RequisiteType = "prerequisite" | "concurrent" | "antirequisite";
 
export interface Requisite {
  type: RequisiteType;
  unitCode: string; // the unit this requisite refers to
}

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
  offeringSemesters?: (1 | 2)[];        // which semesters this unit runs: 1 or 2 - needed for WIL exemption ordering
  requisites: Requisite[];  // all requisite types (prerequisites, concurrent, anti-requisites); logic in profileBuilder.ts
}

// ------------------------------------------------------------------
// Student Profile (MM-04)
// Raw input before Phase 2a categorisation.
// ------------------------------------------------------------------
export interface RawStudentInput {
  studentID: string;
  courseType: CourseType;         // determines which planners are eligible for this student
  intakeYear: number;
  intakeSemester: 1 | 2;
  currentSemester: 1 | 2;         // used for unit offering availability checks
  completedUnitCodes: string[];   // flat, un-normalised
  hasWIL: boolean;
  manualOverride?: string; // if set, overrides detected major with the specified planner's major
}

// Enriched profile produced by Phase 2a (MM-04)
export interface StudentProfile {
  studentID: string;
  courseType: CourseType;
  intakeYear: number;
  intakeSemester: 1 | 2;
  currentSemester: 1 | 2;
  completedUnits: Set<string>;          // all codes, normalised
  completedCore: Set<string>;
  completedMajorCore: Set<string>;
  completedPrescribed: Set<string>;
  completedFreeElectives: Set<string>;
  electivesByTag: Map<string, Set<string>>; // tag → unit codes
  hasWIL: boolean;
  unclassifiedUnits: string[];          // logged but excluded from scoring
  requisiteFlags: RequisiteFlag[];      // flagged requisite violations, populated during profile building for later display 
}

// A flagged requisite issue found during profile building
export interface RequisiteFlag {
  unitCode: string;         // the unit being checked
  requisiteType: RequisiteType;
  relatedUnit: string;      // the prerequisite / concurrent / antirequisite unit
  issue: string;            // human-readable description
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
  courseType: CourseType;         // must match student courseType to be eligible
  intakeYear: number;
  intakeSemester: 1 | 2;
  durationSemesters: number;      // e.g. 6 for 3-year degree
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
  courseType: CourseType;
  intakeYear: number;      // which version of the planner was matched
  intakeSemester: 1 | 2;   // which version of the planner was matched

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

  // Requisite flags for units in this planner
  requisiteFlags: RequisiteFlag[];
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
  courseType: CourseType;
  plannerVersion: {
    intakeYear: number;
    intakeSemester: 1 | 2;
  };
  matchPct: number;
  majorCoreScore: number;
  breakdown: {
    core: CategoryBreakdown;
    majorCore: CategoryBreakdown;
    prescribed: CategoryBreakdown;
    freeElective: CategoryBreakdown;
    wil: CategoryBreakdown;
  };
  requisiteFlags: RequisiteFlag[]; 
}

export interface DisplayPayload {
  studentID: string;
  courseType: CourseType;
  status: DetectionStatus;
  isOverride: boolean;
  primaryMajor: MajorDisplay | null;
  detectedPrimary?: MajorDisplay; // preserved original when override active
  secondMajor: MajorDisplay | null;
  topAlternatives: MajorDisplay[]; // top-3 for noMajorDetected
  detectedMinors: string[];        // extension
  rankedPlanners: PlannerScoreRecord[];
  unavailableUnits: UnavailableUnit[];  // units in student's profile that are not offered in their current semester
}

// A missing unit the student cannot take in their current semester
export interface UnavailableUnit {
  unitCode: string;
  unitName: string;
  availableInSemesters: (1 | 2)[];
}