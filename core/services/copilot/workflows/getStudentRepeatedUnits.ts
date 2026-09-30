import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

const IN_PROGRESS_STATUSES = new Set(['enrolled', 'in progress', 'current', 'registered']);

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface RepeatedUnit {
  code: string;
  title: string;
  attempts: { grade: string; term: string; status: string }[];
}

interface Output {
  studentId: string;
  studentName: string | null;
  repeatedCount: number;
  repeatedUnits: RepeatedUnit[];
}

export const getStudentRepeatedUnitsWorkflow: Workflow<Input, Output> = {
  id: 'get_student_repeated_units',
  description: 'Finds units a student has taken more than once (retakes or repeated attempts). Use this when the user asks about a student\'s repeated units, retakes, or how many times they have attempted a subject.',
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

      // Group by unit code — exclude planning artefacts (empty grade, not actively enrolled)
      const grouped = new Map<string, { title: string; attempts: { grade: string; term: string; status: string }[] }>();
      for (const u of scraped.courseList.filter((c) => {
        const grade = (c.grade ?? '').trim();
        const status = (c.status ?? '').trim().toLowerCase();
        return grade !== '' || IN_PROGRESS_STATUSES.has(status);
      })) {
        const code = u.courseId.trim().toUpperCase();
        if (!grouped.has(code)) {
          grouped.set(code, { title: u.courseTitle, attempts: [] });
        }
        grouped.get(code)!.attempts.push({ grade: u.grade, term: u.term, status: u.status });
      }

      const repeatedUnits: RepeatedUnit[] = [];
      for (const [code, data] of grouped) {
        if (data.attempts.length > 1) {
          repeatedUnits.push({ code, title: data.title, attempts: data.attempts });
        }
      }

      repeatedUnits.sort((a, b) => b.attempts.length - a.attempts.length);

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          repeatedCount: repeatedUnits.length,
          repeatedUnits,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch repeated units.' };
    }
  },
};
