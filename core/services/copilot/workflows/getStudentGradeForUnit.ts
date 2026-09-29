import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  unitCode: string;
  enrollMode?: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  unitCode: string;
  found: boolean;
  grade: string | null;
  status: string | null;
  term: string | null;
  credits: number | null;
}

export const getStudentGradeForUnitWorkflow: Workflow<Input, Output> = {
  id: 'get_student_grade_for_unit',
  description: 'Looks up what grade a student received in a specific unit, or whether they have taken it at all. Use this when the user asks what grade a student got in a unit, or whether a student has taken a particular subject.',
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student ID number (e.g. 102780123)',
      required: true,
    },
    {
      name: 'unitCode',
      type: 'string',
      description: 'The unit code to look up (e.g. "COS30049")',
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
    const targetCode = params.unitCode.trim().toUpperCase();

    const matches = searchStudents(params.studentId);
    const student = matches.find((s) => s.student_id === params.studentId) ?? matches[0] ?? null;
    if (!student) {
      return { ok: false, error: `Student "${params.studentId}" not found. Make sure the portal is logged in and the student list is loaded.` };
    }

    try {
      const enrollments = await fetchEnrollments(student.db_id);
      if (!enrollments.length) return { ok: false, error: `No enrollments found for student ${params.studentId}.` };

      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);

      const record = scraped.courseList.find(
        (u) => u.courseId.trim().toUpperCase() === targetCode,
      );

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          unitCode: params.unitCode,
          found: !!record,
          grade: record?.grade ?? null,
          status: record?.status ?? null,
          term: record?.term ?? null,
          credits: record?.credits ?? null,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch student grade.' };
    }
  },
};
