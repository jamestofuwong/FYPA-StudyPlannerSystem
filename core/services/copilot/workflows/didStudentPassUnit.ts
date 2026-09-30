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
  taken: boolean;
  passed: boolean;
  grade: string | null;
}

const PASSING_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S']);

export const didStudentPassUnitWorkflow: Workflow<Input, Output> = {
  id: 'did_student_pass_unit',
  description: 'Answers whether a student has passed a specific unit. Use this when the user asks if a student passed or completed a subject, or whether a prerequisite has been met.',
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
      description: 'The unit code to check (e.g. "COS30049")',
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

      const records = scraped.courseList.filter(
        (u) => u.courseId.trim().toUpperCase() === targetCode,
      );

      const taken = records.length > 0;
      const passed = records.some((u) => PASSING_GRADES.has((u.grade ?? '').trim().toUpperCase()));
      const latestGrade = records.length > 0 ? records[records.length - 1].grade : null;

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          unitCode: params.unitCode,
          taken,
          passed,
          grade: latestGrade,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to check unit pass status.' };
    }
  },
};
