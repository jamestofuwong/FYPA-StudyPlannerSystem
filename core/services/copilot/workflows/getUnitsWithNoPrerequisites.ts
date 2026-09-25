import type { Workflow, WorkflowContext, WorkflowResult } from '../types';

interface UnitSummary {
  code: string;
  name: string;
  offeredIn: number[];
}

interface Output {
  totalFound: number;
  units: UnitSummary[];
}

export const getUnitsWithNoPrerequisitesWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'get_units_with_no_prerequisites',
  description: 'Lists all units in the database that have no prerequisite requirements. Use this when the user asks what units a first-year student can take, what units have no prerequisites, or what units are open to all students.',
  params: [],
  async execute(_params: Record<string, never>, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    try {
      const unitRepository = await import('../../../db/repositories/unitRepository');
      const all = await unitRepository.getAllUnits();

      const noPrereqs = all.filter((u) => {
        // A unit has no prerequisites if it has no requisite_groups,
        // or all groups have no conditions of type 'unit' with requisite_type 'prerequisite'
        if (!u.requisites || u.requisites.length === 0) return true;
        return !u.requisites.some((group) =>
          group.conditions.some(
            (c) => c.type === 'unit' && c.requisite_type === 'prerequisite',
          ),
        );
      });

      return {
        ok: true,
        data: {
          totalFound: noPrereqs.length,
          units: noPrereqs.map((u) => ({
            code: u.unit_code,
            name: u.unit_name,
            offeredIn: u.offerings,
          })),
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch units.' };
    }
  },
};
