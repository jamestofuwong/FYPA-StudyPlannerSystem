import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  isEligible: boolean;
  completedCredits: number;
  requiredCredits: number;
  cgpa: number;
  hasFailedUnits: boolean;
  failedUnits: string[];
  summary: string;
}

export const checkGraduationStatusWorkflow: Workflow<Input, Output> = {
  id: 'check_graduation_status',
  description: 'Checks whether a student meets graduation requirements based on completed credits, CGPA, and failed units. Fetches live data from the student portal.',
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student ID number (e.g. 102780123)',
      required: true,
    },
    {
      name: 'enrollMode',
      type: 'string',
      description: 'Which enrollment to use: latest, earliest, or mpu. Defaults to latest.',
      required: false,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    const mode = params.enrollMode ?? 'latest';

    const matches = searchStudents(params.studentId);
    const student = matches.find((s) => s.student_id === params.studentId) ?? matches[0] ?? null;
    if (!student) {
      return { ok: false, error: `Student "${params.studentId}" not found. Make sure the portal is logged in and the student list is loaded.` };
    }

    try {
      const enrollments = await fetchEnrollments(student.db_id);
      if (!enrollments.length) {
        return { ok: false, error: `No enrollments found for student ${params.studentId}.` };
      }

      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) {
        return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };
      }

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);

      const failedUnits = scraped.courseList
        .filter((u) => u.grade === 'F')
        .map((u) => u.courseId);

      const hasFailedUnits = failedUnits.length > 0;
      const creditsOk = scraped.creditsCompleted >= scraped.creditsRequired;
      const isEligible = creditsOk && !hasFailedUnits;

      let summary: string;
      if (isEligible) {
        summary = 'The student meets graduation requirements.';
      } else {
        const reasons: string[] = [];
        if (!creditsOk) reasons.push(`${scraped.creditsRequired - scraped.creditsCompleted} credits still needed`);
        if (hasFailedUnits) reasons.push(`${failedUnits.length} failed unit(s)`);
        summary = `Not yet eligible: ${reasons.join('; ')}.`;
      }

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          isEligible,
          completedCredits: scraped.creditsCompleted,
          requiredCredits: scraped.creditsRequired,
          cgpa: scraped.cgpa,
          hasFailedUnits,
          failedUnits,
          summary,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch graduation status.' };
    }
  },
};
