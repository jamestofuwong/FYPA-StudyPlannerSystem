// ============================================================
// Tests for core/services/matching/plannerTemplateBuilder.ts.
// Unlike unitMasterTableBuilder.ts, this mapping was not broken, it was lifted verbatim from web/app/api/match/route.ts so /api/match and
// class estimation stay consistent with each other. These tests mostly exist to lock that mapping in place so a future edit can't quietly
// change what "core", "major core", "prescribed", and "free elective" mean to the matching pipeline.
// ============================================================

import { buildPlannerTemplatesForMatching } from '@core/services/matching/plannerTemplateBuilder';

// A minimal DB planner shape, matching what plannerRepository.getAllPlannersWithUnits() returns.
function dbPlanner(overrides: any = {}) {
  return {
    id: 'p1',
    major: { name: 'Computer Science' },
    intake_year: 2024,
    intake_month: 2,
    course_type: 'bachelor',
    duration_semesters: 6,
    units: [],
    elective_groups: [],
    ...overrides,
  };
}

describe('buildPlannerTemplatesForMatching', () => {
  // core and major_core TemplateUnit rows become individually-required codes. 
  // elective rows WITH a year/semester slot become the free elective pool.
  test('maps core, major_core, and slotted elective TemplateUnit rows', () => {
    const [planner] = buildPlannerTemplatesForMatching([
      dbPlanner({
        units: [
          { unit: { unit_code: 'COS10009' }, category: 'core' },
          { unit: { unit_code: 'COS20015' }, category: 'major_core' },
          { unit: { unit_code: 'COS30001' }, category: 'elective' },
        ],
      }),
    ] as never);

    expect(planner.requiredCore).toEqual(['COS10009']);
    expect(planner.requiredMajorCore).toEqual(new Set(['COS20015']));
    expect(planner.freeElectivePool).toEqual(new Set(['COS30001']));
    expect(planner.freeElectiveSlotsRequired).toBe(1);
  });

  // "Prescribed elective" in the matching pipeline's sense is the DB's unslotted elective pool (ElectiveGroup/ElectiveGroupUnit), one
  // category per group, each worth 1 slot.
  test('builds prescribedElectiveCategories from elective_groups, one category per group, 1 slot each', () => {
    const [planner] = buildPlannerTemplatesForMatching([
      dbPlanner({
        elective_groups: [
          { id: 'eg1', units: [{ unit: { unit_code: 'COS40006' } }, { unit: { unit_code: 'COS40007' } }] },
        ],
      }),
    ] as never);

    expect(planner.prescribedElectiveCategories).toEqual([
      { categoryCode: 'eg1', pool: new Set(['COS40006', 'COS40007']), slots: 1 },
    ]);
  });

  // There's no stored semester field on PlannerTemplate, intakeSemester
  // is derived from intake_month instead: July or later counts as a Semester 2 intake.
  test('derives intakeSemester from intake_month, July or later is semester 2', () => {
    const [feb, aug] = buildPlannerTemplatesForMatching([
      dbPlanner({ id: 'p-feb', intake_month: 2 }),
      dbPlanner({ id: 'p-aug', intake_month: 8 }),
    ] as never);

    expect(feb.intakeSemester).toBe(1);
    expect(aug.intakeSemester).toBe(2);
  });

  // Matches the same "degree" fallback RawStudentInput uses elsewhere
  // (web/app/api/match/route.ts), so a missing course_type never breaks the pipeline.
  test('falls back to courseType "degree" when course_type is missing', () => {
    const [planner] = buildPlannerTemplatesForMatching([dbPlanner({ course_type: null })] as never);
    expect(planner.courseType).toBe('degree');
  });

  // "Empty elective slot" TemplateUnit rows (a slot with no unit chosen yet) have unit: null. They should be silently skipped, 
  // not crash the mapping or show up as a phantom required unit.
  test('ignores TemplateUnit rows with no linked unit', () => {
    const [planner] = buildPlannerTemplatesForMatching([
      dbPlanner({ units: [{ unit: null, category: 'core' }] }),
    ] as never);
    expect(planner.requiredCore).toEqual([]);
  });
});
