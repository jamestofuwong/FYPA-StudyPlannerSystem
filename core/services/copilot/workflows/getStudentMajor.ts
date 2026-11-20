import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';
import { getCompletedUnitCodes } from '../../../shared/constants/grades';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  detectedMajor: string | null;
  confidence: number;
  status: string;
  secondMajor: string | null;
  completedCredits: number;
  requiredCredits: number;
}

export const getStudentMajorWorkflow: Workflow<Input, Output> = {
  id: 'get_student_major',
  description: 'Detects the major (program of study) that a student is in now, from their degree audit. Use this when the user asks what major, program or course a student is enrolled in or what their detected major is. Not for the list of past programs (use get_student_enrollment_history).',
  keywords: ['enrolled in', 'which major', 'what program', 'what course', 'specialisation', 'stream'],
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

      // Same inputs as the dashboard and checkGraduationStatus, so the copilot names the same major they do.
      // enrollmentDate is DD/MM/YYYY, so the second segment is the month.
      const enrolled = scraped.enrollmentDate ?? '';
      const year = enrolled.match(/\b(20\d{2})\b/);
      const month = enrolled.match(/^\d{1,2}\/(\d{1,2})\//);
      const { runDashboardMatch } = await import('../../matching/dashboardMatch');
      const result = await runDashboardMatch({
        studentID: params.studentId,
        intakeYear: year ? parseInt(year[1], 10) : new Date().getFullYear(),
        intakeSemester: (month ? parseInt(month[1], 10) : 1) >= 7 ? 2 : 1,
        completedUnitCodes: getCompletedUnitCodes(scraped.courseList),
        hasWIL: false,
      });

      const payload = result.data;

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          detectedMajor: payload.primaryMajor?.majorName ?? null,
          confidence: payload.primaryMajor?.matchPct ?? 0,
          status: payload.status,
          secondMajor: payload.secondMajor?.majorName ?? null,
          completedCredits: scraped.creditsCompleted,
          requiredCredits: scraped.creditsRequired,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to run major detection.' };
    }
  },
};
