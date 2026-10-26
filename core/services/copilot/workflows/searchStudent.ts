import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents } from '../../portal/portalSessionService';

interface Input {
  studentId: string;
}

interface StudentResult {
  studentId: string;
  name: string;
}

interface Output {
  query: string;
  totalFound: number;
  students: StudentResult[];
}

export const searchStudentWorkflow: Workflow<Input, Output> = {
  id: 'search_student',
  description: 'Looks up a student by name or student ID and returns the matching IDs and names. Use this when the user wants to find, look up or identify a student, or gives only a student ID. Not for grades or progress.',
  keywords: ['find', 'look up', 'lookup', 'who is', 'identify', 'search', 'student record'],
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student name or student ID to search for (e.g. "102780123" or "John")',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    const results = searchStudents(params.studentId);

    if (!results.length) {
      return {
        ok: true,
        data: {
          query: params.studentId,
          totalFound: 0,
          students: [],
        },
      };
    }

    // Cap at 20 results to keep the LLM response manageable
    const capped = results.slice(0, 20);

    return {
      ok: true,
      data: {
        query: params.studentId,
        totalFound: results.length,
        students: capped.map((s) => ({
          studentId: s.student_id,
          name: s.name,
        })),
      },
    };
  },
};
