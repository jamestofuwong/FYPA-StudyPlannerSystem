// ============================================================
// Tests for core/services/matching/unitMasterTableBuilder.ts.
// This builder replaced the placeholder unitMasterTable construction that used to live inline in web/app/api/match/route.ts (empty name,
// flat 12.5 creditHours hardcoded, requisites always []). These tests mock the two repositories it reads from (unitRepository,
// plannerRepository) so no real database is needed.
// ============================================================

import { buildUnitMasterTable, toMatchingCategory } from '@core/services/matching/unitMasterTableBuilder';
import * as unitRepository from '@core/db/repositories/unitRepository';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/unitRepository');
jest.mock('@core/db/repositories/plannerRepository');

const getAllUnits = jest.mocked(unitRepository.getAllUnits);
const getAllPlannersWithUnits = jest.mocked(plannerRepository.getAllPlannersWithUnits);

// toMatchingCategory converts the DB's snake_case unit_category enum into the matching pipeline's camelCase UnitCategory type.
describe('toMatchingCategory', () => {
  test.each([
    ['core', 'core'],
    ['major_core', 'majorCore'],
    ['prescribed_elective', 'prescribed'],
    ['elective', 'freeElective'],
    ['wil', 'WIL'],
  ])('%s maps to %s', (dbCategory, expected) => {
    expect(toMatchingCategory(dbCategory)).toBe(expected);
  });

  // mpu units are never scored by the matching pipeline, so they should never make it into the unitMasterTable at all.
  test('unknown categories (mpu, etc) map to null', () => {
    expect(toMatchingCategory('mpu')).toBeNull();
    expect(toMatchingCategory('anything-else')).toBeNull();
  });
});

describe('buildUnitMasterTable', () => {
  beforeEach(() => jest.clearAllMocks());

  // This is the core fix this file exists for: name, offerings, and requisites should all be real values pulled from the DB, not the old
  // hardcoded placeholders.
  test('builds a real entry with name, offerings, and a flattened requisite', async () => {
    getAllUnits.mockResolvedValue([
      {
        id: 'u1', unit_code: 'COS10009', unit_name: 'Introduction to Programming',
        offerings: [1, 2],
        prerequisite: '',
        requisites: [
          {
            conditions: [
              { type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'COS10001' } },
              { type: 'credit_points', requisite_type: null, unit: null },
            ],
          },
        ],
      },
    ] as never);

    getAllPlannersWithUnits.mockResolvedValue([
      { id: 'p1', units: [{ unit: { unit_code: 'COS10009' }, category: 'core' }] },
    ] as never);

    const table = await buildUnitMasterTable();

    expect(table).toEqual([
      {
        code: 'COS10009',
        name: 'Introduction to Programming',
        category: 'core',
        creditHours: 12.5,
        subjectTags: [],
        offeringSemesters: [1, 2],
        requisites: [{ type: 'prerequisite', unitCode: 'COS10001' }],
      },
    ]);
  });

  // The DB uses "corequisite", the matching domain's Requisite type uses "concurrent" for the same concept, see toMatchingRequisiteType().
  test('translates corequisite to concurrent', async () => {
    getAllUnits.mockResolvedValue([
      {
        id: 'u1', unit_code: 'COS20015', unit_name: 'Databases', offerings: [], prerequisite: '',
        requisites: [{ conditions: [{ type: 'unit', requisite_type: 'corequisite', unit: { unit_code: 'COS20005' } }] }],
      },
    ] as never);
    getAllPlannersWithUnits.mockResolvedValue([
      { id: 'p1', units: [{ unit: { unit_code: 'COS20015' }, category: 'major_core' }] },
    ] as never);

    const [entry] = await buildUnitMasterTable();
    expect(entry.requisites).toEqual([{ type: 'concurrent', unitCode: 'COS20005' }]);
  });

  // A unit sitting in the global Unit catalogue but never attached to any planner has no category to resolve, so it can't be scored and should
  // be left out entirely rather than included with a guessed category.
  test('excludes units not placed in any planner', async () => {
    getAllUnits.mockResolvedValue([
      { id: 'u1', unit_code: 'ORPHAN', unit_name: 'Orphan Unit', offerings: [], prerequisite: '', requisites: [] },
    ] as never);
    getAllPlannersWithUnits.mockResolvedValue([] as never);

    expect(await buildUnitMasterTable()).toEqual([]);
  });

  test('excludes mpu units', async () => {
    getAllUnits.mockResolvedValue([
      { id: 'u1', unit_code: 'MPU001', unit_name: 'MPU Unit', offerings: [], prerequisite: '', requisites: [] },
    ] as never);
    getAllPlannersWithUnits.mockResolvedValue([
      { id: 'p1', units: [{ unit: { unit_code: 'MPU001' }, category: 'mpu' }] },
    ] as never);

    expect(await buildUnitMasterTable()).toEqual([]);
  });

  // CATEGORY_PRIORITY decides the winner when the same unit is core in one
  // planner and an elective in another, major_core (5) beats elective (2).
  test('resolves category by highest priority when a unit appears in multiple planners', async () => {
    getAllUnits.mockResolvedValue([
      { id: 'u1', unit_code: 'COS30018', unit_name: 'Shared Unit', offerings: [], prerequisite: '', requisites: [] },
    ] as never);
    getAllPlannersWithUnits.mockResolvedValue([
      { id: 'p1', units: [{ unit: { unit_code: 'COS30018' }, category: 'elective' }] },
      { id: 'p2', units: [{ unit: { unit_code: 'COS30018' }, category: 'major_core' }] },
    ] as never);

    const [entry] = await buildUnitMasterTable();
    expect(entry.category).toBe('majorCore');
  });

  // UnitMasterEntry.offeringSemesters is typed (1 | 2)[], summer/winter
  // terms (3, 4) exist in the DB but have no place in that narrower type.
  test('offeringSemesters keeps only terms 1 and 2, dropping summer/winter codes', async () => {
    getAllUnits.mockResolvedValue([
      { id: 'u1', unit_code: 'COS10009', unit_name: 'X', offerings: [1, 2, 3, 4], prerequisite: '', requisites: [] },
    ] as never);
    getAllPlannersWithUnits.mockResolvedValue([
      { id: 'p1', units: [{ unit: { unit_code: 'COS10009' }, category: 'core' }] },
    ] as never);

    const [entry] = await buildUnitMasterTable();
    expect(entry.offeringSemesters).toEqual([1, 2]);
  });
});
