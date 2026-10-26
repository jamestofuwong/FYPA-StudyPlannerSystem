import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface Input {
  prefix: string;
}

interface UnitSummary {
  code: string;
  name: string;
  offeredIn: number[];
}

interface Output {
  prefix: string;
  totalFound: number;
  units: UnitSummary[];
}

export const getUnitsByPrefixWorkflow: Workflow<Input, Output> = {
  id: 'get_units_by_prefix',
  description: 'Lists the units that start with a code PREFIX WITHOUT digits (for example COS, SWE, MPU). Use this when the user wants to browse the units of a subject area or department. Not for one unit code with digits (use get_unit_details).',
  keywords: ['start with', 'begin with', 'prefix', 'all cos', 'subject area', 'department', 'list units', 'browse units'],
  params: [
    {
      name: 'prefix',
      type: 'string',
      description: 'The unit code prefix to filter by (e.g. "COS", "SWE", "MPU"). Case-insensitive.',
      required: true,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const all = await unitRepository.getAllUnits();
      const prefix = params.prefix.trim().toUpperCase();

      const matched = all.filter((u) => u.unit_code.toUpperCase().startsWith(prefix));

      return {
        ok: true,
        data: {
          prefix: params.prefix,
          totalFound: matched.length,
          units: matched.map((u) => ({
            code: u.unit_code,
            name: u.unit_name,
            offeredIn: u.offerings,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch units by prefix.' };
    }
  },
};
