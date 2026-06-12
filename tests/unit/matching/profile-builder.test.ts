import { buildStudentProfile } from '@core/services/matching/profileBuilder';
import type { RawStudentInput, UnitMasterEntry } from '@shared/types/matching';

describe('ProfileBuilder categorization', () => {
  const student: RawStudentInput = {
    studentID: 'S001',
    courseType: 'degree',
    intakeYear: 2024,
    intakeSemester: 1,
    currentSemester: 1,
    completedUnitCodes: [],
    hasWIL: false,
  };

  test('categorizes completed units and indexes elective subject tags', () => {
    const masterTable: UnitMasterEntry[] = [
      {
        code: 'CORE1',
        name: 'Core Unit',
        category: 'core',
        creditHours: 12.5,
        subjectTags: [],
        offeringSemesters: [1, 2],
        requisites: [],
      },
      {
        code: 'ELECT1',
        name: 'Elective Unit',
        category: 'freeElective',
        creditHours: 12.5,
        subjectTags: ['AI'],
        offeringSemesters: [1, 2],
        requisites: [],
      },
    ];

    const profile = buildStudentProfile(student, new Set(['CORE1', 'ELECT1']), masterTable);

    expect([...profile.completedCore]).toEqual(['CORE1']);
    expect([...profile.completedFreeElectives]).toEqual(['ELECT1']);
    expect([...profile.electivesByTag.get('AI') ?? []]).toEqual(['ELECT1']);
    expect(profile.unclassifiedUnits).toEqual([]);
  });

  test('records unknown units without adding them to a scoring category', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const profile = buildStudentProfile(student, new Set(['UNKNOWN']), []);

    expect(profile.unclassifiedUnits).toEqual(['UNKNOWN']);
    expect(profile.completedUnits).toEqual(new Set(['UNKNOWN']));
    expect(profile.completedCore).toEqual(new Set());
    expect(profile.completedMajorCore).toEqual(new Set());
    expect(profile.completedPrescribed).toEqual(new Set());
    expect(profile.completedFreeElectives).toEqual(new Set());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN'));

    warnSpy.mockRestore();
  });
});
