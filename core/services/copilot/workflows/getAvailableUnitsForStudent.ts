import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface AvailableUnit {
  code: string;
  name: string;
  offeredIn: number[];
}

interface Output {
  studentId: string;
  totalAvailable: number;
  units: AvailableUnit[];
}

const PASSING_GRADES = new Set([
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S',
]);

export const getAvailableUnitsForStudentWorkflow: Workflow<Input, Output> = {
  id: 'get_available_units_for_student',
  description: 'Lists all units in the database that a student is currently eligible to take, i.e. units they have not completed yet and whose prerequisites they have already passed. Use this when the user asks what units a student can enrol in now, or what options are available to them.',
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
      return { ok: false, error: `Student "${params.studentId}" not found. Make sure the portal is logged in.` };
    }

    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const allUnits = await unitRepository.getAllUnits();

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

      const available: AvailableUnit[] = [];

      for (const unit of allUnits) {
        const code = unit.unit_code.toUpperCase();

        // Skip units already passed
        if (passedCodes.has(code)) continue;

        // Check prerequisites: each group is an OR; within a group all prereqs must be met
        let prereqSatisfied = true;
        if (unit.requisites && unit.requisites.length > 0) {
          const prereqGroups = unit.requisites.filter((g) =>
            g.conditions.some((c) => c.type === 'unit' && c.requisite_type === 'prerequisite'),
          );
          if (prereqGroups.length > 0) {
            // At least one group must be fully satisfied
            prereqSatisfied = prereqGroups.some((g) =>
              g.conditions
                .filter((c) => c.type === 'unit' && c.requisite_type === 'prerequisite')
                .every((c) => passedCodes.has((c.unit?.unit_code ?? '').toUpperCase())),
            );
          }
        }

        // Check antirequisites: if student passed any, unit is not available
        let antiConflict = false;
        if (unit.requisites) {
          for (const g of unit.requisites) {
            for (const c of g.conditions) {
              if (c.type === 'unit' && c.requisite_type === 'antirequisite') {
                if (passedCodes.has((c.unit?.unit_code ?? '').toUpperCase())) {
                  antiConflict = true;
                }
              }
            }
          }
        }

        if (prereqSatisfied && !antiConflict) {
          available.push({
            code: unit.unit_code,
            name: unit.unit_name,
            offeredIn: unit.offerings,
          });
        }
      }

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          totalAvailable: available.length,
          units: available,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch available units for student.' };
    }
  },
};
