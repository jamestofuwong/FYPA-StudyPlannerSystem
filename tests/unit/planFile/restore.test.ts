import { overlayRestoredArrangement, type RestoreLookupSources } from '@core/shared/planFile/restore';
import { buildPlanPayload, type BuildPlanPayloadInput } from '@core/shared/planFile';

const schedulableUnit = (code: string, name: string, category: string) => ({
  code, name, category, offeringSemesters: [1, 2] as (1 | 2)[], requisiteGroups: [],
});

const emptySources: RestoreLookupSources = {
  units: [], mpuUnits: [], electiveCandidates: [], completedUnits: [], outsidePlannerUnits: [],
};

const basePayloadInput: BuildPlanPayloadInput = {
  planner: { courseCode: 'BA-CS', courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9 },
  completedUnitCodes: [],
  concededPassUnitCodes: [],
  arrangement: [],
  outsidePlannerUnitCodes: [],
  minorNames: [],
  doubleMajorMajorName: null,
  customWilSlot: null,
  customMpuList: [],
  startYear: 2023,
  startSemester: 2,
};

describe('overlayRestoredArrangement', () => {
  test('rebuilds semesters, preserving position order within each semester', () => {
    const payload = buildPlanPayload({
      ...basePayloadInput,
      arrangement: [
        { code: 'B', category: 'core', year: 1, semester: 1, position: 1, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
        { code: 'A', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      ],
    });
    const sources: RestoreLookupSources = { ...emptySources, units: [schedulableUnit('A', 'Unit A', 'core'), schedulableUnit('B', 'Unit B', 'core')] };

    const result = overlayRestoredArrangement(payload, sources);
    expect(result.semesters).toEqual([
      { year: 1, semester: 1, units: [
        { code: 'A', name: 'Unit A', category: 'core' },
        { code: 'B', name: 'Unit B', category: 'core' },
      ] },
    ]);
    expect(result.restoredUnitCount).toBe(2);
    expect(result.restoredSemesterCount).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  test('sorts semesters by year then semester', () => {
    const payload = buildPlanPayload({
      ...basePayloadInput,
      arrangement: [
        { code: 'LATE', category: 'core', year: 2, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
        { code: 'EARLY', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
        { code: 'MID', category: 'core', year: 1, semester: 2, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      ],
    });
    const sources: RestoreLookupSources = { ...emptySources, units: [schedulableUnit('LATE', 'Late', 'core'), schedulableUnit('EARLY', 'Early', 'core'), schedulableUnit('MID', 'Mid', 'core')] };

    const result = overlayRestoredArrangement(payload, sources);
    expect(result.semesters.map((s) => [s.year, s.semester])).toEqual([[1, 1], [1, 2], [2, 1]]);
  });

  test('carries recommended and outsidePlanner flags onto the rebuilt unit, omitting false ones', () => {
    const payload = buildPlanPayload({
      ...basePayloadInput,
      arrangement: [
        { code: 'REC1', category: 'elective', year: 1, semester: 1, position: 0, recommended: true, outsidePlanner: false, retake: false, concededPassRetake: false },
        { code: 'OUT1', category: 'elective', year: 1, semester: 1, position: 1, recommended: false, outsidePlanner: true, retake: false, concededPassRetake: false },
      ],
    });
    const sources: RestoreLookupSources = { ...emptySources, electiveCandidates: [schedulableUnit('REC1', 'Recommended Unit', 'elective')], outsidePlannerUnits: [schedulableUnit('OUT1', 'Outside Unit', 'elective')] };

    const result = overlayRestoredArrangement(payload, sources);
    expect(result.semesters[0].units[0]).toEqual({ code: 'REC1', name: 'Recommended Unit', category: 'elective', recommended: true });
    expect(result.semesters[0].units[1]).toEqual({ code: 'OUT1', name: 'Outside Unit', category: 'elective', outsidePlanner: true });
  });

  test('a unit code resolving against nothing available is dropped and reported, not thrown', () => {
    const payload = buildPlanPayload({
      ...basePayloadInput,
      arrangement: [
        { code: 'GHOST', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
        { code: 'REAL1', category: 'core', year: 1, semester: 1, position: 1, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      ],
    });
    const sources: RestoreLookupSources = { ...emptySources, units: [schedulableUnit('REAL1', 'Real Unit', 'core')] };

    const result = overlayRestoredArrangement(payload, sources);
    expect(result.semesters[0].units).toEqual([{ code: 'REAL1', name: 'Real Unit', category: 'core' }]);
    expect(result.restoredUnitCount).toBe(1);
    expect(result.skipped).toEqual([{ code: 'GHOST', reason: expect.any(String) }]);
  });

  test('looks up a code across units/mpuUnits/electiveCandidates/completedUnits/outsidePlannerUnits, in that priority order', () => {
    const payload = buildPlanPayload({
      ...basePayloadInput,
      arrangement: [
        { code: 'DUP', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      ],
    });
    // Same code in two sources; electiveCandidates wins per the priority order.
    const sources: RestoreLookupSources = {
      ...emptySources,
      units: [schedulableUnit('DUP', 'From units', 'core')],
      electiveCandidates: [schedulableUnit('DUP', 'From electiveCandidates', 'elective')],
    };
    const result = overlayRestoredArrangement(payload, sources);
    expect(result.semesters[0].units[0].name).toBe('From electiveCandidates');
  });

  test('an empty arrangement produces zero semesters, not a crash', () => {
    const payload = buildPlanPayload(basePayloadInput);
    const result = overlayRestoredArrangement(payload, emptySources);
    expect(result.semesters).toEqual([]);
    expect(result.restoredUnitCount).toBe(0);
    expect(result.restoredSemesterCount).toBe(0);
  });
});
