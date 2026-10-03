import * as XLSX from 'xlsx-js-style';
import {
  buildExcelRows,
  buildStudyPlanHeaderRows,
  buildStudyPlanSheetAoa,
  applyStudyPlanSheetStyling,
  buildPlanDataSheetAoa,
  computeExcelMergeRanges,
  EXCEL_TABLE_HEADER_ROW,
  EXCEL_COLUMN_HEADER,
  type ExcelPlanHeaderInfo,
  type ExcelPlanRow,
} from '@/app/(pages)/pathway/page';
import { buildPlanPayload, rowsToPayload, PLAN_DATA_SHEET_NAME, PLAN_DATA_SHEET_NOTE, type BuildPlanPayloadInput } from '@core/shared/planFile';
import type { CustomSemesterBucket } from '@core/services/scheduling/customPlannerScheduler';

// This file uses the REAL xlsx-js-style library throughout (not a mock),
// because an earlier commit found its JS-level readback unreliable for
// merged-cell styling specifically; what's checked here (row text, merge
// range offsets, workbook sheet names) is the part that IS reliable at the
// JS level. The actual visible-styling verification was done empirically
// against the raw OOXML, outside the repo, and is not re-asserted here.

describe('buildStudyPlanHeaderRows', () => {
  test('a September intake reads "Intake: September <year> (Semester 2)", plain ASCII', () => {
    const info: ExcelPlanHeaderInfo = { courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9 };
    const rows = buildStudyPlanHeaderRows(info);
    expect(rows).toEqual([
      ['BACHELOR OF COMPUTER SCIENCE'],
      ['Major: Artificial Intelligence'],
      ['Intake: September 2023 (Semester 2)'],
    ]);
    const joined = rows.map((r) => r[0]).join('\n');
    expect(/[^\x00-\x7F]/.test(joined)).toBe(false); // plain ASCII only, no middle dot
  });

  test('a February intake reads Semester 1', () => {
    const info: ExcelPlanHeaderInfo = { courseName: 'Bachelor of Computer Science', majorName: null, intakeYear: 2025, intakeMonth: 2 };
    const rows = buildStudyPlanHeaderRows(info);
    expect(rows[1]).toEqual(['Major: Standard Pathway']);
    expect(rows[2]).toEqual(['Intake: February 2025 (Semester 1)']);
  });

  test('a null intake month falls back to "Intake: Unknown" rather than throwing', () => {
    const info: ExcelPlanHeaderInfo = { courseName: 'Course', majorName: 'Major', intakeYear: 2024, intakeMonth: null };
    expect(buildStudyPlanHeaderRows(info)[2]).toEqual(['Intake: Unknown']);
  });
});

describe('buildStudyPlanSheetAoa: the title block shifts the table down, data is unaffected', () => {
  const rows: ExcelPlanRow[] = buildExcelRows(
    [{ year: 1, semester: 1, units: [{ code: 'CORE1', name: 'Core Unit', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any] }],
    1, null, null, []
  );
  const info: ExcelPlanHeaderInfo = { courseName: 'Bachelor of Computer Science', majorName: 'AI', intakeYear: 2023, intakeMonth: 9 };

  test('the column header lands at EXCEL_TABLE_HEADER_ROW, data right after', () => {
    const aoa = buildStudyPlanSheetAoa(rows, info);
    expect(aoa[EXCEL_TABLE_HEADER_ROW]).toEqual(EXCEL_COLUMN_HEADER);
    expect(aoa[EXCEL_TABLE_HEADER_ROW + 1]).toEqual([1, 1, 'Feb/Mar', 'CORE1', 'Core Unit', 'Core']);
    expect(aoa.length).toBe(EXCEL_TABLE_HEADER_ROW + 1 + rows.length);
  });

  test('row 3 (between the title block and the column header) is blank', () => {
    const aoa = buildStudyPlanSheetAoa(rows, info);
    expect(aoa[3]).toEqual([]);
  });
});

describe('applyStudyPlanSheetStyling against the REAL xlsx-js-style library', () => {
  test('merges computed by computeExcelMergeRanges (header-at-row-0 space) land on the shifted real rows', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [
        { code: 'A', name: 'A', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any,
        { code: 'B', name: 'B', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any,
        { code: 'C', name: 'C', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any,
      ] },
    ];
    const rows = buildExcelRows(semesters, 1, null, null, []);
    // Sanity: computeExcelMergeRanges itself is untouched, still header-at-0 space.
    const logicalRanges = computeExcelMergeRanges(rows);
    expect(logicalRanges).toContainEqual({ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } });

    const info: ExcelPlanHeaderInfo = { courseName: 'Course', majorName: null, intakeYear: 2023, intakeMonth: 9 };
    const ws = XLSX.utils.aoa_to_sheet(buildStudyPlanSheetAoa(rows, info));
    applyStudyPlanSheetStyling(XLSX, ws, rows);

    const realRanges = (ws as any)['!merges'];
    expect(realRanges).toContainEqual({ s: { r: 1 + EXCEL_TABLE_HEADER_ROW, c: 0 }, e: { r: 3 + EXCEL_TABLE_HEADER_ROW, c: 0 } });
    // And NOT at the old, pre-shift row numbers.
    expect(realRanges).not.toContainEqual({ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } });
  });

  test('the column header cell (now shifted) carries the bold/fill styling, and row 0 does not', () => {
    const semesters: CustomSemesterBucket[] = [
      { year: 1, semester: 1, units: [{ code: 'A', name: 'A', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any] },
    ];
    const rows = buildExcelRows(semesters, 1, null, null, []);
    const info: ExcelPlanHeaderInfo = { courseName: 'Course', majorName: null, intakeYear: 2023, intakeMonth: 9 };
    const ws = XLSX.utils.aoa_to_sheet(buildStudyPlanSheetAoa(rows, info));
    applyStudyPlanSheetStyling(XLSX, ws, rows);

    const headerCell = (ws as any)[XLSX.utils.encode_cell({ r: EXCEL_TABLE_HEADER_ROW, c: 0 })];
    expect(headerCell.v).toBe('Year');
    expect(headerCell.s.font.bold).toBe(true);

    const titleCell = (ws as any)[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    expect(titleCell.s).toBeUndefined();
  });
});

describe('the exported workbook carries both sheets, named correctly', () => {
  test('"Study Plan" and PLAN_DATA_SHEET_NAME both exist', () => {
    const rows = buildExcelRows([{ year: 1, semester: 1, units: [] }], 1, null, null, []);
    const info: ExcelPlanHeaderInfo = { courseName: 'Course', majorName: null, intakeYear: 2023, intakeMonth: 9 };
    const ws = XLSX.utils.aoa_to_sheet(buildStudyPlanSheetAoa(rows, info));
    applyStudyPlanSheetStyling(XLSX, ws, rows);

    const payload = buildPlanPayload(minimalPayloadInput());
    const planDataWs = XLSX.utils.aoa_to_sheet(buildPlanDataSheetAoa(payload));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Study Plan');
    XLSX.utils.book_append_sheet(wb, planDataWs, PLAN_DATA_SHEET_NAME);

    expect(wb.SheetNames).toEqual(['Study Plan', PLAN_DATA_SHEET_NAME]);
  });
});

describe('buildPlanDataSheetAoa round trip through rowsToPayload', () => {
  test('the note row is first, and the payload read back equals the payload built', () => {
    const payload = buildPlanPayload(richPayloadInput());
    const aoa = buildPlanDataSheetAoa(payload);
    expect(aoa[0]).toEqual([PLAN_DATA_SHEET_NOTE]);

    const dataRows = aoa.slice(1);
    const result = rowsToPayload(dataRows);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.issues).toEqual([]);
    expect(result.payload).toEqual(payload);
  });

  test('round trips through a REAL xlsx-js-style worksheet, not just plain arrays', () => {
    const payload = buildPlanPayload(richPayloadInput());
    const ws = XLSX.utils.aoa_to_sheet(buildPlanDataSheetAoa(payload));
    const roundTrippedAoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dataRows = roundTrippedAoa.slice(1); // drop the note row
    const result = rowsToPayload(dataRows);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload).toEqual(payload);
  });
});

function minimalPayloadInput(): BuildPlanPayloadInput {
  return {
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
}

function richPayloadInput(): BuildPlanPayloadInput {
  return {
    ...minimalPayloadInput(),
    completedUnitCodes: ['CORE1', 'CORE2'],
    concededPassUnitCodes: ['CPUNIT'],
    arrangement: [
      { code: 'CORE3', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      { code: 'CPUNIT', category: 'core', year: 1, semester: 2, position: 0, recommended: false, outsidePlanner: false, retake: true, concededPassRetake: true },
    ],
    outsidePlannerUnitCodes: ['OUT1'],
    minorNames: ['Data Science Minor'],
    doubleMajorMajorName: 'Software Development',
    customWilSlot: '4-2',
    customMpuList: [{ code: 'MPU3193', name: 'Philosophy and Current Issues' }],
  };
}
