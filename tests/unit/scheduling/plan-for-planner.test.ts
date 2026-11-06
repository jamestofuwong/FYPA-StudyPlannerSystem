import {
  finishPlanForPlanner,
  plannedSlotOf,
  startPlanForPlanner,
  type PlannerPlanInput,
} from '@core/services/scheduling/planForPlanner';
import type { SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler';
import { unitRowToSchedulable, type UnitRow } from '@core/shared/scheduling/schedulableUnit';

const unit = (code: string, category = 'core', terms: number[] = [1, 2], requisiteGroups: SchedulableUnit['requisiteGroups'] = []): SchedulableUnit => ({
  code,
  name: code,
  category,
  offeringSemesters: terms.filter((t): t is 1 | 2 => t === 1 || t === 2),
  allOfferingTerms: terms,
  requisiteGroups,
});

const input = (overrides: Partial<PlannerPlanInput> = {}): PlannerPlanInput => ({
  plannerUnits: [
    { category: 'core', unit: unit('CORE1') },
    { category: 'core', unit: unit('CORE2') },
    { category: 'mpu', unit: unit('MPU1', 'mpu') },
    { category: 'elective', unit: null },
    { category: 'elective', unit: null },
  ],
  electiveCount: null,
  electiveGroups: [[unit('EL1', 'elective'), unit('EL2', 'elective'), unit('EL3', 'elective')]],
  completedUnitCodes: [],
  startYear: 1,
  startSemester: 1,
  intakeSemester: 1,
  ...overrides,
});

const placed = (result: { semesters: { units: { code: string }[] }[] }) =>
  result.semesters.flatMap((s) => s.units.map((u) => u.code)).sort();

describe('startPlanForPlanner', () => {
  test('leaves out completed units', () => {
    const start = startPlanForPlanner(input({ completedUnitCodes: ['core1'] }));
    expect(start.pool.map((u) => u.code)).toEqual(['CORE2']);
  });

  test('leaves MPU units to their own section unless asked to schedule them', () => {
    expect(startPlanForPlanner(input()).pool.map((u) => u.code)).not.toContain('MPU1');
    expect(startPlanForPlanner(input({ scheduleMpu: true })).pool.map((u) => u.code)).toContain('MPU1');
  });

  test('counts a planner\'s empty elective slots when it recorded no requirement', () => {
    expect(startPlanForPlanner(input()).freeElectiveSlots).toBe(2);
  });

  test('uses the recorded elective requirement, less what is done', () => {
    const start = startPlanForPlanner(input({ electiveCount: 3, completedUnitCodes: ['EL1'] }));
    expect(start.freeElectiveSlots).toBe(2);
  });
});

describe('finishPlanForPlanner', () => {
  test('fills the free elective slots from the planner\'s groups, marked as recommendations', () => {
    const planInput = input();
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput));

    expect(finished.recommended.map((u) => u.code)).toEqual(['EL1', 'EL2']);
    expect(finished.recommended.every((u) => u.recommended && u.category === 'elective')).toBe(true);
    expect(placed(finished.result)).toEqual(['CORE1', 'CORE2', 'EL1', 'EL2']);
  });

  test('a swapped-in double major takes slots from the recommended electives', () => {
    const planInput = input();
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput), [
      unit('DM1', 'double_major'),
    ]);

    expect(finished.slotsTaken).toBe(1);
    expect(finished.recommended.map((u) => u.code)).toEqual(['EL1']);
    expect(placed(finished.result)).toEqual(['CORE1', 'CORE2', 'DM1', 'EL1']);
  });

  test('swapped units never take more than the free slots', () => {
    const planInput = input();
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput), [
      unit('DM1', 'double_major'),
      unit('DM2', 'double_major'),
      unit('DM3', 'double_major'),
    ]);

    expect(finished.slotsTaken).toBe(2);
    expect(placed(finished.result)).toEqual(['CORE1', 'CORE2', 'DM1', 'DM2']);
    expect(finished.recommended).toEqual([]);
  });

  test('a unit swapped in twice is placed once', () => {
    const planInput = input();
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput), [
      unit('DM1', 'double_major'),
      unit('DM1', 'minor'),
    ]);

    expect(placed(finished.result).filter((code) => code === 'DM1')).toHaveLength(1);
    expect(finished.slotsTaken).toBe(1);
  });

  test('a unit blocked by a requisite frees its elective slot for a recommendation', () => {
    const blocked = unit('BLOCKED', 'elective', [1, 2], [[{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'NEVER' }]]);
    const planInput = input({
      plannerUnits: [
        { category: 'core', unit: unit('CORE1') },
        { category: 'elective', unit: blocked },
      ],
      electiveCount: 1,
    });

    const start = startPlanForPlanner(planInput);
    expect(start.freeElectiveSlots).toBe(1);
    expect(finishPlanForPlanner(planInput, start).recommended.map((u) => u.code)).toEqual(['EL1']);
  });

  test('a prerequisite can be satisfied by either of its alternatives', () => {
    const needsAorB = unit('NEEDS', 'core', [1, 2], [
      [{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'A' }],
      [{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'B' }],
    ]);
    const planInput = input({
      plannerUnits: [{ category: 'core', unit: needsAorB }],
      completedUnitCodes: ['B'],
    });

    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput));
    expect(placed(finished.result)).toEqual(['NEEDS']);
    expect(finished.result.warnings).toEqual([]);
  });
});

describe('the same planner from either app\'s rows', () => {
  // Both Prisma schemas return units in this shape, so one planner described
  // the way the advisor reads it and the way the student app reads it must give
  // the same plan.
  const row = (unit_code: string, terms: number[], groups: UnitRow['requisite_groups'] = []): UnitRow => ({
    unit_code,
    unit_name: unit_code,
    offerings: terms.map((offered_in) => ({ offered_in })),
    requisite_groups: groups,
  });
  const rows = [
    row('COS10001', [1, 2]),
    row('COS10002', [1], [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'COS10001' } }] }]),
    row('COS20001', [2], [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'COS10002' } }] }]),
  ];

  const planFrom = (withCreditPoints: boolean) => {
    const planInput = input({
      plannerUnits: rows.map((r) => ({
        category: 'core',
        unit: unitRowToSchedulable({ ...r, credit_points: '12.5' }, 'core', { withCreditPoints }),
      })),
      electiveGroups: [],
    });
    return finishPlanForPlanner(planInput, startPlanForPlanner(planInput)).result.semesters.map((s) => ({
      year: s.year,
      semester: s.semester,
      codes: s.units.map((u) => u.code),
    }));
  };

  test('carrying credit points does not move a unit', () => {
    expect(planFrom(true)).toEqual(planFrom(false));
  });

  test('respects prerequisite order and offering terms', () => {
    const order = planFrom(false).flatMap((s) => s.codes);
    expect(order).toEqual(['COS10001', 'COS10002', 'COS20001']);
  });
});

// The plan follows the planner's own order when it is told where the planner puts each row
describe('following the planner\'s order', () => {
  test('plannedSlotOf counts semesters after the intake, and gives summer and winter no slot', () => {
    expect(plannedSlotOf({ yearLevel: 1, semester: 1 })).toBe(0);
    expect(plannedSlotOf({ yearLevel: 1, semester: 2 })).toBe(1);
    expect(plannedSlotOf({ yearLevel: 3, semester: 1 })).toBe(4);
    expect(plannedSlotOf({ yearLevel: 2, semester: 3 })).toBeUndefined();   // a break
    expect(plannedSlotOf({})).toBeUndefined();                              // no placement given
  });

  test('units carry their planner slot into the pool, and are left as they were without one', () => {
    const withSlots = startPlanForPlanner(input({
      plannerUnits: [
        { category: 'core', unit: unit('CORE1'), yearLevel: 1, semester: 2 },
        { category: 'core', unit: unit('CORE2') },
      ],
    }));
    expect(withSlots.pool.find((u) => u.code === 'CORE1')?.plannedSlot).toBe(1);
    expect(withSlots.pool.find((u) => u.code === 'CORE2')?.plannedSlot).toBeUndefined();
  });

  test('recommended electives take the planner\'s latest open elective slots', () => {
    const planInput = input({
      plannerUnits: [
        { category: 'core', unit: unit('CORE1'), yearLevel: 1, semester: 1 },
        { category: 'elective', unit: null, yearLevel: 2, semester: 1 },
        { category: 'elective', unit: null, yearLevel: 2, semester: 2 },
        { category: 'elective', unit: null, yearLevel: 3, semester: 1 },
      ],
    });
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput));
    // three open slots and three to fill, in planner order
    expect(finished.recommended.map((u) => u.plannedSlot)).toEqual([2, 3, 4]);
  });

  test('with fewer to fill than open slots, the later slots are used', () => {
    const planInput = input({
      electiveCount: 1,
      plannerUnits: [
        { category: 'elective', unit: null, yearLevel: 2, semester: 1 },
        { category: 'elective', unit: null, yearLevel: 3, semester: 2 },
      ],
    });
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput));
    expect(finished.recommended.map((u) => u.plannedSlot)).toEqual([5]);
  });

  test('without placements the plan is unchanged and no slot is invented', () => {
    const planInput = input();
    const finished = finishPlanForPlanner(planInput, startPlanForPlanner(planInput));
    expect(finished.recommended.every((u) => u.plannedSlot === undefined)).toBe(true);
  });
});


describe('a plain elective is not compulsory', () => {
  // The planner puts three plain electives in named places and needs three electives in all
  const named = (code: string, year: number, semester: number) => ({ category: 'elective', unit: unit(code, 'elective'), yearLevel: year, semester });
  const planner = (overrides: Partial<PlannerPlanInput> = {}) =>
    input({
      plannerUnits: [
        { category: 'core', unit: unit('CORE1'), yearLevel: 1, semester: 1 },
        named('EL_A', 1, 2), named('EL_B', 2, 1), named('EL_C', 2, 2),
      ],
      electiveCount: 3,
      electiveGroups: [],
      ...overrides,
    });

  test('every named elective is planned while the student has replaced none', () => {
    const start = startPlanForPlanner(planner());
    expect(start.pool.map((u) => u.code).sort()).toEqual(['CORE1', 'EL_A', 'EL_B', 'EL_C']);
    expect(start.droppedElectives).toEqual([]);
    expect(start.freeElectiveSlots).toBe(0);
  });

  test('a unit the student took in place of an elective means the planner does not plan the earliest named one', () => {
    const start = startPlanForPlanner(planner({ completedUnitCodes: ['TOOK_SOMETHING_ELSE'] }));
    expect(start.droppedElectives).toEqual(['EL_A']);
    expect(start.pool.map((u) => u.code)).not.toContain('EL_A');
    expect(start.pool.map((u) => u.code)).toEqual(expect.arrayContaining(['EL_B', 'EL_C']));
    expect(start.freeElectiveSlots).toBe(0);
  });

  test('the same when the planner also has open elective slots: the named one is dropped, the slots are still owed', () => {
    const roomy = planner({
      plannerUnits: [
        { category: 'core', unit: unit('CORE1'), yearLevel: 1, semester: 1 },
        named('EL_A', 1, 2), named('EL_B', 2, 1), named('EL_C', 2, 2),
        { category: 'elective', unit: null, yearLevel: 3, semester: 1 },
        { category: 'elective', unit: null, yearLevel: 3, semester: 2 },
      ],
      electiveCount: 5,
      completedUnitCodes: ['TOOK_SOMETHING_ELSE'],
    });
    const start = startPlanForPlanner(roomy);
    expect(start.droppedElectives).toEqual(['EL_A']);
    // 5 needed, 1 passed, 2 named kept: 2 left for the open slots
    expect(start.freeElectiveSlots).toBe(2);
  });

  test('the final plan then leaves the dropped elective out', () => {
    const input2 = planner({ completedUnitCodes: ['TOOK_SOMETHING_ELSE'] });
    const finished = finishPlanForPlanner(input2, startPlanForPlanner(input2));
    expect(placed(finished.result)).toEqual(['CORE1', 'EL_B', 'EL_C']);
  });

  test('a prescribed elective is never dropped', () => {
    const input2 = planner({
      plannerUnits: [
        { category: 'prescribed_elective', unit: unit('PRES1', 'prescribed_elective'), yearLevel: 1, semester: 1 },
        named('EL_A', 1, 2), named('EL_B', 2, 1),
      ],
      electiveCount: 3,
      completedUnitCodes: ['X1', 'X2', 'X3'],
    });
    const start = startPlanForPlanner(input2);
    expect(start.pool.map((u) => u.code)).toContain('PRES1');
    expect(start.droppedElectives.sort()).toEqual(['EL_A', 'EL_B']);
  });
});

describe('units beyond the free elective slots', () => {
  const extra = (n: number) => Array.from({ length: n }, (_, i) => unit(`EXTRA${i + 1}`, 'double_major'));

  test('are planned after the planner\'s own units, and are not cut off at the free slots', () => {
    const start = startPlanForPlanner(input({ electiveCount: null, plannerUnits: [{ category: 'core', unit: unit('CORE1') }], electiveGroups: [] }));
    expect(start.freeElectiveSlots).toBe(0);
    const finished = finishPlanForPlanner(input({ electiveCount: null, plannerUnits: [{ category: 'core', unit: unit('CORE1') }], electiveGroups: [] }), start, [], extra(6));
    expect(placed(finished.result)).toEqual(['CORE1', 'EXTRA1', 'EXTRA2', 'EXTRA3', 'EXTRA4', 'EXTRA5', 'EXTRA6']);
    expect(finished.slotsTaken).toBe(0);
  });

  test('make the plan longer when they do not fit in the semesters that the planner uses', () => {
    const plain = input({ electiveCount: null, plannerUnits: [{ category: 'core', unit: unit('CORE1') }], electiveGroups: [] });
    const without = finishPlanForPlanner(plain, startPlanForPlanner(plain));
    const withExtra = finishPlanForPlanner(plain, startPlanForPlanner(plain), [], extra(12));
    expect(withExtra.result.semesters.length).toBeGreaterThan(without.result.semesters.length);
    expect(placed(withExtra.result)).toHaveLength(13);
  });

  test('swapped units still take slots first, and only the rest are extra', () => {
    const base = input({ electiveCount: 2, plannerUnits: [{ category: 'core', unit: unit('CORE1') }], electiveGroups: [[unit('EL1', 'elective'), unit('EL2', 'elective')]] });
    const start = startPlanForPlanner(base);
    expect(start.freeElectiveSlots).toBe(2);
    const finished = finishPlanForPlanner(base, start, extra(2), extra(5).slice(2));
    expect(finished.slotsTaken).toBe(2);
    expect(placed(finished.result)).toEqual(['CORE1', 'EXTRA1', 'EXTRA2', 'EXTRA3', 'EXTRA4', 'EXTRA5']);
  });

  test('a unit that is already in the plan, or already passed, is not added again', () => {
    const base = input({ electiveCount: null, plannerUnits: [{ category: 'core', unit: unit('CORE1') }], electiveGroups: [], completedUnitCodes: ['EXTRA2'] });
    const finished = finishPlanForPlanner(base, startPlanForPlanner(base), [], [...extra(3), unit('CORE1', 'double_major')]);
    expect(placed(finished.result)).toEqual(['CORE1', 'EXTRA1', 'EXTRA3']);
  });
});
