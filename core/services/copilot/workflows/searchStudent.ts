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
  description: 'Searches for students by name or student ID. Returns matching student IDs and names. Use this when the user wants to find or look up a student.',
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
