import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  unitCode: string;
}

interface DependentUnit {
  code: string;
  name: string;
}

interface Output {
  unitCode: string;
  dependentCount: number;
  dependentUnits: DependentUnit[];
}

export const getUnitsRequiringUnitWorkflow: Workflow<Input, Output> = {
  id: 'get_units_requiring_unit',
  description: 'Reverse prerequisite lookup — finds all units that require a given unit as a prerequisite. Use this when the user asks what units depend on a unit, what can be unlocked after completing a unit, or which units list a unit as a prerequisite.',
  params: [
    {
      name: 'unitCode',
      type: 'string',
      description: 'The unit code to look up dependents for (e.g. "COS10005")',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const all = await unitRepository.getAllUnits();
      const targetCode = params.unitCode.trim().toUpperCase();

      const dependents: DependentUnit[] = [];

      for (const unit of all) {
        const isDependent = unit.requisites.some((group) =>
          group.conditions.some(
            (c) =>
              c.type === 'unit' &&
              c.requisite_type === 'prerequisite' &&
              (c.unit?.unit_code ?? '').trim().toUpperCase() === targetCode,
          ),
        );
        if (isDependent) {
          dependents.push({ code: unit.unit_code, name: unit.unit_name });
        }
      }

      return {
        ok: true,
        data: {
          unitCode: params.unitCode,
          dependentCount: dependents.length,
          dependentUnits: dependents,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch dependent units.' };
    }
  },
};
