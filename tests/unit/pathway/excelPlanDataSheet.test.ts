import * as XLSX from 'xlsx-js-style';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import {
  buildExcelRows,
  buildStudyPlanHeaderRows,
  buildStudyPlanSheetAoa,
  applyStudyPlanSheetStyling,
  buildPlanDataSheetAoa,
  buildExcelWorkbook,
  computeExcelMergeRanges,
  EXCEL_TABLE_HEADER_ROW,
  EXCEL_COLUMN_HEADER,
  type ExcelPlanHeaderInfo,
  type ExcelPlanRow,
} from '@/app/(pages)/pathway/page';
import { buildPlanPayload, rowsToPayload, PLAN_DATA_SHEET_NAME, PLAN_DATA_SHEET_NOTE, type BuildPlanPayloadInput } from '@core/shared/planFile';
import type { CustomSemesterBucket } from '@core/services/scheduling/customPlannerScheduler';

// This file uses the REAL xlsx-js-style library throughout (not a mock),
// since its JS-level readback is unreliable for merged-cell styling
// specifically; what's checked here (row text, merge range offsets,
// workbook sheet names) is the part that IS reliable at the JS level.

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

describe('the "Plan Data" sheet is hidden, not very hidden, and "Study Plan" stays the active sheet', () => {
  function sampleWorkbookArgs() {
    const rows = buildExcelRows(
      [{ year: 1, semester: 1, units: [{ code: 'CORE1', name: 'Core Unit', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any] }],
      1, null, null, []
    );
    const headerInfo: ExcelPlanHeaderInfo = { courseName: 'Bachelor of Computer Science', majorName: 'AI', intakeYear: 2023, intakeMonth: 9 };
    const payload = buildPlanPayload(richPayloadInput());
    return { rows, headerInfo, payload };
  }

  test('wb.Workbook.Sheets marks "Plan Data" Hidden: 1 (not 2, very hidden) and "Study Plan" Hidden: 0', () => {
    const { rows, headerInfo, payload } = sampleWorkbookArgs();
    const wb = buildExcelWorkbook(XLSX, rows, headerInfo, payload);
    expect(wb.SheetNames).toEqual(['Study Plan', PLAN_DATA_SHEET_NAME]);
    expect(wb.Workbook.Sheets).toEqual([{ Hidden: 0 }, { Hidden: 1 }]);
  });

  test('"Study Plan" is index 0, the first (and only unhidden) sheet — the active sheet, since nothing else overrides it', () => {
    const { rows, headerInfo, payload } = sampleWorkbookArgs();
    const wb = buildExcelWorkbook(XLSX, rows, headerInfo, payload);
    expect(wb.SheetNames[0]).toBe('Study Plan');
  });

  test('RAW-FILE CHECK: xl/workbook.xml has state="hidden" on "Plan Data" and no state attribute on "Study Plan"', () => {
    const { rows, headerInfo, payload } = sampleWorkbookArgs();
    const wb = buildExcelWorkbook(XLSX, rows, headerInfo, payload);

    const outPath = path.join(os.tmpdir(), `hidden-sheet-check-${process.pid}-${Date.now()}.xlsx`);
    const extractDir = `${outPath}_unzipped`;
    try {
      XLSX.writeFile(wb, outPath);
      fs.mkdirSync(extractDir, { recursive: true });
      execSync(`unzip -o "${outPath}" -d "${extractDir}"`);
      const workbookXml = fs.readFileSync(path.join(extractDir, 'xl', 'workbook.xml'), 'utf-8');

      const sheetsXml = workbookXml.match(/<sheet[^>]*\/>/g) ?? [];
      const planDataSheet = sheetsXml.find((s) => s.includes(`name="${PLAN_DATA_SHEET_NAME}"`));
      const studyPlanSheet = sheetsXml.find((s) => s.includes('name="Study Plan"'));

      expect(planDataSheet).toContain('state="hidden"');
      expect(planDataSheet).not.toContain('state="veryHidden"');
      expect(studyPlanSheet).toBeDefined();
      expect(studyPlanSheet).not.toContain('state=');
    } finally {
      fs.rmSync(outPath, { force: true });
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  });

  test('reading the hidden "Plan Data" sheet back still returns its data (hidden does not mean unreadable)', () => {
    const { rows, headerInfo, payload } = sampleWorkbookArgs();
    const wb = buildExcelWorkbook(XLSX, rows, headerInfo, payload);
    const planDataRows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[PLAN_DATA_SHEET_NAME], { header: 1, raw: false });
    expect(planDataRows[0]).toEqual([PLAN_DATA_SHEET_NOTE]);
    const result = rowsToPayload(planDataRows.slice(1));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload).toEqual(payload);
  });

  test('an OLD export whose "Plan Data" sheet is still VISIBLE (no Workbook.Sheets at all) still imports successfully', () => {
    // Simulates an old export: no wb.Workbook override, so the sheet has no hidden state.
    const payload = buildPlanPayload(richPayloadInput());
    const ws = XLSX.utils.aoa_to_sheet(buildStudyPlanSheetAoa(rows_forOldExport(), headerInfo_forOldExport()));
    const planDataWs = XLSX.utils.aoa_to_sheet(buildPlanDataSheetAoa(payload));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Study Plan');
    XLSX.utils.book_append_sheet(wb, planDataWs, PLAN_DATA_SHEET_NAME);
    // No wb.Workbook set at all: the old shape.

    const planDataRows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[PLAN_DATA_SHEET_NAME], { header: 1, raw: false });
    const result = rowsToPayload(planDataRows.slice(1));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload).toEqual(payload);
  });

  test('row 0 of a freshly built sheet is a neutral label, with no sentence about restoring, editing, deleting or forwarding, and import still treats it as the note row (ignored)', () => {
    expect(PLAN_DATA_SHEET_NOTE).not.toMatch(/restor/i);
    expect(PLAN_DATA_SHEET_NOTE).not.toMatch(/edit|delete|forward/i);

    const { rows, headerInfo, payload } = sampleWorkbookArgs();
    const wb = buildExcelWorkbook(XLSX, rows, headerInfo, payload);
    const planDataRows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[PLAN_DATA_SHEET_NAME], { header: 1, raw: false });
    expect(planDataRows[0]).toEqual([PLAN_DATA_SHEET_NOTE]); // still row 0, same layout
    const result = rowsToPayload(planDataRows.slice(1)); // import still drops row 0 the same way
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.issues).toEqual([]); // the note row is not mistaken for a malformed data row
  });

  test('an OLD export whose row 0 still holds the previous long note still imports', () => {
    // Simulates a file exported before this change: row 0 holds the old
    // long sentence, not today's short label. The import only skips exactly
    // one leading row, so it must not care what that row says.
    const OLD_NOTE = 'Machine-readable data used to restore this plan in the Study Planner app. It contains the student\'s completed units and plan details. Do not edit, delete or forward this sheet.';
    const { payload } = sampleWorkbookArgs();
    const planDataRows: string[][] = [[OLD_NOTE], ...buildPlanDataSheetAoa(payload).slice(1)];

    const result = rowsToPayload(planDataRows.slice(1));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.issues).toEqual([]);
    expect(result.payload).toEqual(payload);
  });
});

function rows_forOldExport(): ExcelPlanRow[] {
  return buildExcelRows(
    [{ year: 1, semester: 1, units: [{ code: 'CORE1', name: 'Core Unit', category: 'core', offeringSemesters: [1, 2], requisiteGroups: [] } as any] }],
    1, null, null, []
  );
}
function headerInfo_forOldExport(): ExcelPlanHeaderInfo {
  return { courseName: 'Bachelor of Computer Science', majorName: 'AI', intakeYear: 2023, intakeMonth: 9 };
}

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
