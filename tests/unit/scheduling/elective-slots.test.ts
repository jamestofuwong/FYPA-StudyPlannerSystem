import { recommendElectives } from '@core/shared/scheduling/electiveSlots';
import type { SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler';

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