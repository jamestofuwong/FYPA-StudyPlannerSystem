import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { buildStudentProfile } from '../../matching/profileBuilder';
import { normaliseUnitCodes } from '../../matching/unitNormalizer';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface Violation {
  unitCode: string;
  requisiteType: 'prerequisite' | 'concurrent' | 'antirequisite';
  relatedUnit: string;
  issue: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  violationCount: number;
  violations: Violation[];
}

// Priority for resolving a unit's category when it appears in multiple planners.
const CATEGORY_PRIORITY: Record<string, number> = {
  major_core: 5,
  prescribed_elective: 4,
  core: 3,
  elective: 2,
  wil: 1,
};

export const getStudentPrerequisiteViolationsWorkflow: Workflow<Input, Output> = {
  id: 'get_student_prerequisite_violations',
  description: 'Checks whether a student has any prerequisite, corequisite, or antirequisite violations in their unit history. Use this when the user asks about a student\'s prerequisite issues, rule violations, or whether they took units out of order.',
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
      if (!enrollments.length) {
        return { ok: false, error: `No enrollments found for student ${params.studentId}.` };
      }
      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) {
        return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };
      }

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);
      const completedCodes = scraped.courseList.map((u) => u.courseId);
      const normalisedCodes = normaliseUnitCodes(completedCodes);

      // Build unit master table from all planners to get requisite info
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const dbPlanners = await plannerRepository.getAllPlannersWithUnits();

      const masterMap = new Map<string, { category: string; priority: number }>();
      for (const planner of dbPlanners) {
        for (const tu of planner.units) {
          if (!tu.unit) continue;
          const code = tu.unit.unit_code;
          const priority = CATEGORY_PRIORITY[tu.category] ?? 0;
          const existing = masterMap.get(code);
          if (!existing || priority > existing.priority) {
            masterMap.set(code, { category: tu.category, priority });
          }
        }
      }

      const unitMasterTable = Array.from(masterMap.entries()).map(([code, entry]) => {
        const categoryMap: Record<string, 'core' | 'majorCore' | 'prescribed' | 'freeElective' | 'WIL'> = {
          core: 'core',
          major_core: 'majorCore',
          prescribed_elective: 'prescribed',
          elective: 'freeElective',
          wil: 'WIL',
        };
        return {
          code,
          name: '',
          category: categoryMap[entry.category] ?? 'freeElective',
          creditHours: 12.5,
          subjectTags: [] as string[],
          requisites: [] as { type: 'prerequisite' | 'concurrent' | 'antirequisite'; unitCode: string }[],
        };
      });

      const profile = buildStudentProfile(
        {
          studentID: params.studentId,
          courseType: 'degree',
          intakeYear: 2020,
          intakeSemester: 1,
          currentSemester: 1,
          completedUnitCodes: Array.from(normalisedCodes),
          hasWIL: false,
        },
        normalisedCodes,
        unitMasterTable,
      );

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          violationCount: profile.requisiteFlags.length,
          violations: profile.requisiteFlags.map((f) => ({
            unitCode: f.unitCode,
            requisiteType: f.requisiteType as 'prerequisite' | 'concurrent' | 'antirequisite',
            relatedUnit: f.relatedUnit,
            issue: f.issue,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to check prerequisite violations.' };
    }
  },
};
