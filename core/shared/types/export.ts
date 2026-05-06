import type { ScrapedStudent } from './student';
import type { DisplayPayload } from './matching';

export type ExportSection = 'student_profile' | 'major_match' | 'unit_plan' | 'study_planner';

export const EXPORT_SECTION_LABELS: Record<ExportSection, string> = {
  student_profile: 'Student Profile',
  major_match:     'Major & Course Match',
  unit_plan:       'Unit Plan',
  study_planner:   'Study Planner',
};

export type ExportOptions = {
  sections: ExportSection[];
};

export type ExportPlannerUnit = {
  year_level: number;
  semester: number;
  category: string;
  unit: { unit_code: string; unit_name: string } | null;
};

export type ExportPlanner = {
  course: { name: string; code: string };
  major: { name: string } | null;
  units: ExportPlannerUnit[];
  intakeMonth?: number | null;
};

export type ExportInput = {
  options: ExportOptions;
  studentId: string;
  student: ScrapedStudent;
  match: DisplayPayload;
  planner: ExportPlanner;
  completedCodes: string[];
  intakeYear: number;
  mpuCourseList?: { courseId: string; status: string }[];
};
