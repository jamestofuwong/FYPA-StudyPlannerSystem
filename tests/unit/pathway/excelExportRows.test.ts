import { buildExcelRows, excelCategoryFillHex, excelCellFillHex, EXCEL_NEUTRAL_FILL_HEX, computeExcelMergeRanges, type ExcelPlanRow } from '@/app/(pages)/pathway/page';
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

describe('excelCellFillHex — Year/Semester/Term are neutral, Unit Code/Name/Category are category-coloured', () => {
  test.each([0, 1, 2])('column %i (Year/Semester/Term) is neutral grey regardless of category', (col) => {
    for (const category of ['core', 'major_core', 'mpu', 'wil', 'prescribed_elective', 'elective']) {
      expect(excelCellFillHex(category, col)).toBe(EXCEL_NEUTRAL_FILL_HEX);
    }
  });

  test.each([3, 4, 5])('column %i (Unit Code/Name/Category) still gets the category colour, unchanged', (col) => {
    expect(excelCellFillHex('core', col)).toBe('569CD6');
    expect(excelCellFillHex('wil', col)).toBe('C586C0');
    expect(excelCellFillHex('mpu', col)).toBe('F48771');
  });

  test('EXCEL_NEUTRAL_FILL_HEX matches the header row\'s own fill colour', () => {
    expect(EXCEL_NEUTRAL_FILL_HEX).toBe('D9D9D9');
  });
});

describe('computeExcelMergeRanges — per-column, independent runs, header at row 0', () => {
  const row = (over: Partial<ExcelPlanRow>): ExcelPlanRow => ({
    year: 1, semester: 1, term: 'Feb/Mar', code: 'X', name: 'X', category: 'core', categoryLabel: 'Core', ...over,
  });

  test('three consecutive rows with the same Year merge into one range spanning them, in the Year column', () => {
    const rows = [row({ code: 'A' }), row({ code: 'B' }), row({ code: 'C' })];
    const ranges = computeExcelMergeRanges(rows);
    expect(ranges).toContainEqual({ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } });
  });

  test('a WIL row shares Year/Semester with the regular-term rows around it but a different Term: Year and Semester merge across the whole span, Term does not', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 2, semester: 1, units: [{ code: 'CORE1', name: 'Core Unit', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any] },
    ];
    const primaryMilestone = {
      unitCode: 'WIL01', unitName: 'WIL Placement', insertBeforeSlotKey: '2-1',
      availableBreakSlots: [{ slotKey: '2-1', termType: 'winter' }],
    };
    const rows = buildExcelRows(semesters, 1, primaryMilestone, '2-1', []);

    // Sanity-check the exact situation this test relies on: same Year/Semester,
    // different Term (buildExcelRows pushes the WIL row before the regular one).
    expect(rows.map((r) => [r.year, r.semester, r.term])).toEqual([
      [2, 1, 'Winter'],
      [2, 1, 'Feb/Mar'],
    ]);

    const ranges = computeExcelMergeRanges(rows);
    // Year (col 0) and Semester (col 1) merge across both rows...
    expect(ranges).toContainEqual({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } });
    expect(ranges).toContainEqual({ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } });
    // ...but Term (col 2) never does, since "Winter" and "Feb/Mar" each only
    // occur once in their own run.
    expect(ranges.some((r) => r.s.c === 2)).toBe(false);
  });

  test('a single row with a unique value in a column produces no merge entry for that column', () => {
    const rows = [row({ code: 'A', year: 1 }), row({ code: 'B', year: 2 }), row({ code: 'C', year: 3 })];
    const ranges = computeExcelMergeRanges(rows);
    expect(ranges.filter((r) => r.s.c === 0)).toEqual([]);
  });

  test('consecutive blank-Year rows (the remaining MPU rows) produce no merge entry', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [{ code: 'CORE1', name: 'Core Unit', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any] },
    ];
    const remainingMpus = [
      { code: 'MPU201', name: 'Ethics and Civilisation' },
      { code: 'MPU301', name: 'Philosophy' },
    ];
    const rows = buildExcelRows(semesters, 1, null, null, remainingMpus);
    expect(rows[1].year).toBe('');
    expect(rows[2].year).toBe('');

    const ranges = computeExcelMergeRanges(rows);
    expect(ranges.filter((r) => r.s.c === 0)).toEqual([]);
    expect(ranges.filter((r) => r.s.c === 1)).toEqual([]);
  });

  test('Unit Code, Unit Name and Category never appear in any merge range, even when their values repeat', () => {
    const rows = [
      row({ code: 'SAME', name: 'Same Name', category: 'core' }),
      row({ code: 'SAME', name: 'Same Name', category: 'core' }),
      row({ code: 'SAME', name: 'Same Name', category: 'core' }),
    ];
    const ranges = computeExcelMergeRanges(rows);
    const mergedCols = new Set(ranges.map((r) => r.s.c));
    expect(mergedCols.has(3)).toBe(false); // Unit Code
    expect(mergedCols.has(4)).toBe(false); // Unit Name
    expect(mergedCols.has(5)).toBe(false); // Category
  });
});
