export type PlannerImportRequirement = {
  count: number | null;
  cp: number | null;
};

export type PlannerImportUnit = {
  year_level: number | null;
  semester: number | null;
  category: string | null;
  unit_code: string;
  unit_name: string;
  prerequisite: string | null;                // import page
  requisites?: {                              // viewer page
    conditions: {
      type: 'unit' | 'credit_points';
      unit?: { unit_code: string } | null;
      credit_points?: number | null;
      requisite_type?: string | null;
    }[];
  }[] | null;
  offered_in: number | null;
  minor_name?: string | null;
};

export type PlannerImportPlanner = {
  file_name: string;
  course_information: {
    course: string;
    major: string;
    intake: string;
    intake_year: number | null;
    course_type?: string;
    duration_semesters?: number;
    requirements: {
      core: PlannerImportRequirement;
      major: PlannerImportRequirement;
      elective: PlannerImportRequirement;
      wil: PlannerImportRequirement;
    };
  };
  categories: {
    core_units: PlannerImportUnit[];
    major_units: PlannerImportUnit[];
    mpu_group: PlannerImportUnit[];
    elective_groups: {
      prescribed_elective: PlannerImportUnit[];
      elective: PlannerImportUnit[];
    };
    minor_groups?: {
      minor_name: string;
      units: PlannerImportUnit[];
    }[];
    wil_group: PlannerImportUnit[];
  };
};

export type PlannerImportReport = {
  file_name: string;
  pdf_path: string;
  model: string;
  llm_mode: string;
  llm_strategy?: string;
  enhanced_evidence?: boolean;
  llm_retries: number;
  llm_used: boolean;
  llm_applied: boolean;
  llm_error: string | null;
  llm_attempts: Array<Record<string, unknown>>;
  validation_issues: string[];
  outcome: {
    status: string;
    reason?: string;
  };
  unit_counts: Record<string, number>;
  confidence?: {
    overall_score: number;
    manual_review_required: boolean;
    signals: Record<string, number>;
    issues: string[];
  };
};

export type PlannerImportResult = {
  planner: PlannerImportPlanner;
  report: PlannerImportReport;
};
