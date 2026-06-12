import { buildStudentProfile } from '@core/services/matching/profileBuilder';
import type { RawStudentInput, UnitMasterEntry } from '@shared/types/matching';

describe('ProfileBuilder requisite validation', () => {
  const student: RawStudentInput = {
    studentID: '123',
    courseType: 'degree',
    intakeYear: 2024,
    intakeSemester: 1,
    currentSemester: 1,
    completedUnitCodes: ['UNIT-A', 'UNIT-C'],
    hasWIL: false,
  };
  const masterTable: UnitMasterEntry[] = [
    { 
      code: 'UNIT-A', 
      name: 'Unit A',
      category: 'core', 
      creditHours: 12.5,
      requisites: [
        { type: 'concurrent', unitCode: 'UNIT-B' },
        { type: 'antirequisite', unitCode: 'UNIT-C' }
      ],
      subjectTags: []
    },
    {
      code: 'UNIT-C',
      name: 'Unit C',
      category: 'core',
      creditHours: 12.5,
      requisites: [],
      subjectTags: [],
    },
  ];

  test('detects concurrent and anti-requisite violations', () => {
    const normalised = new Set(['UNIT-A', 'UNIT-C']);
    const profile = buildStudentProfile(student, normalised, masterTable);

    const concurrentFlag = profile.requisiteFlags.find(f => f.requisiteType === 'concurrent');
    const antiFlag = profile.requisiteFlags.find(f => f.requisiteType === 'antirequisite');

    expect(concurrentFlag).toMatchObject({
      unitCode: 'UNIT-A',
      requisiteType: 'concurrent',
      relatedUnit: 'UNIT-B',
    });
    expect(antiFlag).toMatchObject({
      unitCode: 'UNIT-A',
      requisiteType: 'antirequisite',
      relatedUnit: 'UNIT-C',
      issue: expect.stringContaining('both cannot be counted'),
    });
  });

  test('logs the exact unknown unit code', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    buildStudentProfile(student, new Set(['GHOST-101']), []);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('excluded from scoring'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GHOST-101'));

    warnSpy.mockRestore();
  });
});
