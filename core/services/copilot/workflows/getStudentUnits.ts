import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface UnitEntry {
  code: string;
  title: string;
  credits: number;
  grade: string;
  status: string;
  term: string;
}

interface Output {
  studentName: string | null;
  totalUnits: number;
  completedCredits: number;
  units: UnitEntry[];
}

export const getStudentUnitsWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'get_student_units',
  description: 'Lists all units (subjects) completed by the currently loaded student, including grades and credit hours. Use this when the user asks what units a student has taken, their grades, or their course history.',
  params: [],
  async execute(_params: Record<string, never>, ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    if (!ctx.currentStudent) {
      return { ok: false, error: 'No student data is currently loaded. Please scrape a student first.' };
    }

    const student = ctx.currentStudent;
    const units: UnitEntry[] = student.courseList.map((item) => ({
      code: item.courseId,
      title: item.courseTitle,
      credits: item.credits,
      grade: item.grade,
      status: item.status,
      term: item.term,
    }));

    return {
      ok: true,
      data: {
        studentName: student.studentName ?? null,
        totalUnits: units.length,
        completedCredits: student.creditsCompleted,
        units,
      },
    };
  },
};
