import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface UnitEntry {
  code: string;
  title: string;
  credits: number;
  grade: string;
  status: string;
  term: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  totalUnits: number;
  completedCredits: number;
  units: UnitEntry[];
}

export const getStudentUnitsWorkflow: Workflow<Input, Output> = {
  id: 'get_student_units',
  description: 'Lists all units (subjects) taken by a student, including grades and credit hours. Fetches live data from the student portal. Use this when the user asks what units a student has taken, their grades, or their course history.',
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

    // Resolve studentId → dbId via cached student list
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

      const units: UnitEntry[] = scraped.courseList.map((item) => ({
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
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          totalUnits: units.length,
          completedCredits: scraped.creditsCompleted,
          units,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch student units.' };
    }
  },
};
