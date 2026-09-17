import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Output {
  studentName: string | null;
  isEligible: boolean;
  completedCredits: number;
  requiredCredits: number;
  cgpa: number;
  hasFailedUnits: boolean;
  failedUnits: string[];
  summary: string;
}

export const checkGraduationStatusWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'check_graduation_status',
  description: 'Checks whether the currently loaded student meets graduation requirements based on completed credits, CGPA, and failed units.',
  params: [],
  async execute(_params: Record<string, never>, ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    if (!ctx.currentStudent) {
      return { ok: false, error: 'No student data is currently loaded. Please scrape a student first.' };
    }

    const student = ctx.currentStudent;
    const failedUnits = student.courseList
      .filter((u) => u.grade === 'F')
      .map((u) => u.courseId);

    const hasFailedUnits = failedUnits.length > 0;
    const creditsOk = student.creditsCompleted >= student.creditsRequired;
    const isEligible = creditsOk && !hasFailedUnits;

    let summary = '';
    if (isEligible) {
      summary = 'The student meets graduation requirements.';
    } else {
      const reasons: string[] = [];
      if (!creditsOk) reasons.push(`${student.creditsRequired - student.creditsCompleted} credits still needed`);
      if (hasFailedUnits) reasons.push(`${failedUnits.length} failed unit(s)`);
      summary = `Not yet eligible: ${reasons.join('; ')}.`;
    }

    return {
      ok: true,
      data: {
        studentName: student.studentName ?? null,
        isEligible,
        completedCredits: student.creditsCompleted,
        requiredCredits: student.creditsRequired,
        cgpa: student.cgpa,
        hasFailedUnits,
        failedUnits,
        summary,
      },
    };
  },
};
