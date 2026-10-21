import { buildCustomPlan, type SchedulableUnit } from '../../../core/services/scheduling/customPlannerScheduler';

const unit = (code: string, plannedSlot: number | undefined, over: Partial<SchedulableUnit> = {}): SchedulableUnit => ({
  code, name: code, category: 'core', offeringSemesters: [1, 2], requisiteGroups: [], ...(plannedSlot === undefined ? {} : { plannedSlot }), ...over,
});
const needs = (code: string) => [[{ type: 'unit' as const, requisiteType: 'prerequisite' as const, unitCode: code }]];
const codesBySemester = (r: ReturnType<typeof buildCustomPlan>) => r.semesters.map((s) => s.units.map((u) => u.code).sort());
const TWO_A_SEMESTER = { maxStandardPerSemester: 2 };

describe('buildCustomPlan keeps to the study planner when that costs no time', () => {
  it('an unlocking unit is not pulled ahead of its planner semester when the plan is no faster for it', () => {
    // Z unlocks W, so a pure throughput schedule takes Z first and pushes a first-semester unit later.
    const units = [
      unit('X1', 0), unit('X2', 0),
      unit('Z', 1), unit('Y', 1),
      unit('W', 2, { requisiteGroups: needs('Z') }), unit('V', 2),
    ];
    const throughputOnly = buildCustomPlan(units.map(({ plannedSlot: _p, ...rest }) => rest), [], 1, 1, 1, [], TWO_A_SEMESTER);
    expect(codesBySemester(throughputOnly)[0]).toContain('Z');   // the throughput plan does reorder

    const plan = buildCustomPlan(units, [], 1, 1, 1, [], TWO_A_SEMESTER);
    expect(codesBySemester(plan)).toEqual([['X1', 'X2'], ['Y', 'Z'], ['V', 'W']]);
    expect(plan.semesters).toHaveLength(throughputOnly.semesters.length);
  });

  it('never trades speed for alignment', () => {
    // Y1 must come before Y2. Following the planner strictly takes three semesters; pulling Y1 forward takes two.
    const units = [
      unit('X1', 0), unit('X2', 0), unit('X3', 0), unit('X4', 0),
      unit('Y1', 1), unit('Y2', 1, { requisiteGroups: needs('Y1') }), unit('Y3', 1), unit('Y4', 1),
    ];
    const plan = buildCustomPlan(units, [], 1, 1, 1, [], { maxStandardPerSemester: 4 });
    expect(plan.semesters).toHaveLength(2);
    expect(plan.unschedulableUnits).toEqual([]);
  });

  it('puts overdue units first for a student who is behind', () => {
    // The student is at semester 3 (index 2) but still owes units the planner placed in semesters 0 and 1.
    const units = [unit('LATE_A', 0), unit('LATE_B', 1), unit('NOW_A', 2), unit('NOW_B', 2), unit('NEXT', 3)];
    const plan = buildCustomPlan(units, [], 2, 1, 1, [], TWO_A_SEMESTER);
    expect(codesBySemester(plan)[0]).toEqual(['LATE_A', 'LATE_B']);
    expect(plan.semesters).toHaveLength(3);
  });

  it('places everything and respects requisites when the planner order cannot be followed', () => {
    // The planner put B before A, but B needs A.
    const units = [unit('B', 0, { requisiteGroups: needs('A') }), unit('A', 1)];
    const plan = buildCustomPlan(units, [], 1, 1, 1, [], TWO_A_SEMESTER);
    expect(codesBySemester(plan)).toEqual([['A'], ['B']]);
  });

  it('leaves plans for units with no planner slot exactly as before', () => {
    const units = [unit('P', undefined), unit('Q', undefined, { requisiteGroups: needs('P') }), unit('R', undefined)];
    const withSlots = buildCustomPlan(units, [], 1, 1, 1, [], TWO_A_SEMESTER);
    expect(codesBySemester(withSlots)).toEqual([['P', 'R'], ['Q']]);
  });

  it('units without a slot fill spare room but never displace planned units', () => {
    const units = [unit('A', 0), unit('B', 0), unit('FREE1', undefined), unit('C', 1), unit('D', 1)];
    const plan = buildCustomPlan(units, [], 1, 1, 1, [], TWO_A_SEMESTER);
    expect(codesBySemester(plan)[0]).toEqual(['A', 'B']);
    expect(plan.unschedulableUnits).toEqual([]);
  });
});
