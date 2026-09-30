import { buildExcelRows, excelCategoryFillHex } from '@/app/(pages)/pathway/page';
import type { CustomSemesterBucket } from '@core/services/scheduling/customPlannerScheduler';

// Pure data-construction tests: check the row array the code builds,
// not the xlsx binary itself.

const unit = (code: string, name: string, category: string) => ({
  code, name, category, offeringSemesters: [1, 2] as (1 | 2)[], requisiteGroups: [],
});

describe('buildExcelRows — one row per unit, correctly labelled', () => {
  test('a regular semester unit gets Year/Semester/Term/Category from its slot', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [unit('CORE1', 'Core Unit', 'core') as any] },
      { year: 1, semester: 2, units: [unit('MAJ1', 'Major Unit', 'major_core') as any] },
    ];

    const rows = buildExcelRows(semesters, 1, null, null, []);

    expect(rows).toEqual([
      { year: 1, semester: 1, term: 'Feb/Mar', code: 'CORE1', name: 'Core Unit', category: 'core', categoryLabel: 'Core' },
      { year: 1, semester: 2, term: 'Aug/Sept', code: 'MAJ1', name: 'Major Unit', category: 'major_core', categoryLabel: 'Major Core' },
    ]);
  });

  test('an ELECTIVE placeholder is labelled Elective regardless of its raw category', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [unit('ELECTIVE', 'Elective Slot', 'elective') as any] },
    ];
    const rows = buildExcelRows(semesters, 1, null, null, []);
    expect(rows[0].categoryLabel).toBe('Elective');
  });

  test('a WIL break-milestone unit gets Term "Winter" or "Summer", not a regular semester term', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 2, semester: 1, units: [unit('CORE1', 'Core Unit', 'core') as any] },
    ];
    const primaryMilestone = {
      unitCode: 'ICT20016*Optional', unitName: 'WIL Placement', insertBeforeSlotKey: '2-1',
      availableBreakSlots: [{ slotKey: '2-1', termType: 'winter' }],
    };

    const rows = buildExcelRows(semesters, 1, primaryMilestone, '2-1', []);

    const wilRow = rows.find((r) => r.code === 'ICT20016*Optional');
    expect(wilRow).toMatchObject({ year: 2, semester: 1, term: 'Winter', category: 'wil' });

    // Summer case
    const summerMilestone = {
      ...primaryMilestone,
      availableBreakSlots: [{ slotKey: '2-1', termType: 'summer' }],
    };
    const summerRows = buildExcelRows(semesters, 1, summerMilestone, '2-1', []);
    expect(summerRows.find((r) => r.code === 'ICT20016*Optional')?.term).toBe('Summer');
  });

  test('an MPU unit still inside a semester (defensive case) is not dropped, and gets Term "Any"', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [unit('CORE1', 'Core Unit', 'core') as any, unit('MPU101', 'General Studies', 'mpu') as any] },
    ];
    const rows = buildExcelRows(semesters, 1, null, null, []);
    expect(rows).toHaveLength(2);
    const mpuRow = rows.find((r) => r.code === 'MPU101');
    expect(mpuRow).toMatchObject({ year: 1, semester: 1, term: 'Any', category: 'mpu', categoryLabel: 'MPU' });
  });

  test('the remaining/incomplete MPU list is appended with blank Year/Semester and Term "Any"', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [unit('CORE1', 'Core Unit', 'core') as any] },
    ];
    const remainingMpus = [{ code: 'MPU201', name: 'Ethics and Civilisation' }];

    const rows = buildExcelRows(semesters, 1, null, null, remainingMpus);

    const remaining = rows.find((r) => r.code === 'MPU201');
    expect(remaining).toEqual({
      year: '', semester: '', term: 'Any', code: 'MPU201', name: 'Ethics and Civilisation',
      category: 'mpu', categoryLabel: 'MPU',
    });
  });
});

describe('excelCategoryFillHex — matches Primitives.module.css / Primitives.tsx exactly', () => {
  test.each([
    ['core', '569CD6'],       // .badgeBlue   rgba(86,156,214,...)
    ['major_core', 'DCDCAA'], // .badgeYellow rgba(220,220,170,...)
    ['mpu', 'F48771'],        // .badgeRed    rgba(244,135,113,...)
    ['wil', 'C586C0'],        // badgePurple inline style rgba(197,134,192,...)
    ['prescribed_elective', '4EC9B0'], // .badgeGreen rgba(78,201,176,...)
    ['elective', '4EC9B0'],
    ['double_major', '4EC9B0'],
    ['minor', '4EC9B0'],
  ])('%s -> %s', (category, hex) => {
    expect(excelCategoryFillHex(category)).toBe(hex);
  });
});
