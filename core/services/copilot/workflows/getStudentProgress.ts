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
  cgpa: number;
  gradeLevel: string;
  completedCredits: number;
  requiredCredits: number;
  progressPercent: number;
  enrollmentDate: string | null;
  graduationDate: string | null;
  currentSemester: string | null;
}

export const getStudentProgressWorkflow: Workflow<Input, Output> = {
  id: 'get_student_progress',
  description: 'Returns a snapshot of a student\'s academic progress: CGPA, credits completed vs required, grade level, current semester, and graduation date. Use this when the user asks how a student is doing, their GPA, their progress, or their academic standing.',
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

      const progressPercent =
        scraped.creditsRequired > 0
          ? Math.round((scraped.creditsCompleted / scraped.creditsRequired) * 100)
          : 0;

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          cgpa: scraped.cgpa,
          gradeLevel: scraped.gradeLevel,
          completedCredits: scraped.creditsCompleted,
          requiredCredits: scraped.creditsRequired,
          progressPercent,
          enrollmentDate: scraped.enrollmentDate,
          graduationDate: scraped.graduationDate,
          currentSemester: scraped.status,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch student progress.' };
    }
  },
};
