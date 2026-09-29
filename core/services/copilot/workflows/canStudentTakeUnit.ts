import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  unitCode: string;
  enrollMode?: string;
}

interface MissingPrerequisite {
  requisiteGroup: number;
  missing: string[];
}

interface Output {
  studentId: string;
  unitCode: string;
  unitName: string;
  canTake: boolean;
  alreadyCompleted: boolean;
  missingPrerequisites: MissingPrerequisite[];
  antirequisiteConflicts: string[];
}

const PASSING_GRADES = new Set([
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S',
]);

export const canStudentTakeUnitWorkflow: Workflow<Input, Output> = {
  id: 'can_student_take_unit',
  description: 'Checks whether a student is eligible to enrol in a specific unit, based on their completed units and the unit\'s prerequisite, corequisite, and antirequisite rules. Use this when the user asks if a student can take a unit next semester, or whether they have met the requirements.',
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
      description: 'The unit code to check eligibility for (e.g. "COS30049")',
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
      return { ok: false, error: `Student "${params.studentId}" not found. Make sure the portal is logged in.` };
    }

    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const allUnits = await unitRepository.getAllUnits();
      const unit = allUnits.find((u) => u.unit_code.toUpperCase() === targetCode);

      if (!unit) {
        return { ok: false, error: `Unit "${params.unitCode}" not found in the database.` };
      }

      const enrollments = await fetchEnrollments(student.db_id);
      if (!enrollments.length) {
        return { ok: false, error: `No enrollments found for student ${params.studentId}.` };
      }
      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) {
        return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };
      }

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);
      const passedCodes = new Set(
        scraped.courseList
          .filter((c) => PASSING_GRADES.has(c.grade ?? ''))
          .map((c) => c.courseId.toUpperCase()),
      );

      // Already completed this unit?
      if (passedCodes.has(targetCode)) {
        return {
          ok: true,
          data: {
            studentId: params.studentId,
            unitCode: unit.unit_code,
            unitName: unit.unit_name,
            canTake: false,
            alreadyCompleted: true,
            missingPrerequisites: [],
            antirequisiteConflicts: [],
          },
        };
      }

      const missingPrerequisites: MissingPrerequisite[] = [];
      const antirequisiteConflicts: string[] = [];

      for (let gi = 0; gi < unit.requisites.length; gi++) {
        const group = unit.requisites[gi];
        const prereqConditions = group.conditions.filter(
          (c) => c.type === 'unit' && c.requisite_type === 'prerequisite',
        );
        const antiConditions = group.conditions.filter(
          (c) => c.type === 'unit' && c.requisite_type === 'antirequisite',
        );

        // Prerequisite groups: all conditions in a group must pass (AND within group, OR across groups)
        if (prereqConditions.length > 0) {
          const missing = prereqConditions
            .filter((c) => !passedCodes.has((c.unit?.unit_code ?? '').toUpperCase()))
            .map((c) => c.unit?.unit_code ?? 'unknown');
          if (missing.length > 0) {
            missingPrerequisites.push({ requisiteGroup: gi, missing });
          }
        }

        // Antirequisites: if student already passed any of these, they can't take the target
        for (const c of antiConditions) {
          const code = (c.unit?.unit_code ?? '').toUpperCase();
          if (code && passedCodes.has(code)) {
            antirequisiteConflicts.push(code);
          }
        }
      }

      const canTake = missingPrerequisites.length === 0 && antirequisiteConflicts.length === 0;

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          unitCode: unit.unit_code,
          unitName: unit.unit_name,
          canTake,
          alreadyCompleted: false,
          missingPrerequisites,
          antirequisiteConflicts,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to check unit eligibility.' };
    }
  },
};
