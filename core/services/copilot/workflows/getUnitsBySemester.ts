import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  semester: number;
}

const SEMESTER_LABELS: Record<number, string> = {
  1: 'Semester 1',
  2: 'Semester 2',
  3: 'Summer Term',
  4: 'Winter Term',
};

interface UnitSummary {
  unitCode: string;
  unitName: string;
}

interface Output {
  semester: number;
  semesterLabel: string;
  totalUnits: number;
  units: UnitSummary[];
}

export const getUnitsBySemesterWorkflow: Workflow<Input, Output> = {
  id: 'get_units_by_semester',
  description: 'Lists all units offered in a given semester or term (1 = Semester 1, 2 = Semester 2, 3 = Summer Term, 4 = Winter Term). Use this when the user asks what units are available in a particular semester.',
  params: [
    {
      name: 'semester',
      type: 'number',
      description: 'The semester number: 1 (Semester 1), 2 (Semester 2), 3 (Summer Term), or 4 (Winter Term)',
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

      const offered = all.filter((u) => u.offerings.includes(sem));

      return {
        ok: true,
        data: {
          semester: sem,
          semesterLabel: SEMESTER_LABELS[sem],
          totalUnits: offered.length,
          units: offered.map((u) => ({
            unitCode: u.unit_code,
            unitName: u.unit_name,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch units by semester.' };
    }
  },
};
