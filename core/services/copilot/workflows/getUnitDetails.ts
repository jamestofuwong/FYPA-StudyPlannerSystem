import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  unitCode: string;
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
  offeredIn: number[];
  offeredInLabels: string[];
  prerequisites: string;
}

export const getUnitDetailsWorkflow: Workflow<Input, Output> = {
  id: 'get_unit_details',
  description: 'Returns details about a specific unit: its name, which semesters it is offered in, and its prerequisites. Use this when the user asks about a specific unit code, what semesters a unit runs, or what prerequisites a unit has.',
  params: [
    {
      name: 'unitCode',
      type: 'string',
      description: 'The unit code to look up (e.g. "COS30049", "SWE40001")',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const all = await unitRepository.getAllUnits();

      const code = params.unitCode.trim().toUpperCase();
      const unit = all.find((u) => u.unit_code.toUpperCase() === code);

      if (!unit) {
        return { ok: false, error: `Unit "${params.unitCode}" not found in the database.` };
      }

      return {
        ok: true,
        data: {
          unitCode: unit.unit_code,
          unitName: unit.unit_name,
          offeredIn: unit.offerings,
          offeredInLabels: unit.offerings.map((n) => SEMESTER_LABELS[n] ?? `Term ${n}`),
          prerequisites: unit.prerequisite || 'None',
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch unit details.' };
    }
  },
};
