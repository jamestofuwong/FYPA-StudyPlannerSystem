import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  unitCode: string;
  semester: number;
}

const SEMESTER_LABELS: Record<number, string> = {
  1: 'Semester 1',
  2: 'Semester 2',
  3: 'Summer Term',
  4: 'Winter Term',
};

interface Output {
  unitCode: string;
  unitName: string;
  semester: number;
  semesterLabel: string;
  isOffered: boolean;
  offeredIn: number[];
  offeredInLabels: string[];
}

export const isUnitOfferedThisSemesterWorkflow: Workflow<Input, Output> = {
  id: 'is_unit_offered_this_semester',
  description: 'Checks whether a specific unit is offered in a given semester. Use this when the user asks if a unit runs in a particular semester, or whether a student can take a unit in a specific term.',
  params: [
    {
      name: 'unitCode',
      type: 'string',
      description: 'The unit code to check (e.g. "COS30049")',
      required: true,
    },
    {
      name: 'semester',
      type: 'number',
      description: 'The semester to check: 1 (Semester 1), 2 (Semester 2), 3 (Summer Term), 4 (Winter Term)',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    const sem = Number(params.semester);
    if (![1, 2, 3, 4].includes(sem)) {
      return { ok: false, error: 'Semester must be 1, 2, 3, or 4.' };
    }

    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const all = await unitRepository.getAllUnits();
      const targetCode = params.unitCode.trim().toUpperCase();

      const unit = all.find((u) => u.unit_code.toUpperCase() === targetCode);
      if (!unit) {
        return { ok: false, error: `Unit "${params.unitCode}" not found in the database.` };
      }

      return {
        ok: true,
        data: {
          unitCode: unit.unit_code,
          unitName: unit.unit_name,
          semester: sem,
          semesterLabel: SEMESTER_LABELS[sem],
          isOffered: unit.offerings.includes(sem),
          offeredIn: unit.offerings,
          offeredInLabels: unit.offerings.map((n) => SEMESTER_LABELS[n] ?? `Term ${n}`),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to check unit offering.' };
    }
  },
};
