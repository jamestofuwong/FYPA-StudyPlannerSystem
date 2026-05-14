import { buildStudentProfile } from '@core/services/matching/profileBuilder';

describe('ProfileBuilder: Requisite Logic (Lines 141-173)', () => {
  const masterTable = [
    { 
      code: 'UNIT-A', 
      category: 'core', 
      requisites: [
        { type: 'concurrent', unitCode: 'UNIT-B' },
        { type: 'antirequisite', unitCode: 'UNIT-C' }
      ],
      subjectTags: []
    },
    { code: 'UNIT-C', category: 'core', requisites: [], subjectTags: [] }
  ];

  test('detects concurrent and anti-requisite violations', () => {
    // Student took UNIT-A but NOT UNIT-B (concurrent violation)
    // Student took UNIT-A AND UNIT-C (anti-requisite violation)
    const normalised = new Set(['UNIT-A', 'UNIT-C']);
    const profile = buildStudentProfile({ studentID: '123' } as any, normalised, masterTable as any);

    const concurrentFlag = profile.requisiteFlags.find(f => f.requisiteType === 'concurrent');
    const antiFlag = profile.requisiteFlags.find(f => f.requisiteType === 'antirequisite');

    expect(concurrentFlag).toBeDefined();
    expect(antiFlag).toBeDefined();
    expect(antiFlag?.issue).toContain('both cannot be counted');
  });

  test('logs warning for units missing from master table (Line 75)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    buildStudentProfile({} as any, new Set(['GHOST-101']), []);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('excluded from scoring'));
    warnSpy.mockRestore();
  });
});