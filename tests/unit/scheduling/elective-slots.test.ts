import {
  blockedByRequisites,
  countElectiveSlotsNeeded,
  recommendElectives,
} from '@core/shared/scheduling/electiveSlots';
import type {
  CustomPlanResult,
  PlanWarning,
  SchedulableUnit,
} from '@core/services/scheduling/customPlannerScheduler';

function unit(code: string, overrides: Partial<SchedulableUnit> = {}): SchedulableUnit {
  return {
    code,
    name: `Unit ${code}`,
    category: 'elective',
    offeringSemesters: [1, 2],
    allOfferingTerms: [1, 2],
    requisiteGroups: [],
    ...overrides,
  };
}

const prereq = (code: string) => ({
  type: 'unit' as const,
  unitCode: code,
  requisiteType: 'prerequisite' as const,
});

const codesOf = (units: SchedulableUnit[]) => units.map((u) => u.code);

describe('recommendElectives', () => {
  test('returns nothing when no slots are empty', () => {
    const input = {
      candidateSources: [[unit('E1'), unit('E2')]],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    };

    expect(recommendElectives({ ...input, needed: 0 })).toEqual([]);
    expect(recommendElectives({ ...input, needed: -3 })).toEqual([]);
  });

  test('returns at most the number of slots needed', () => {
    const result = recommendElectives({
      needed: 2,
      candidateSources: [[unit('E1'), unit('E2'), unit('E3'), unit('E4')]],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    });

    expect(codesOf(result)).toEqual(['E1', 'E2']);
  });

  test('skips units already completed or already in the pool, matching on code case and spacing', () => {
    const result = recommendElectives({
      needed: 4,
      candidateSources: [[unit('E1'), unit('E2'), unit('E3'), unit('E4')]],
      completedUnitCodes: ['e1'],
      alreadyPlannedCodes: [' E2 '],
    });

    expect(codesOf(result)).toEqual(['E3', 'E4']);
  });

  test('never returns the same unit twice across sources', () => {
    const result = recommendElectives({
      needed: 4,
      candidateSources: [
        [unit('E1'), unit('E2')],
        [unit('E2'), unit('E3')],
      ],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    });

    expect(codesOf(result)).toEqual(['E1', 'E2', 'E3']);
  });

  test('takes an earlier source first, even where a later one ranks better', () => {
    const result = recommendElectives({
      needed: 1,
      candidateSources: [
        // Summer only and an unmet prerequisite, the worst a candidate can rank
        [unit('SECOND_MAJOR', { offeringSemesters: [], allOfferingTerms: [3], requisiteGroups: [[prereq('NOPE')]] })],
        [unit('PLAIN')],
      ],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    });

    expect(codesOf(result)).toEqual(['SECOND_MAJOR']);
  });

  test('within a source, prefers a unit offered in a normal semester over a summer/winter-only one', () => {
    const result = recommendElectives({
      needed: 3,
      candidateSources: [
        [
          unit('WINTER', { offeringSemesters: [], allOfferingTerms: [4] }),
          unit('SUMMER', { offeringSemesters: [], allOfferingTerms: [3] }),
          unit('SEM2', { offeringSemesters: [2], allOfferingTerms: [2, 3] }),
          // No offering data at all is unrestricted, not short-term only
          unit('UNKNOWN', { offeringSemesters: [], allOfferingTerms: [] }),
        ],
      ],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    });

    expect(codesOf(result)).toEqual(['SEM2', 'UNKNOWN', 'WINTER']);
  });

  test('within a source, prefers a unit whose prerequisites are completed or in the pool', () => {
    const result = recommendElectives({
      needed: 3,
      candidateSources: [
        [
          unit('BLOCKED', { requisiteGroups: [[prereq('NEVER')]] }),
          unit('FROM_POOL', { requisiteGroups: [[prereq('IN_POOL')]] }),
          unit('FROM_TRANSCRIPT', { requisiteGroups: [[prereq('PASSED')]] }),
        ],
      ],
      completedUnitCodes: ['PASSED'],
      alreadyPlannedCodes: ['IN_POOL'],
    });

    expect(codesOf(result)).toEqual(['FROM_POOL', 'FROM_TRANSCRIPT', 'BLOCKED']);
  });

  test('ranks an antirequisite the student already holds below a clean candidate', () => {
    const result = recommendElectives({
      needed: 2,
      candidateSources: [
        [
          unit('CLASHES', {
            requisiteGroups: [[{ type: 'unit', unitCode: 'OLD', requisiteType: 'antirequisite' }]],
          }),
          unit('CLEAN'),
        ],
      ],
      completedUnitCodes: ['OLD'],
      alreadyPlannedCodes: [],
    });

    expect(codesOf(result)).toEqual(['CLEAN', 'CLASHES']);
  });

  test('is deterministic: equally ranked units keep the order the source listed them in', () => {
    const source = [unit('E3'), unit('E1'), unit('E2')];
    const call = () =>
      recommendElectives({
        needed: 3,
        candidateSources: [source],
        completedUnitCodes: [],
        alreadyPlannedCodes: [],
      });

    expect(codesOf(call())).toEqual(['E3', 'E1', 'E2']);
    expect(codesOf(call())).toEqual(codesOf(call()));
  });

  test('never invents a unit: runs short rather than filling every slot', () => {
    const result = recommendElectives({
      needed: 5,
      candidateSources: [[unit('E1')], [unit('E2')]],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    });

    expect(codesOf(result)).toEqual(['E1', 'E2']);
  });

  test('returns the candidate objects untouched, leaving the category to the caller', () => {
    const candidate = unit('E1', { category: 'major_core' });

    const [result] = recommendElectives({
      needed: 1,
      candidateSources: [[candidate]],
      completedUnitCodes: [],
      alreadyPlannedCodes: [],
    });

    expect(result).toBe(candidate);
    expect(result.category).toBe('major_core');
  });

  test('handles a planner with no elective groups at all', () => {
    expect(
      recommendElectives({
        needed: 4,
        candidateSources: [],
        completedUnitCodes: [],
        alreadyPlannedCodes: [],
      }),
    ).toEqual([]);
  });
});

describe('blockedByRequisites', () => {
  const planResult = (
    unschedulable: string[],
    warnings: PlanWarning[],
  ): CustomPlanResult => ({
    semesters: [],
    unschedulableUnits: unschedulable.map((code) => ({
      code,
      name: `Unit ${code}`,
      category: 'elective',
    })),
    warnings,
  });

  test('reports a unit held back by a requisite it can never satisfy', () => {
    const result = planResult(
      ['COS30015'],
      [{ kind: 'requisite_violation', unitCode: 'COS30015', missing: ['TNE10006'], concededPass: ['TNE10006'] }],
    );

    expect(blockedByRequisites(result)).toEqual(['COS30015']);
  });

  test('ignores the reasons that say nothing about requisites', () => {
    const result = planResult(
      ['MPU3212', 'LATE'],
      [
        { kind: 'short_term_only', unitCode: 'MPU3212', offeringTerms: [3, 4] },
        { kind: 'budget_exhausted', unitCodes: ['LATE'] },
      ],
    );

    expect(blockedByRequisites(result)).toEqual([]);
  });

  test('ignores a requisite warning about a unit the plan did place', () => {
    const result = planResult(
      [],
      [{ kind: 'requisite_violation', unitCode: 'ADV', missing: ['INTRO'] }],
    );

    expect(blockedByRequisites(result)).toEqual([]);
  });
});

// Modelled on BA-CS Artificial Intelligence, September 2023: elective_count 8,
// four named prescribed electives and four empty slots, with an elective group
// the student can also take electives from.
describe('countElectiveSlotsNeeded', () => {
  const PLANNER_UNITS = [
    { category: 'core', unitCode: 'COS10009' },
    { category: 'prescribed_elective', unitCode: 'COS10003' },
    { category: 'prescribed_elective', unitCode: 'COS30015' },
    { category: 'prescribed_elective', unitCode: 'COS10022' },
    { category: 'prescribed_elective', unitCode: 'SWE30009' },
    { category: 'elective', unitCode: null },
    { category: 'elective', unitCode: null },
    { category: 'elective', unitCode: null },
    { category: 'elective', unitCode: null },
  ];
  // COS10022 is both named on the planner and offered by the group
  const GROUP_CODES = ['COS30045', 'COS20083', 'COS10022', 'COS20028'];

  const baseline = {
    electiveCount: 8,
    plannerUnits: PLANNER_UNITS,
    electiveGroupCodes: GROUP_CODES,
    completedUnitCodes: [] as string[],
    pool: [
      { code: 'COS10009', category: 'core' },
      { code: 'COS10003', category: 'prescribed_elective' },
      { code: 'COS30015', category: 'prescribed_elective' },
      { code: 'COS10022', category: 'prescribed_elective' },
      { code: 'SWE30009', category: 'prescribed_elective' },
    ],
  };

  test('counts the empty slots when nothing is completed', () => {
    expect(countElectiveSlotsNeeded(baseline)).toBe(4);
  });

  test('a completed unit the planner names reduces what is needed', () => {
    expect(
      countElectiveSlotsNeeded({
        ...baseline,
        completedUnitCodes: ['COS10003'],
        pool: baseline.pool.filter((u) => u.code !== 'COS10003'),
      }),
    ).toBe(4);
  });

  test('a completed unit from the elective group counts as a completed elective', () => {
    // COS30045 is a group candidate, never a named planner unit, so it is not in
    // the pool either way. Passing it has to move the count on its own.
    expect(countElectiveSlotsNeeded({ ...baseline, completedUnitCodes: ['COS30045'] })).toBe(3);
  });

  test('matches the elective group on code case and spacing', () => {
    expect(countElectiveSlotsNeeded({ ...baseline, completedUnitCodes: [' cos30045 '] })).toBe(3);
  });

  test('a unit both named on the planner and in the group is counted once', () => {
    expect(
      countElectiveSlotsNeeded({
        ...baseline,
        completedUnitCodes: ['COS10022'],
        pool: baseline.pool.filter((u) => u.code !== 'COS10022'),
      }),
    ).toBe(4);
  });

  test('a completed unit in neither the planner nor its groups counts toward nothing', () => {
    expect(countElectiveSlotsNeeded({ ...baseline, completedUnitCodes: ['XFER100'] })).toBe(4);
  });

  test('a pooled elective blocked by a requisite does not reduce what is needed', () => {
    expect(countElectiveSlotsNeeded({ ...baseline, blockedUnitCodes: ['COS30015'] })).toBe(5);
  });

  test('a pooled elective left out for any other reason still fills its slot', () => {
    // short_term_only and budget_exhausted never reach blockedUnitCodes, so an
    // empty list is what those cases look like here
    expect(countElectiveSlotsNeeded({ ...baseline, blockedUnitCodes: [] })).toBe(4);
  });

  test('a blocked unit outside the elective categories changes nothing', () => {
    expect(countElectiveSlotsNeeded({ ...baseline, blockedUnitCodes: ['COS10009'] })).toBe(4);
  });

  test('the test student: one named elective passed, one group elective passed, one pooled elective blocked', () => {
    expect(
      countElectiveSlotsNeeded({
        ...baseline,
        completedUnitCodes: ['COS10003', 'COS30045'],
        pool: baseline.pool.filter((u) => u.code !== 'COS10003'),
        blockedUnitCodes: ['COS30015'],
      }),
    ).toBe(4);
  });

  test('falls back to the planner\'s own empty slots when no count was recorded', () => {
    expect(
      countElectiveSlotsNeeded({
        ...baseline,
        electiveCount: null,
        completedUnitCodes: ['COS10003', 'COS30045'],
        blockedUnitCodes: ['COS30015'],
      }),
    ).toBe(4);
  });
});