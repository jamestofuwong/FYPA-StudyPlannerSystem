import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface WilUnit {
  code: string;
  title: string;
  grade: string;
  status: string;
  term: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  hasCompletedWil: boolean;
  wilUnits: WilUnit[];
}

const WIL_PREFIXES = ['WIL', 'INS', 'INT', 'PRO'];

function isWilUnit(code: string, title: string): boolean {
  const upperCode = code.trim().toUpperCase();
  const upperTitle = title.trim().toUpperCase();
  return (
    WIL_PREFIXES.some((p) => upperCode.startsWith(p)) ||
    upperTitle.includes('WORK INTEGRATED') ||
    upperTitle.includes('INDUSTRY') ||
    upperTitle.includes('INTERNSHIP') ||
    upperTitle.includes('PROFESSIONAL PLACEMENT')
  );
}

const PASSING_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S']);

export const checkStudentWilStatusWorkflow: Workflow<Input, Output> = {
  id: 'check_student_wil_status',
  description: 'Checks whether a student has completed their Work Integrated Learning (WIL) unit or industry placement. Use this when the user asks if a student has done WIL, their internship, or work placement.',
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
      if (!enrollments.length) return { ok: false, error: `No enrollments found for student ${params.studentId}.` };

      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);

      const wilUnits: WilUnit[] = scraped.courseList
        .filter((u) => isWilUnit(u.courseId, u.courseTitle))
        .map((u) => ({
          code: u.courseId,
          title: u.courseTitle,
          grade: u.grade,
          status: u.status,
          term: u.term,
        }));

      const hasCompletedWil = wilUnits.some((u) =>
        PASSING_GRADES.has((u.grade ?? '').trim().toUpperCase()),
      );

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          hasCompletedWil,
          wilUnits,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to check WIL status.' };
    }
  },
};
