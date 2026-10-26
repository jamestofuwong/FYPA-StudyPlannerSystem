import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments } from '../../portal/portalSessionService';

interface Input {
  studentId: string;
}

interface EnrollmentRecord {
  enrollId: number;
  description: string;
  isMpu: boolean;
}

interface Output {
  studentId: string;
  studentName: string;
  totalEnrollments: number;
  enrollments: EnrollmentRecord[];
}

const isMpu = (desc: string) => desc.toLowerCase().includes('mata pelajaran umum');

export const getStudentEnrollmentHistoryWorkflow: Workflow<Input, Output> = {
  id: 'get_student_enrollment_history',
  description: 'Lists every program that a student was ever enrolled in, including MPU. Use this when the user asks which programs a student is or was enrolled in, or whether they transferred, changed course or have more than one enrollment.',
  keywords: ['transfer', 'transferred', 'change course', 'changed course', 'switched course', 'multiple enrollments', 'previous program', 'before', 'history of programs'],
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student ID number (e.g. 102780123)',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
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

      // Sort by EnrollId ascending so history reads oldest to newest
      const sorted = [...enrollments].sort((a, b) => a.EnrollId - b.EnrollId);

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: student.name,
          totalEnrollments: sorted.length,
          enrollments: sorted.map((e) => ({
            enrollId: e.EnrollId,
            description: e.EnrollmentDesc,
            isMpu: isMpu(e.EnrollmentDesc),
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch enrollment history.' };
    }
  },
};
