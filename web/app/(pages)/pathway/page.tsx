'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { useStudentSession } from '../../../components/providers/StudentSessionContext';
import { panelToPath } from '../../../lib/navigation';
import { Badge, InlineCode } from '../../../components/common/Primitives';
import MinorProgressCard, { getMinorProgress } from '../../../components/common/MinorProgressCard';
import {
  getCompletedUnitCodes,
  getConcededPassUnitCodes,
  normaliseUnitCode,
  resolveUnitStates,
} from '../../../../core/shared/constants/grades';
import {
  calendarTermFor,
  normalLoadFor,
  normaliseCode,
  DEFAULT_SCHEDULER_CONFIG,
  type CustomSemesterBucket,
  type PlanWarning,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';
import { carryForwardWarnings, validatePlan } from '../../../../core/shared/scheduling/planValidator';
import type { CatalogueUnit } from '../../api/custom-planner/catalogue/route';
import ElectivePicker, { type PickerSlot, type PickerSource } from './ElectivePicker';
import { monthsOf, offeringHint } from './terms';
import {
  addSemester,
  addUnit,
  moveUnit,
  removeSemester,
  removeUnit,
  replaceUnit,
} from '../../../../core/shared/scheduling/planEdits';
import {
  buildPlanPayload,
  rowsToPayload,
  payloadToRows,
  findOversizedPlanDataCells,
  PLAN_DATA_SHEET_NAME,
  PLAN_DATA_SHEET_NOTE,
  PLAN_FILE_LIMITS,
  type BuildPlanPayloadInput,
  type PlanPayload,
} from '../../../../core/shared/planFile';
import { overlayRestoredArrangement } from '../../../../core/shared/planFile/restore';
import { encodePayloadForPdf, decodePayloadFromPdf, PDF_PAYLOAD_PREFIX, PDF_PAYLOAD_LIMITS } from '../../../../core/shared/planFile/pdfPayload';

/** A plan file's payload is a few KB; this is a generous cap against a hostile oversized upload. */
const MAX_PLAN_FILE_BYTES = 5 * 1024 * 1024;
/** Matches the /api/plan-file/read-pdf route's own cap: our own exported PDFs are ~10 KB. */
const MAX_PDF_FILE_BYTES = 2 * 1024 * 1024;

const CATEGORY_NAMES: Record<string, string> = {
  core: 'Core units',
  major: 'Major core units',
  major_core: 'Major core units',
  elective: 'Electives',
  prescribed_elective: 'Prescribed electives',
  wil: 'Work-Integrated Learning',
  mpu: 'MPU units',
};

function listCodes(codes: string[]): string {
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

const YEAR_WORDS: Record<number, string> = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight'
};

function describeWarning(w: PlanWarning, maxSemesters: number, intakeSemester: 1 | 2): string | null {
  switch (w.kind) {
    case 'requisite_violation': {
      const parts: string[] = [];
      const concededPass = new Set(w.concededPass ?? []);
      const notInPlan = w.missing.filter((c) => !concededPass.has(c));
      if (notInPlan.length > 0) {
        parts.push(`needs ${listCodes(notInPlan)}, which ${notInPlan.length === 1 ? 'is' : 'are'} not in this plan`);
      }
      if (concededPass.size > 0) {
        parts.push(`needs ${listCodes([...concededPass])}, but a Conceded Pass cannot satisfy a prerequisite`);
      }
      if (w.conflictsWith?.length) {
        parts.push(`cannot be taken with ${listCodes(w.conflictsWith)}, which is already taken`);
      }
      if (w.creditPointsNeeded !== undefined) {
        parts.push(`needs ${w.creditPointsNeeded} credit points, which this plan never reaches`);
      }
      return `${w.unitCode} ${parts.length > 0 ? parts.join('; ') : 'has requisites that cannot be met'}`;
    }
    case 'not_offered': {
      const runsIn = listCodes(w.offeringTerms.map(monthsOf));
      // placedIn means an advisor put it there by hand, so the scheduler's
      // "could not be fitted" wording would be wrong.
      if (w.placedIn) {
        const slotMonths = monthsOf(calendarTermFor(w.placedIn.semester, intakeSemester));
        return `${w.unitCode} only runs in ${runsIn}, but Y${w.placedIn.year} S${w.placedIn.semester} is a ${slotMonths} term for this student`;
      }
      const noSuchTerm = w.offeringTerms.length === 1
        ? `no ${runsIn} term was available`
        : 'none of those terms was available';
      return `${w.unitCode} only runs in ${runsIn}, and ${noSuchTerm} within the plan`;
    }
    case 'short_term_only':
      return `${w.unitCode} is only offered in summer/winter, which this plan does not schedule`;
    case 'budget_exhausted':
      return `${w.unitCodes.length} unit${w.unitCodes.length !== 1 ? 's' : ''} could not be placed within ${maxSemesters} semesters: ${w.unitCodes.join(', ')}`;
    case 'no_offering_data':
      return `${w.unitCode} has no offering data, so its placement is unverified`;
    case 'duplicate_placement':
      return `${w.unitCode} appears in ${w.positions.length} semesters: ${w.positions.map((p) => `Y${p.year} S${p.semester}`).join(', ')}`;
    case 'compulsory_missing':
      return `${listCodes(w.unitCodes)} ${w.unitCodes.length === 1 ? 'is' : 'are'} required to graduate but ${w.unitCodes.length === 1 ? 'is' : 'are'} not in this plan`;
    case 'conceded_pass_retake':
      // Routine, not an error: the RETAKE badge's own "(CP)" suffix and
      // shortened tooltip say this already. A full sentence duplicated on
      // the same row would overstate ordinary, correctly-handled behaviour.
      return null;
    case 'requirement_shortfall':
      return `${CATEGORY_NAMES[w.category] ?? w.category} total ${w.have} credit points, but ${w.need} are required to graduate`;
    case 'requirement_excess':
      return `${CATEGORY_NAMES[w.category] ?? w.category} total ${w.have} credit points, ${w.have - w.need} more than the ${w.need} required`;
    default:
      // over_capacity is shown on the semester it concerns
      return null;
  }
}

function warningUnitCode(w: PlanWarning): string | null {
  return 'unitCode' in w ? w.unitCode : null;
}

function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, opacity: 0.25 }}>🧭</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{message}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            className={styles.btnPrimary}
            style={{ marginTop: 16 }}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

// Helper to calculate the student's remaining MPU units
function getRemainingMpuUnits(activePlanner: any, dashboardData: any, takenCodes: Set<string>) {
  // 1. Get the MPU units specifically required by the selected degree planner
  const plannerMpuUnits = (activePlanner?.units ?? [])
    .filter((tu: any) => tu.category === 'mpu' && tu.unit)
    .map((tu: any) => ({
      code: tu.unit.unit_code?.trim().toUpperCase(),
      name: tu.unit.unit_name,
    }));

  // If the planner defines specific MPU units, use those exact ones!
  let mpuList = plannerMpuUnits;

  // Fallback only if the planner didn't list any MPU units
  if (mpuList.length === 0) {
    mpuList = (dashboardData?.mpuCourseList ?? [])
      .filter((u: any) => u.courseId)
      .map((u: any) => ({
        code: u.courseId.trim().toUpperCase(),
        name: u.courseTitle || 'MPU Unit',
      }));
  }

  // De-duplicate by code
  const mpuMap = new Map<string, string>();
  mpuList.forEach((u: any) => {
    if (u.code && !mpuMap.has(u.code)) {
      mpuMap.set(u.code, u.name);
    }
  });

  // Return only untaken MPU units
  return Array.from(mpuMap.entries())
    .filter(([code]) => !takenCodes.has(code))
    .map(([code, name]) => ({ code, name }));
}

// Excel export: a flat, one-row-per-unit sheet, separate from the PDF's
// grouped/banner layout above. Deliberately duplicates the PDF's small glue
// functions (category label, WIL slot detection) rather than sharing them,
// so nothing here can affect handleDirectPdfDownload's output.

export type ExcelPlanRow = {
  year: number | string;
  semester: number | string;
  term: string;
  code: string;
  name: string;
  category: string;
  categoryLabel: string;
};

function excelCategoryLabel(category: string, code: string): string {
  if (code === 'ELECTIVE') return 'Elective';
  if (category === 'core') return 'Core';
  if (category === 'major_core') return 'Major Core';
  if (category === 'prescribed_elective') return 'Prescribed Elective';
  if (category === 'double_major') return 'Double Major';
  if (category === 'minor') return 'Minor Elective';
  if (category === 'wil') return 'Work-Integrated Learning';
  if (category === 'mpu') return 'MPU';
  return 'Elective';
}

// The canonical mapping from web/components/planner/CourseListTable.tsx,
// the same reference used for the on-screen badge fixes (not the PDF's
// own separate pastel palette, getCategoryColor, untouched, above).
// Hex values pulled directly from the rgba() triples in
// web/components/common/Primitives.module.css's .badgeBlue/.badgeGreen/
// .badgeYellow/.badgeRed rules, and Primitives.tsx's badgePurple inline
// style (there is no .badgePurple CSS rule; that one colour only exists
// as an inline style, so it has to come from the component, not the CSS file).
export function excelCategoryFillHex(category: string): string {
  if (category === 'core') return '569CD6'; // badgeBlue
  if (category === 'major_core') return 'DCDCAA'; // badgeYellow
  if (category === 'mpu') return 'F48771'; // badgeRed
  if (category === 'wil') return 'C586C0'; // badgePurple
  // prescribed_elective, elective, double_major, minor: canonical's default badgeGreen
  return '4EC9B0';
}

// Light grey, matching the header row's own fill. Used for Year/Semester/
// Term (see excelCellFillHex) instead of a category colour, since those
// columns get merged and would otherwise show whichever row's category
// happened to land first in the merged range.
export const EXCEL_NEUTRAL_FILL_HEX = 'D9D9D9';

/**
 * The fill colour for one data cell: neutral for Year/Semester/Term (the
 * unit's slot, not the unit itself), the category colour for Unit Code/
 * Name/Category (columns >= EXCEL_FIRST_UNIT_DETAIL_COL).
 */
export function excelCellFillHex(category: string, col: number): string {
  return col < EXCEL_FIRST_UNIT_DETAIL_COL ? EXCEL_NEUTRAL_FILL_HEX : excelCategoryFillHex(category);
}

/**
 * One row per unit across every semester, plus the WIL break-milestone unit
 * (Term: Winter/Summer) and the remaining/incomplete MPU list (Term: Any,
 * Year/Semester blank since they have no fixed slot). MPU units are NOT
 * filtered out of a regular semester's own units here, unlike the PDF and
 * the on-screen table (which show MPU separately), so a flat, filterable
 * sheet never silently drops a unit; an in-semester MPU unit just gets
 * Term "Any" instead of the semester's normal Feb/Mar or Aug/Sept.
 */
export function buildExcelRows(
  semesters: CustomSemesterBucket[],
  planIntakeSemester: 1 | 2,
  primaryMilestone: any,
  activeWilSlot: string | null | undefined,
  remainingMpus: { code: string; name: string }[],
): ExcelPlanRow[] {
  const rows: ExcelPlanRow[] = [];

  for (const sem of semesters) {
    const slotKey = `${sem.year}-${sem.semester}`;
    const isWilSlot = !!primaryMilestone && activeWilSlot === slotKey;

    if (isWilSlot) {
      const currentBreakOption = primaryMilestone?.availableBreakSlots?.find((b: any) => b.slotKey === slotKey);
      const breakTerm = currentBreakOption?.termType === 'winter' ? 'Winter' : 'Summer';
      rows.push({
        year: sem.year,
        semester: sem.semester,
        term: breakTerm,
        code: primaryMilestone.unitCode,
        name: primaryMilestone.unitName,
        category: 'wil',
        categoryLabel: 'Work-Integrated Learning',
      });
    }

    const calTerm = calendarTermFor(sem.semester, planIntakeSemester);
    const semTerm = calTerm === 1 ? 'Feb/Mar' : 'Aug/Sept';

    for (const u of sem.units as any[]) {
      rows.push({
        year: sem.year,
        semester: sem.semester,
        term: u.category === 'mpu' ? 'Any' : semTerm,
        code: u.code,
        name: u.name,
        category: u.category,
        categoryLabel: excelCategoryLabel(u.category, u.code),
      });
    }
  }

  for (const mpu of remainingMpus) {
    rows.push({
      year: '',
      semester: '',
      term: 'Any',
      code: mpu.code,
      name: mpu.name,
      category: 'mpu',
      categoryLabel: 'MPU',
    });
  }

  return rows;
}

export type ExcelMergeRange = { s: { r: number; c: number }; e: { r: number; c: number } };

// Excel sheet column indices for buildExcelRows's output, in the order
// handleExcelDownload writes them: Year, Semester, Term, Unit Code, Unit
// Name, Category. Only the first three are ever merged.
const EXCEL_YEAR_COL = 0;
const EXCEL_SEMESTER_COL = 1;
const EXCEL_TERM_COL = 2;
// First column that describes the unit itself (Unit Code) rather than its
// slot (Year/Semester/Term): columns before this get a neutral fill in
// handleExcelDownload, not the category colour.
const EXCEL_FIRST_UNIT_DETAIL_COL = 3;

function mergeRangesForColumn(values: (string | number)[], col: number): ExcelMergeRange[] {
  const ranges: ExcelMergeRange[] = [];
  let runStart = 0;
  for (let i = 1; i <= values.length; i++) {
    const continuesRun = i < values.length && values[i] === values[runStart];
    if (continuesRun) continue;
    const runLength = i - runStart;
    // A blank run (the Year/Semester columns on trailing "remaining MPU"
    // rows, which have no fixed slot) is never merged: a merged block of
    // nothing but blanks reads wrong and helps no one.
    if (runLength >= 2 && values[runStart] !== '') {
      // +1 on both ends: row 0 is the header, data starts at row 1.
      ranges.push({ s: { r: runStart + 1, c: col }, e: { r: i - 1 + 1, c: col } });
    }
    runStart = i;
  }
  return ranges;
}

/**
 * Merge ranges for consecutive identical Year/Semester/Term cells, each
 * column considered independently. A Year/Semester pair can span rows with
 * two different Term values (a WIL break-milestone row sits in the same
 * Year/Semester as the regular-term rows around it, but with its own
 * "Winter"/"Summer" Term, see buildExcelRows above), so Year and Semester
 * can merge across that span while Term does not, or vice versa. Unit Code,
 * Unit Name and Category are never merged; they are inherently unique per
 * row (or, for Category, not meant to be grouped visually here).
 */
export function computeExcelMergeRanges(rows: ExcelPlanRow[]): ExcelMergeRange[] {
  return [
    ...mergeRangesForColumn(rows.map((r) => r.year), EXCEL_YEAR_COL),
    ...mergeRangesForColumn(rows.map((r) => r.semester), EXCEL_SEMESTER_COL),
    ...mergeRangesForColumn(rows.map((r) => r.term), EXCEL_TERM_COL),
  ];
}

const EXCEL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Same Semester 1/2 rule as the PDF header (handleDirectPdfDownload), kept separate since this task does not touch the PDF export. */
function excelIntakeSemesterOf(intakeMonth: number | null | undefined): 1 | 2 {
  return intakeMonth != null && intakeMonth >= 7 ? 2 : 1;
}

export interface ExcelPlanHeaderInfo {
  courseName: string;
  majorName: string | null;
  intakeYear: number | null;
  intakeMonth: number | null;
}

/**
 * The readable sheet's title block, matching the PDF header's content but in
 * plain ASCII: a middle dot in the PDF header was shown to come back as a
 * replacement glyph under text extraction, so this sheet avoids non-ASCII
 * punctuation entirely rather than risk the same damage on whatever reads it.
 */
export function buildStudyPlanHeaderRows(info: ExcelPlanHeaderInfo): string[][] {
  const monthName = info.intakeMonth != null && info.intakeMonth >= 1 && info.intakeMonth <= 12
    ? EXCEL_MONTH_NAMES[info.intakeMonth - 1]
    : null;
  const intakeLine = monthName && info.intakeYear != null
    ? `Intake: ${monthName} ${info.intakeYear} (Semester ${excelIntakeSemesterOf(info.intakeMonth)})`
    : 'Intake: Unknown';
  return [
    [info.courseName.toUpperCase()],
    [`Major: ${info.majorName ?? 'Standard Pathway'}`],
    [intakeLine],
  ];
}

export const EXCEL_COLUMN_HEADER = ['Year', 'Semester', 'Term', 'Unit Code', 'Unit Name', 'Category'];

const EXCEL_HEADER_TEXT_ROWS = 3;
const EXCEL_BLANK_ROWS_AFTER_HEADER = 1;
/**
 * Row index (0-based) of the Year/Semester/Term/... column-header row in the
 * readable sheet, now that the title block pushes it down from row 0.
 * computeExcelMergeRanges above is untouched and still returns ranges in
 * "row 0 = column header" space; applyStudyPlanSheetStyling below is the one
 * place that adds this offset before writing anything to the real sheet.
 */
export const EXCEL_TABLE_HEADER_ROW = EXCEL_HEADER_TEXT_ROWS + EXCEL_BLANK_ROWS_AFTER_HEADER;

/** The readable "Study Plan" sheet's full row data: title block, blank row, column header, then one row per unit. */
export function buildStudyPlanSheetAoa(rows: ExcelPlanRow[], info: ExcelPlanHeaderInfo): (string | number)[][] {
  return [
    ...buildStudyPlanHeaderRows(info),
    [],
    EXCEL_COLUMN_HEADER,
    ...rows.map((r) => [r.year, r.semester, r.term, r.code, r.name, r.categoryLabel]),
  ];
}

/**
 * The same header/fill/border/merge styling handleExcelDownload always
 * applied, shifted down by EXCEL_TABLE_HEADER_ROW for the title block now
 * above it. Takes the xlsx-js-style module as a parameter (rather than
 * importing it directly) so this stays callable from a test with a
 * statically-imported copy of the real library, not a mock.
 */
export function applyStudyPlanSheetStyling(XLSX: any, ws: any, rows: ExcelPlanRow[]): void {
  const thinBorder = {
    top: { style: 'thin', color: { rgb: '999999' } },
    bottom: { style: 'thin', color: { rgb: '999999' } },
    left: { style: 'thin', color: { rgb: '999999' } },
    right: { style: 'thin', color: { rgb: '999999' } },
  };

  // Column-header row: bold, light grey, bordered
  for (let c = 0; c < EXCEL_COLUMN_HEADER.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: EXCEL_TABLE_HEADER_ROW, c });
    const cell = ws[cellRef];
    if (!cell) continue;
    cell.s = {
      font: { bold: true },
      fill: { patternType: 'solid', fgColor: { rgb: 'D9D9D9' } },
      border: thinBorder,
    };
  }

  rows.forEach((row, i) => {
    for (let c = 0; c < EXCEL_COLUMN_HEADER.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: EXCEL_TABLE_HEADER_ROW + 1 + i, c });
      const cell = ws[cellRef];
      if (!cell) continue;
      const fill = { patternType: 'solid' as const, fgColor: { rgb: excelCellFillHex(row.category, c) } };
      cell.s = { fill, border: thinBorder };
    }
  });

  // Merges from computeExcelMergeRanges are in "row 0 = column header" space;
  // shift both ends by EXCEL_TABLE_HEADER_ROW before writing them for real.
  const merges = computeExcelMergeRanges(rows).map((range) => ({
    s: { r: range.s.r + EXCEL_TABLE_HEADER_ROW, c: range.s.c },
    e: { r: range.e.r + EXCEL_TABLE_HEADER_ROW, c: range.e.c },
  }));
  ws['!merges'] = merges;
  for (const range of merges) {
    const cellRef = XLSX.utils.encode_cell(range.s);
    const cell = ws[cellRef];
    if (!cell) continue;
    cell.s = { ...cell.s, alignment: { vertical: 'center', horizontal: 'center' } };
  }

  ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 22 }];
}

/** The "Plan Data" sheet's row data: a plain-text note, then the payload's own key/value rows. Kept unformatted and merge-free. */
export function buildPlanDataSheetAoa(payload: PlanPayload): string[][] {
  return [[PLAN_DATA_SHEET_NOTE], ...payloadToRows(payload)];
}

/**
 * Everything both handleExcelDownload and handleDirectPdfDownload need to
 * build a BuildPlanPayloadInput from the page's current state. A plain data
 * bag, not a hook, so this stays callable from a test without rendering
 * the page.
 */
export interface PlanPayloadInputSource {
  selectedPlanner: any;
  semesters: CustomSemesterBucket[];
  allTranscriptUnits: any[];
  retakeUnitCodes: Set<string>;
  concededPassRetakeCodes: Set<string>;
  planExtraUnits: SchedulableUnit[];
  availableMinors: any[];
  injectedMinors: Set<string>;
  selectedDoubleMajorId: string | null;
  availableDoubleMajors: any[];
  customWilSlot: string | null;
  remainingMpus: { code: string; name: string }[];
  customPlanStart: { year: number; semester: 1 | 2 } | null;
  planIntakeSemester: 1 | 2;
}

/**
 * The one place that gathers page state into a BuildPlanPayloadInput, used
 * by both exports so they can never drift apart. Previously inline in
 * handleExcelDownload only; handleDirectPdfDownload needs the identical
 * shape to embed in the PDF's own Keywords property.
 */
export function buildPlanPayloadInputForExport(source: PlanPayloadInputSource): BuildPlanPayloadInput {
  return {
    planner: {
      courseCode: source.selectedPlanner?.course?.code ?? null,
      courseName: source.selectedPlanner?.course?.name ?? 'Course',
      majorName: source.selectedPlanner?.major?.name ?? null,
      intakeYear: source.selectedPlanner?.intake_year ?? 0,
      intakeMonth: source.selectedPlanner?.intake_month ?? null,
    },
    completedUnitCodes: getCompletedUnitCodes(source.allTranscriptUnits),
    concededPassUnitCodes: getConcededPassUnitCodes(source.allTranscriptUnits),
    arrangement: source.semesters.flatMap((sem) =>
      (sem.units as any[]).map((u, position) => ({
        code: u.code,
        category: u.category,
        year: sem.year,
        semester: sem.semester,
        position,
        recommended: !!u.recommended,
        outsidePlanner: !!u.outsidePlanner,
        retake: source.retakeUnitCodes.has(normaliseCode(u.code)),
        concededPassRetake: source.concededPassRetakeCodes.has(normaliseCode(u.code)),
      }))
    ),
    outsidePlannerUnitCodes: source.planExtraUnits.map((u) => u.code),
    minorNames: source.availableMinors
      .filter((m: any) => source.injectedMinors.has(m.minorId))
      .map((m: any) => m.minorName),
    doubleMajorMajorName: source.selectedDoubleMajorId
      ? source.availableDoubleMajors.find((dm: any) => dm.plannerId === source.selectedDoubleMajorId)?.majorName ?? null
      : null,
    customWilSlot: source.customWilSlot ?? null,
    customMpuList: source.remainingMpus,
    startYear: source.customPlanStart?.year ?? source.selectedPlanner?.intake_year ?? 0,
    startSemester: source.customPlanStart?.semester ?? source.planIntakeSemester,
  };
}

/**
 * The full two-sheet workbook handleExcelDownload writes, as a pure
 * function of already-computed state. Extracted so a test can capture the
 * exact workbook a real export produces and feed it straight into the real
 * import, rather than only ever exercising import against a hand-built
 * fixture. Takes the xlsx-js-style module as a parameter, same reason as
 * applyStudyPlanSheetStyling: callable with a statically-imported real copy
 * from a test, not a mock.
 */
export function buildExcelWorkbook(
  XLSX: any,
  rows: ExcelPlanRow[],
  headerInfo: ExcelPlanHeaderInfo,
  payload: PlanPayload
): any {
  const ws = XLSX.utils.aoa_to_sheet(buildStudyPlanSheetAoa(rows, headerInfo));
  applyStudyPlanSheetStyling(XLSX, ws, rows);
  const planDataWs = XLSX.utils.aoa_to_sheet(buildPlanDataSheetAoa(payload));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Study Plan');
  XLSX.utils.book_append_sheet(wb, planDataWs, PLAN_DATA_SHEET_NAME);

  // Hidden (1), not very hidden (2): very hidden is a common trick in
  // malicious files and can trip a mail filter. "Study Plan" stays
  // index 0 and unhidden, which every reader defaults an active sheet to
  // in the absence of an explicit saved view (confirmed empirically: this
  // library's own write path emits no <bookViews> element at all, under
  // any Workbook property name, so an explicit activeTab cannot be forced
  // here — sheet order plus visibility is the only available control).
  wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  return wb;
}

export default function PathwayPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const {
    scrapedStudent: realScrapedStudent,
    studentLoaded: realStudentLoaded,
    dashboardData: realDashboardData,
    selectedPlannerIdx: realSelectedPlannerIdx,
    manualPlanner,
    restoredSession, setRestoredSession,
    customPlan, setCustomPlan,
    customPlanStart, setCustomPlanStart,
    retakeUnitCodes, setRetakeUnitCodes,
    concededPassRetakeWarnings, setConcededPassRetakeWarnings,
    injectedMinors, setInjectedMinors,
    planUnits, setPlanUnits,
    planIntakeSemester, setPlanIntakeSemester,
    planCompletedUnits, setPlanCompletedUnits,
    planExtraUnits, setPlanExtraUnits,
    planElectiveCandidates, setPlanElectiveCandidates,
    planRequirements, setPlanRequirements,
    generatedSemesters, setGeneratedSemesters,
    isPlanEdited, setIsPlanEdited,
    availableDoubleMajors, setAvailableDoubleMajors,
    selectedDoubleMajorId, setSelectedDoubleMajorId,
    availableMinors, setAvailableMinors,
    breakMilestones, setBreakMilestones,
    customWilSlot, setCustomWilSlot,
    removedUnitSlots, setRemovedUnitSlots,
    customMpuList, setCustomMpuList,
    allDatabaseMpus, setAllDatabaseMpus,
  } = useStudentSession();

  // The single substitution point: when a plan file is restored, every read
  // below of scrapedStudent/studentLoaded/dashboardData/selectedPlannerIdx
  // (there is no other declaration of these names in this file) transparently
  // sees the restored, student-less session instead of the real one, with no
  // other call site needing to know the difference. manualPlanner is
  // untouched since selectedPlannerIdx === 0 here always takes the
  // dashboardData.planners branch. The real session, and every other page,
  // never sees this: restoredSession lives only in the provider and this one
  // spot reads it.
  const scrapedStudent = restoredSession ? restoredSession.scrapedStudent : realScrapedStudent;
  const studentLoaded = restoredSession ? true : realStudentLoaded;
  const dashboardData = restoredSession ? restoredSession.dashboardData : realDashboardData;
  const selectedPlannerIdx = restoredSession ? 0 : realSelectedPlannerIdx;

  const [customPlanLoading, setCustomPlanLoading] = useState(false);
  const [unitToRemove, setUnitToRemove] = useState<{ code: string; name: string; category: string } | null>(null);
  const [semesterToDelete, setSemesterToDelete] = useState<{ year: number; semester: 1 | 2 } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isRestoringPlan, setIsRestoringPlan] = useState(false);
  const [restoreImportReport, setRestoreImportReport] = useState<{
    restoredUnitCount: number;
    restoredSemesterCount: number;
    skipped: { code: string; reason: string }[];
  } | null>(null);

  // Target semester for adding an extra unit beyond degree requirements
  const [extraUnitTargetSemester, setExtraUnitTargetSemester] = useState<{ year: number; semester: 1 | 2 } | null>(null);
  
  // Catalogue state. The units are fetched the first time a picker is opened,
  // not with the plan, which is already a large response.
  const [catalogue, setCatalogue] = useState<CatalogueUnit[]>([]);
  const [cataloguePrefixes, setCataloguePrefixes] = useState<string[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  // Where the open picker will put the unit chosen in it. A replace names the row
  // being swapped; an add is filling a gap and lets the advisor pick the semester.
  const [picker, setPicker] = useState<
    | { mode: 'replace'; oldCode: string; year: number; semester: 1 | 2 }
    | { mode: 'add_extra'; year: number; semester: 1 | 2; isExtraUnit: boolean }
    | { mode: 'add' }
    | null
  >(null);
  const [pickerSlotKey, setPickerSlotKey] = useState('');

  /** Regenerating throws away hand edits, so make the advisor say so first. */
  const confirmDiscardEdits = () =>
    !isPlanEdited || window.confirm('This will replace your edits with a newly generated plan.');

  const applyEdit = (next: CustomSemesterBucket[]) => {
    setCustomPlan({ ...customPlan, semesters: next });
    setIsPlanEdited(true);
  };

  // Planned units that name `code` as a prerequisite: the "Broken Prerequisite
  // Chain" check, shared by the unit-removal and semester-deletion modals so
  // neither reimplements it.
  const findDependentUnits = (code: string) => {
    const allPlannedUnits = (customPlan?.semesters ?? []).flatMap((s: any) => s.units);
    return allPlannedUnits.filter((other: any) => {
      if (other.code === code) return false;
      const meta = planUnits.find((pu: any) => normaliseCode(pu.code) === normaliseCode(other.code));
      return meta?.requisiteGroups?.some((g: any) =>
        g.some((c: any) => c.unitCode && normaliseCode(c.unitCode) === normaliseCode(code))
      );
    });
  };

  // Fetched the first time any picker opens, not with the plan, which is
  // already a large response.
  const loadCatalogue = async () => {
    if (catalogueLoaded || catalogueLoading) return;

    const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    setCatalogueLoading(true);
    try {
      const params = new URLSearchParams();
      if (activePlanner?.id) params.set('plannerId', String(activePlanner.id));
      const completed: string[] = dashboardData?.completedCodes ?? [];
      if (completed.length > 0) params.set('completed', completed.join(','));

      const res = await fetch(`/api/custom-planner/catalogue?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to load the catalogue');
      setCatalogue(data.units ?? []);
      setCataloguePrefixes(data.prefixes ?? []);
      setCatalogueLoaded(true);
    } catch {
      showToast('Could not load the unit catalogue.', 'error');
    } finally {
      setCatalogueLoading(false);
    }
  };

  const openPicker = (target: NonNullable<typeof picker>) => {
    setPicker(target);
    void loadCatalogue();
  };

  const resetToGenerated = () => {
    setCustomPlan({ ...customPlan, semesters: generatedSemesters });
    setIsPlanEdited(false);
  };

  const generateCustomPlan = async (
    overrideInjections?: Set<string>,
    overrideDoubleMajorId?: string | null
  ) => {
    const effectiveInjections = overrideInjections ?? injectedMinors;
    const effectiveDoubleMajorId =
      overrideDoubleMajorId !== undefined ? overrideDoubleMajorId : selectedDoubleMajorId;
    const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!activePlanner || !dashboardData) return;

    const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
    const mpuCourseList: any[] = dashboardData.mpuCourseList ?? [];

    const allTranscriptRows = [...courseList, ...mpuCourseList];

    // Only exclude passed and in-progress units. Future pre-enrollments go back
    // into the pool so the scheduler can repack them as the single source of
    // truth, and so do failed units (N / SN) so they get rescheduled as retakes.
    const rawCompletedCodes = getCompletedUnitCodes(allTranscriptRows);
    const concededPassCodes = getConcededPassUnitCodes(allTranscriptRows);
    const passedSet = new Set(rawCompletedCodes);

    // Identify all remaining units the student has NOT passed yet
    const unpassedPlannerUnits = (activePlanner?.units ?? []).filter(
      (tu: any) => tu.unit && !passedSet.has(tu.unit.unit_code?.trim().toUpperCase())
    );

    // Collect all unit codes that act as prerequisites for those remaining units
    const activePrereqCodes = new Set<string>();
    // Which specific unpassed unit(s) each prerequisite code is needed by,
    // purely for the conceded_pass_retake warning below, so the advisor sees
    // which unit(s) forced a retake rather than just "something needed it".
    // Does not affect activePrereqCodes or anything the scheduler decides.
    const prereqBlockedBy = new Map<string, Set<string>>();
    for (const tu of unpassedPlannerUnits) {
      for (const group of tu.unit.requisite_groups ?? []) {
        for (const cond of group.conditions ?? []) {
          if (cond.type === 'unit' && cond.unit?.unit_code) {
            const reqType = cond.requisite_type ?? 'prerequisite';
            if (reqType === 'prerequisite' || reqType === 'corequisite') {
              const reqCode = cond.unit.unit_code.trim().toUpperCase();
              activePrereqCodes.add(reqCode);
              if (!prereqBlockedBy.has(reqCode)) prereqBlockedBy.set(reqCode, new Set());
              prereqBlockedBy.get(reqCode)!.add(tu.unit.unit_code.trim().toUpperCase());
            }
          }
        }
      }
    }

    // A Conceded Pass only needs to be retaken if it is an active prerequisite
    const blockingConcededPasses = new Set(
      concededPassCodes.filter((cpCode) => activePrereqCodes.has(normaliseCode(cpCode)))
    );

    // Visibility only: name which unit(s) forced each retake, so the advisor
    // can tell "genuinely failed" apart from "passed with a Conceded Pass,
    // but a prerequisite chain forces a clean retake anyway". Does not change
    // which units get retaken (see completedForScheduler/effectiveConcededPasses).
    const newConcededPassRetakeWarnings: PlanWarning[] = [...blockingConcededPasses].map((code) => ({
      kind: 'conceded_pass_retake',
      unitCode: code,
      blockedUnitCodes: [...(prereqBlockedBy.get(normaliseCode(code)) ?? [])].sort(),
    }));

    // Completed for scheduler: Keep non-blocking CP as completed; only retake blocking CP
    const completedForScheduler = rawCompletedCodes.filter(
      (code) => !blockingConcededPasses.has(normaliseCode(code))
    );

    const transcriptStates = resolveUnitStates(allTranscriptRows);
    const retakeCodes = new Set([
      ...[...transcriptStates].filter(([, state]) => state === 'must_retake').map(([code]) => code),
      ...blockingConcededPasses,
    ]);

    const effectiveConcededPasses = concededPassCodes.filter(
      (code) => !blockingConcededPasses.has(normaliseCode(code))
    );

    setCustomPlanLoading(true);
    try {
      const res = await fetch('/api/custom-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerId: activePlanner.id,
          completedUnitCodes: completedForScheduler,
          concededPassUnitCodes: effectiveConcededPasses,
          courseList: scrapedStudent?.student?.courseList ?? [],
          injectedMinorIds: [...effectiveInjections],
          selectedDoubleMajorId: effectiveDoubleMajorId,
          // A restored session's synthetic transcript carries no terms (the
          // payload is codes only), so the server's own resolveNextStudyTerm
          // fallback would derive Year 1 Semester 1 from zero terms, not the
          // saved plan's real position. Explicit here, and ONLY here: a
          // normal session must send exactly the body it always has.
          ...(restoredSession ? { startYear: restoredSession.startYear, startSemester: restoredSession.startSemester } : {}),
        }),
      });

      if (!res.ok) { showToast('Failed to generate custom pathway.', 'error'); return; }
      const data = await res.json();
      if (data.success) {
        setCustomPlan(data.data);
        setBreakMilestones(data.breakMilestones ?? []);
        setCustomWilSlot(null);
        setCustomPlanStart({ year: data.startYear, semester: data.startSemester });
        setRetakeUnitCodes(retakeCodes);
        setConcededPassRetakeWarnings(newConcededPassRetakeWarnings);
        setPlanUnits([...(data.units ?? []), ...(data.mpuUnits ?? [])]);
        setPlanIntakeSemester(data.intakeSemester === 2 ? 2 : 1);
        setPlanCompletedUnits(data.completedUnits ?? []);
        setPlanElectiveCandidates(data.electiveCandidates ?? []);
        setPlanRequirements(data.requirements ?? []);
        setAllDatabaseMpus(data.allMpuUnits ?? []);
        setGeneratedSemesters(data.data.semesters);
        setAvailableDoubleMajors(data.availableDoubleMajors ?? []);
        setAvailableMinors(data.availableMinors ?? []);
        setIsPlanEdited(false);
      } else {
        showToast('Failed to generate custom pathway.', 'error');
      }
    } catch {
      showToast('Failed to generate custom pathway.', 'error');
    } finally {
      setCustomPlanLoading(false);
    }
  };

  const toggleDoubleMajor = (plannerId: string) => {
    if (customPlan && !confirmDiscardEdits()) return;
    const next = selectedDoubleMajorId === plannerId ? null : plannerId;
    setSelectedDoubleMajorId(next);
    generateCustomPlan(injectedMinors, next);
  };

  const toggleMinorInjection = (minorId: string) => {
    if (customPlan && !confirmDiscardEdits()) return;
    const next = new Set(injectedMinors);
    if (next.has(minorId)) next.delete(minorId);
    else next.add(minorId);
    setInjectedMinors(next);
    generateCustomPlan(next, selectedDoubleMajorId);
  };

  const selectedPlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];

  // Untrusted input from here down: an advisor-supplied .xlsx or .pdf file,
  // not a scraped transcript. Every step below either rejects outright with
  // a clear message (REQ: no plan-only fallback this sprint) or skips the
  // offending item and reports it, and never evaluates a formula, builds
  // HTML, or uses a cell value to build a query/path/command.

  /** Reads the Plan Data sheet from an .xlsx workbook's raw bytes. Never throws. */
  const extractPayloadFromExcelBytes = async (buffer: ArrayBuffer): Promise<ReturnType<typeof rowsToPayload>> => {
    if (buffer.byteLength > MAX_PLAN_FILE_BYTES) {
      return { error: 'This file is too large to be a plan export.' };
    }
    const XLSX = await import('xlsx-js-style');
    let wb;
    try {
      wb = XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false });
    } catch {
      return { error: 'Could not read this file. Make sure it is a valid .xlsx file.' };
    }

    const planDataWs = wb.Sheets[PLAN_DATA_SHEET_NAME];
    if (!planDataWs) {
      return { error: 'This file has no "Plan Data" sheet, so it cannot be restored. It may be from an older export, or that sheet was removed.' };
    }

    // Cap the sheet's declared dimensions before converting it to JSON, so
    // a hostile file cannot claim an enormous range and exhaust memory.
    const ref = (planDataWs as any)['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      if (range.e.r - range.s.r > PLAN_FILE_LIMITS.maxRows + 5) {
        return { error: "This file's Plan Data sheet is larger than a plan export should ever be." };
      }
    }

    const planDataRows = XLSX.utils.sheet_to_json(planDataWs, { header: 1, raw: false }) as string[][];
    return rowsToPayload(planDataRows.slice(1)); // row 0 is the human-readable note, not data
  };

  /** Reads the restore payload from a PDF's Keywords property, via the server (pdfjs-dist never runs client-side). Never throws. */
  const extractPayloadFromPdfBytes = async (buffer: ArrayBuffer): Promise<ReturnType<typeof decodePayloadFromPdf>> => {
    if (buffer.byteLength > MAX_PDF_FILE_BYTES) {
      return { error: 'This file is too large to be a plan export.' };
    }
    let keywords: string | null;
    try {
      const res = await fetch('/api/plan-file/read-pdf', { method: 'POST', body: buffer });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { error: data.error ?? 'This PDF could not be read.' };
      }
      keywords = data.keywords;
    } catch {
      return { error: 'This PDF could not be read.' };
    }
    return decodePayloadFromPdf(keywords);
  };

  /**
   * Everything after a payload has been validated: planner resolution,
   * the restoredSession slot, the generate-then-overlay rebuild, and the
   * import report. Shared by both readers so the Excel path's behaviour
   * stays exactly what it was before the PDF path existed.
   */
  const restoreFromPayload = async (
    payload: PlanPayload,
    issues: { message: string }[],
    source: 'excel' | 'pdf'
  ) => {
      const resolveRes = await fetch('/api/plan-file/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planner: payload.planner,
          minorNames: payload.minorNames,
          doubleMajorMajorName: payload.doubleMajorMajorName,
          outsidePlannerUnitCodes: payload.outsidePlannerUnitCodes,
        }),
      });
      const resolveData = await resolveRes.json();
      if (!resolveRes.ok || !resolveData.success) {
        showToast(resolveData.error ?? 'Could not find a matching planner for this file.', 'error');
        return;
      }

      // A synthetic, codes-only transcript: the restored session never holds
      // a real grade or term, only enough to make resolveUnitStates and
      // getCompletedUnitCodes/getConcededPassUnitCodes agree with the file.
      const concededPassSet = new Set(payload.concededPassUnitCodes);
      const syntheticCourseList = payload.completedUnitCodes.map((code) => ({
        courseId: code, courseTitle: code, credits: 0, creditsEarned: 0,
        status: 'Complete', grade: concededPassSet.has(code) ? 'CP' : 'HD', term: '',
      }));

      setRestoredSession({
        scrapedStudent: { studentId: 'restored', student: { courseList: syntheticCourseList, selectedEnrollment: '' } as any },
        dashboardData: { completedCodes: payload.completedUnitCodes, mpuCourseList: [], planners: [resolveData.planner] },
        exportDate: payload.exportDate,
        source,
        startYear: payload.startYear,
        startSemester: payload.startSemester,
      });

      const genRes = await fetch('/api/custom-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerId: resolveData.planner.id,
          completedUnitCodes: payload.completedUnitCodes,
          concededPassUnitCodes: payload.concededPassUnitCodes,
          courseList: [],
          injectedMinorIds: resolveData.minorIds,
          selectedDoubleMajorId: resolveData.doubleMajorPlannerId,
          startYear: payload.startYear,
          startSemester: payload.startSemester,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok || !genData.success) {
        showToast('Failed to rebuild this plan from the matched planner.', 'error');
        setRestoredSession(null);
        return;
      }

      const overlay = overlayRestoredArrangement(payload, {
        units: genData.units ?? [],
        mpuUnits: genData.mpuUnits ?? [],
        electiveCandidates: genData.electiveCandidates ?? [],
        completedUnits: genData.completedUnits ?? [],
        outsidePlannerUnits: resolveData.outsidePlannerUnits ?? [],
      });

      setCustomPlan({ semesters: overlay.semesters, unschedulableUnits: genData.data.unschedulableUnits, warnings: genData.data.warnings });
      setGeneratedSemesters(genData.data.semesters);
      setBreakMilestones(genData.breakMilestones ?? []);
      setCustomPlanStart({ year: payload.startYear, semester: payload.startSemester });
      setPlanUnits([...(genData.units ?? []), ...(genData.mpuUnits ?? [])]);
      setPlanIntakeSemester(genData.intakeSemester === 2 ? 2 : 1);
      setPlanCompletedUnits(genData.completedUnits ?? []);
      setPlanElectiveCandidates(genData.electiveCandidates ?? []);
      setPlanRequirements(genData.requirements ?? []);
      setAllDatabaseMpus(genData.allMpuUnits ?? []);
      setAvailableDoubleMajors(genData.availableDoubleMajors ?? []);
      setAvailableMinors(genData.availableMinors ?? []);
      setPlanExtraUnits(resolveData.outsidePlannerUnits ?? []);
      setCustomMpuList(payload.customMpuList);
      setCustomWilSlot(payload.customWilSlot);
      setInjectedMinors(new Set(resolveData.minorIds));
      setSelectedDoubleMajorId(resolveData.doubleMajorPlannerId);
      setRetakeUnitCodes(new Set(payload.arrangement.filter((u) => u.retake).map((u) => normaliseCode(u.code))));
      setConcededPassRetakeWarnings(
        payload.arrangement
          .filter((u) => u.concededPassRetake)
          .map((u): PlanWarning => ({ kind: 'conceded_pass_retake', unitCode: u.code, blockedUnitCodes: [] }))
      );
      // The saved arrangement is the advisor's, not the scheduler's own
      // output for this run, so it must be treated as edited: the page then
      // picks its warnings from validatePlan plus carried-forward warnings,
      // never from customPlan.warnings directly. See the warnings block above.
      setIsPlanEdited(true);

      setRestoreImportReport({
        restoredUnitCount: overlay.restoredUnitCount,
        restoredSemesterCount: overlay.restoredSemesterCount,
        skipped: [
          ...issues.map((i) => ({ code: '', reason: i.message })),
          ...overlay.skipped,
          ...resolveData.unmatchedMinorNames.map((n: string) => ({ code: n, reason: 'minor not found on the matched planner' })),
          ...(resolveData.doubleMajorUnmatched ? [{ code: payload.doubleMajorMajorName ?? '', reason: 'double major not found for this course/intake' }] : []),
          ...resolveData.unresolvedOutsidePlannerUnitCodes.map((c: string) => ({ code: c, reason: 'unit not found in the catalogue' })),
        ],
      });
      showToast('Plan restored from file.', 'success');
  };

  const handleRestoreFile = async (file: File) => {
    setIsRestoringPlan(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isPdf = bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
      const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // 'PK\x03\x04'

      let source: 'excel' | 'pdf';
      let result: { payload: PlanPayload; issues: { message: string }[] } | { error: string };
      if (isPdf) {
        source = 'pdf';
        result = await extractPayloadFromPdfBytes(buffer);
      } else if (isZip) {
        source = 'excel';
        result = await extractPayloadFromExcelBytes(buffer);
      } else {
        showToast('This file is not a supported plan export (.xlsx or .pdf).', 'error');
        return;
      }

      if ('error' in result) {
        showToast(result.error, 'error');
        return;
      }

      await restoreFromPayload(result.payload, result.issues, source);
    } finally {
      setIsRestoringPlan(false);
    }
  };

  if (!studentLoaded || !dashboardData || !selectedPlanner) {
    return (
      <EmptyState
        title="No student loaded"
        message="Search for a student on the Major Detection page first."
        actionLabel="Go to Major Detection"
        onAction={() => router.push(panelToPath('dashboard'))}
      >
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-color, rgba(255,255,255,0.1))', width: '100%', maxWidth: 360 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            or restore a previously exported plan (only the restore data inside the file is read — the "Plan Data" sheet for Excel, the document properties for PDF; edits made to the visible table or pages are ignored)
          </div>
          <label className={styles.btnSecondary} style={{ fontSize: 12, cursor: isRestoringPlan ? 'wait' : 'pointer', display: 'inline-block' }}>
            {isRestoringPlan ? 'Restoring…' : 'Import plan (Excel or PDF)'}
            <input
              type="file"
              accept=".xlsx,.pdf"
              disabled={isRestoringPlan}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleRestoreFile(file);
              }}
            />
          </label>
        </div>
      </EmptyState>
    );
  }

  // Major Detection shows only the course list for an MPU enrollment, with no pathway.
  if ((scrapedStudent?.student?.selectedEnrollment ?? '').includes('Mata Pelajaran Umum')) {
    return (
      <EmptyState
        title="No pathway for an MPU enrollment"
        message="Search the student's main enrollment on the Major Detection page."
        actionLabel="Go to Major Detection"
        onAction={() => router.push(panelToPath('dashboard'))}
      />
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.planActions} style={{ marginTop: 0 }}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => router.push(panelToPath('dashboard'))}
        >
          ← Back to Major Detection
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{scrapedStudent?.studentId}</span>
        {' · '}
        {selectedPlanner.major?.name ?? selectedPlanner.course?.name ?? 'Selected planner'}
        . Change the student or planner on the Major Detection page.
      </div>

      {restoredSession && (
        <div className={styles.mpuEmptyAlert} style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>
            Restored from {restoredSession.source === 'pdf' ? 'a PDF' : 'an Excel'} file exported on {new Date(restoredSession.exportDate).toLocaleDateString()}.
            Completed and in-progress units are as of that date.
            This file has not been verified against the student's record; confirm it before relying on it.
            {restoreImportReport && restoreImportReport.skipped.length > 0 && (
              <> {restoreImportReport.skipped.length} item{restoreImportReport.skipped.length !== 1 ? 's' : ''} skipped, see below.</>
            )}
          </span>
          <button
            type="button"
            className={styles.btnSecondary}
            style={{ fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => {
              setRestoredSession(null);
              setRestoreImportReport(null);
            }}
          >
            Close restored plan
          </button>
        </div>
      )}

      {restoreImportReport && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Restored {restoreImportReport.restoredUnitCount} unit{restoreImportReport.restoredUnitCount !== 1 ? 's' : ''} across {restoreImportReport.restoredSemesterCount} semester{restoreImportReport.restoredSemesterCount !== 1 ? 's' : ''}.
          {restoreImportReport.skipped.length > 0 && (
            <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
              {restoreImportReport.skipped.map((s, i) => (
                <li key={i}>{s.code ? `${s.code}: ` : ''}{s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Double Major Opportunities */}
      {(availableDoubleMajors.length > 0 || selectedDoubleMajorId !== null) && (
        <div className={styles.pathwaySection}>
          <div className={styles.sectionTitle}>Double Major Opportunities</div>
          <div className={styles.doubleMajorGrid}>
            {availableDoubleMajors.map((dm) => {
              const isSelected = selectedDoubleMajorId === dm.plannerId;

              return (
                <div
                  key={dm.plannerId}
                  className={`${styles.doubleMajorCard} ${isSelected ? styles.doubleMajorCardActive : ''}`}
                >
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>{dm.majorName}</span>
                      <Badge label="Double Major" cls="badgeYellow" />
                    </div>

                    <div className={styles.cardSubtitle}>
                      Requires <span className={styles.highlightCount}>{dm.neededCount}</span> unit{dm.neededCount !== 1 ? 's' : ''} to complete this major:
                    </div>

                    <div className={styles.chipList}>
                      {dm.units.map((u: any) => (
                        <span
                          key={u.code}
                          className={`${styles.unitChip}`}
                          title={u.name}
                        >
                          {u.code} · {u.name}
                        </span>
                      ))}
                    </div>

                    {isSelected && (
                      <div className={styles.injectedNotice}>
                        ✓ {dm.neededCount} core unit{dm.neededCount !== 1 ? 's' : ''} swapped into custom pathway elective slots.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`${isSelected ? styles.btnDanger : styles.btnSecondary} ${styles.cardActionBtn}`}
                    onClick={() => toggleDoubleMajor(dm.plannerId)}
                    disabled={customPlanLoading || (!isSelected && !dm.canFitInRemainingBudget)}
                    title={
                      !isSelected && !dm.canFitInRemainingBudget
                        ? `Not enough elective slots (needs ${dm.netNewUnitsNeeded ?? dm.neededCount}, only ${dm.remainingElectiveBudget ?? 0} available)`
                        : undefined
                    }
                  >
                    {isSelected
                      ? '✕ Remove from Plan'
                      : !dm.canFitInRemainingBudget
                      ? `Not enough slots (${dm.remainingElectiveBudget ?? 0} left)`
                      : '+ Include in Custom Plan'}
                  </button>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Minors & Specializations */}
      {(availableMinors.length > 0 || injectedMinors.size > 0) && (
        <div className={styles.pathwaySection}>
          <div className={styles.sectionTitle}>Minors & Specializations</div>
          <div className={styles.doubleMajorGrid}>
            {availableMinors.map((minor) => {
              const isInjected = injectedMinors.has(minor.minorId);

              return (
                <div
                  key={minor.minorId}
                  className={`${styles.doubleMajorCard} ${isInjected ? styles.doubleMajorCardActive : ''}`}
                >
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>{minor.minorName}</span>
                      <Badge label="Minor" cls="badgeYellow" />
                    </div>

                    <div className={styles.cardSubtitle}>
                      Requires <span className={styles.highlightCount}>{minor.neededCount}</span> unit{minor.neededCount !== 1 ? 's' : ''} to complete this specialization:
                    </div>

                    <div className={styles.chipList}>
                      {minor.units.map((u: any) => (
                        <span
                          key={u.code}
                          className={styles.unitChip}
                          title={u.name}
                        >
                          {u.code} · {u.name}
                        </span>
                      ))}
                    </div>

                    {isInjected && (
                      <div className={styles.injectedNotice}>
                        ✓ {minor.neededCount} unit{minor.neededCount !== 1 ? 's' : ''} will be injected into the custom pathway.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`${isInjected ? styles.btnDanger : styles.btnSecondary} ${styles.cardActionBtn}`}
                    onClick={() => toggleMinorInjection(minor.minorId)}
                    disabled={customPlanLoading || (!isInjected && !minor.canFitInRemainingBudget)}
                    title={
                      !isInjected && !minor.canFitInRemainingBudget
                        ? `Not enough elective slots (needs ${minor.netNewUnitsNeeded ?? minor.neededCount}, only ${minor.remainingElectiveBudget ?? 0} available)`
                        : undefined
                    }
                  >
                    {isInjected
                      ? '✕ Remove from Plan'
                      : !minor.canFitInRemainingBudget
                      ? `Not enough slots (${minor.remainingElectiveBudget ?? 0} left)`
                      : '+ Include in Custom Plan'}
                  </button>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Study Pathway */}
      {(() => {
        const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
        if (!activePlanner) return null;

        const allTranscriptUnits = [
          ...(scrapedStudent?.student?.courseList ?? []),
          ...(dashboardData?.mpuCourseList ?? []),
        ];

        const transcriptStates = resolveUnitStates(allTranscriptUnits);
        const completeCodes = new Set(
          [...transcriptStates].filter(([, state]) => state === 'passed').map(([code]) => code)
        );
        const currentCodes = new Set(
          [...transcriptStates].filter(([, state]) => state === 'in_progress').map(([code]) => code)
        );
        // Units that are neither complete nor actively enrolled = truly unplanned
        const takenCodes = new Set([...completeCodes, ...currentCodes]);

        const isReqUnit = (u: any) =>
          u.unit !== null &&
          u.category !== 'mpu' &&
          (u.category === 'core' || u.category === 'major_core' || u.category === 'prescribed_elective' || u.category === 'elective');

        const unplannedUnits = (activePlanner?.units ?? []).filter(
          (u: any) => isReqUnit(u) && !takenCodes.has(u.unit.unit_code?.toUpperCase())
        );
        const inProgressUnits = (activePlanner?.units ?? []).filter(
          (u: any) => isReqUnit(u) && currentCodes.has(u.unit.unit_code?.toUpperCase())
        );

        // Minor units the student has opted-in to but hasn't taken yet
        const injectedMinorMissingCount = (activePlanner?.minors ?? [])
          .filter((m: any) => injectedMinors.has(m.id))
          .reduce((sum: number, m: any) => {
            const missingFromMinor = m.units.filter(
              (mu: any) => !takenCodes.has(mu.unit?.unit_code?.trim().toUpperCase())
            ).length;
            return sum + missingFromMinor;
          }, 0);

        // Never hides this section on totalUnplanned === 0: a near-graduation
        // student can still have MPU or WIL units outstanding (excluded from
        // isReqUnit above), and the advisor needs Add semester/Download/the
        // summary box regardless of how little (or nothing) remains to place.
        const totalUnplanned = unplannedUnits.length + injectedMinorMissingCount;

        return (
          <div>
            <div className={styles.sectionTitle} style={{ marginTop: 20 }}>
              Extended Study Plan
              {isPlanEdited && <span className={styles.editedTag}>edited</span>}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(244,135,113,0.35)', borderRadius: 4, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-orange)' }}>{totalUnplanned}</span> unplanned unit{totalUnplanned !== 1 ? 's' : ''}
                {inProgressUnits.length > 0 && (
                  <span style={{ color: 'var(--accent-green)' }}> · {inProgressUnits.length} in progress this semester</span>
                )}.{' '}
                Generate a custom pathway to complete this degree.
              </div>
              <button
                className={styles.btnPrimary}
                style={{ fontSize: 12 }}
                onClick={() => {
                  if (confirmDiscardEdits()) {
                    // Reset all active selections when regenerating the baseline pathway
                    setSelectedDoubleMajorId(null);
                    setInjectedMinors(new Set());
                    generateCustomPlan(new Set(), null);
                  }
                }}
                disabled={customPlanLoading}
              >
                {customPlanLoading
                  ? 'Generating…'
                  : customPlan
                  ? 'Regenerate Pathway'
                  : 'Generate Custom Pathway'}
              </button>
            </div>

            {customPlan && (() => {
              const semesters: CustomSemesterBucket[] = customPlan.semesters ?? [];
              // Completed units are in here too, so the requirement totals can
              // credit what the student has already passed. Catalogue units are
              // on no planner, so without them validatePlan would report every
              // one as no_offering_data and never check its requisites. The planner's
              // elective list is here for the same reason, and goes first so an entry
              // the plan already holds for a unit is never overridden by its copy.
              const unitData = new Map(
                [...planElectiveCandidates, ...planUnits, ...planCompletedUnits, ...planExtraUnits].map((u) => [normaliseCode(u.code), u])
              );
              const milestoneCodes = new Set(breakMilestones.map((bm: any) => normaliseCode(bm.unitCode)));

              const placedCodes = new Set([
                ...semesters.flatMap((s) => s.units.map((u) => normaliseCode(u.code))),
                ...milestoneCodes,
              ]);

              // Exclude units placed in the custom plan from completed history to avoid double-counting retakes
              const validatedCompletedCodes = (dashboardData?.completedCodes ?? []).filter(
                (code: string) => !placedCodes.has(normaliseCode(code))
              );

              const validatedConcededPassCodes = getConcededPassUnitCodes(allTranscriptUnits).filter(
                (code: string) => !placedCodes.has(normaliseCode(code))
              );

              // Synthesize a virtual container for active break milestones so validatePlan credits their credit points
              const validationSemesters = breakMilestones.length > 0
                ? [
                    ...semesters,
                    {
                      year: 99,
                      semester: 1 as const,
                      units: breakMilestones.map((bm: any) => ({
                        code: bm.unitCode,
                        name: bm.unitName,
                        category: 'wil',
                        creditPoints: bm.creditPoints ?? 25,
                        offeringSemesters: [1, 2] as (1 | 2)[],
                        requisiteGroups: [],
                      })),
                    },
                  ]
                : semesters;

              const validation = validatePlan({
                semesters: validationSemesters,
                completedUnitCodes: validatedCompletedCodes,
                concededPassUnitCodes: validatedConcededPassCodes,
                intakeSemester: planIntakeSemester,

                // Every prescribed elective is treated as compulsory. A Swinburne
                // planner stars the compulsory ones ("* Compulsory Pre-scribed
                // Elective"), but the seed records no star, and a unit that is a
                // prescribed elective on one planner is major core on another. So
                // this errs towards warning: if one is really optional the advisor
                // sees a false "required to graduate", which is visible and easy to
                // dismiss, where the other way round a student silently skips a
                // compulsory unit. Revisit if the client says only starred ones are.
                requiredUnits: planUnits.filter(
                  (u) =>
                    u.category === 'core' ||
                    u.category === 'major_core' ||
                    u.category === 'prescribed_elective'
                ),
                unitData,
                requirements: planRequirements,
              });

              // Specific units that must be completed (Core, Major Core, Double Major, Minor)
              const specificUnplacedUnits = planUnits.filter(
                (u) =>
                  u.category !== 'mpu' &&
                  u.category !== 'elective' &&
                  !u.recommended &&
                  !placedCodes.has(normaliseCode(u.code))
              );

              // Check if the validator reports an elective shortfall
              const hasElectiveShortfall = validation.some(
                (w) => w.kind === 'requirement_shortfall' && w.category === 'elective'
              );

              // Unplaced units list for the dropdown: specific units + generic elective slot if needed
              const unplacedUnits: SchedulableUnit[] = [
                ...specificUnplacedUnits,
                ...(hasElectiveShortfall
                  ? [
                      {
                        code: 'ELECTIVE',
                        name: 'Elective Slot (To be selected)',
                        category: 'elective',
                        creditPoints: 12.5,
                        offeringSemesters: [1, 2] as (1 | 2)[],
                        requisiteGroups: [],
                      },
                    ]
                  : []),
              ];

              // A freshly generated plan already carries the scheduler's own
              // warnings. Once edited, the arrangement is the advisor's, so it
              // has to be re-checked.
              const warnings: PlanWarning[] = [
                ...(isPlanEdited
                  ? [
                      ...validation,
                      // The generator's findings about units it never placed stay
                      // true until the advisor places them
                      ...carryForwardWarnings(customPlan.warnings ?? [], semesters),
                    ]
                  : [
                      ...(customPlan.warnings ?? []),
                      // The scheduler places what it is given and never counts the
                      // total, so a plan short of a category's credit points comes
                      // out clean. That shortfall is worth saying before any edit.
                      // compulsory_missing is the same: the scheduler places a unit
                      // or reports why it could not (requisite_violation, already in
                      // customPlan.warnings above), but never checks the finished
                      // plan against the full required-unit list the way validatePlan
                      // does, so a compulsory unit silently absent from a fresh plan
                      // needs this to be said before any edit too.
                      ...validation.filter(
                        (w) =>
                          w.kind === 'requirement_shortfall' ||
                          w.kind === 'requirement_excess' ||
                          w.kind === 'compulsory_missing',
                      ),
                    ]),
                // Set once at generation time, same as retakeUnitCodes/the RETAKE
                // badge. The substitution decision stays true regardless of edits.
                ...concededPassRetakeWarnings,
              ];

              // Which retaken units are a Conceded Pass substitution rather than a
              // genuine fail, so the RETAKE badge's own tooltip can say which one
              // this is instead of always assuming a fail.
              const concededPassRetakeCodes = new Set(
                concededPassRetakeWarnings
                  .filter((w): w is Extract<PlanWarning, { kind: 'conceded_pass_retake' }> => w.kind === 'conceded_pass_retake')
                  .map((w) => normaliseCode(w.unitCode))
              );

              const overCapacity = new Map<string, Extract<PlanWarning, { kind: 'over_capacity' }>>();
              const byUnit = new Map<string, string[]>();
              const messages: string[] = [];
              // Messages that get a Choose elective button: an elective shortfall has no
              // row left to swap, so this is where an advisor fills the gap.
              const chooseElectiveMessages = new Set<string>();
              for (const w of warnings) {
                // Identify which unit this warning is about (if any)
                const unitCode = warningUnitCode(w);
                const targetCode = unitCode ? normaliseCode(unitCode) : null;
                const targetUnit = targetCode ? unitData.get(targetCode) : null;

                // Suppress all warnings for generic placeholder slots (e.g. ELECTIVE)
                if (targetCode === 'ELECTIVE' || ('unitCode' in w && normaliseCode(w.unitCode) === 'ELECTIVE')) {
                  continue;
                }

                // Suppress all warnings for MPU units
                if (
                  (targetUnit && targetUnit.category === 'mpu') ||
                  (targetCode && targetCode.startsWith('MPU')) ||
                  ('category' in w && (w as any).category === 'mpu') ||
                  ('unitCodes' in w && (w as any).unitCodes?.every((c: string) => c.startsWith('MPU')))
                ) {
                  continue; // Skip this warning completely
                }

                if (w.kind === 'short_term_only') {
                  continue;
                }

                // Suppress WIL shortfall if breakMilestones already fulfills the required credit points
                const totalWilMilestoneCp = breakMilestones.reduce((sum: number, bm: any) => sum + (bm.creditPoints ?? 0), 0);
                if (w.kind === 'requirement_shortfall' && w.category === 'wil' && totalWilMilestoneCp >= w.need) {
                  continue;
                }

                // Normal warning handling continues below...
                const message = describeWarning(w, DEFAULT_SCHEDULER_CONFIG.maxSemesters, planIntakeSemester);
                if (message && w.kind === 'requirement_shortfall' && w.category === 'elective') {
                  chooseElectiveMessages.add(message);
                }
                if (w.kind === 'over_capacity') {
                  overCapacity.set(`${w.year}-${w.semester}`, w);
                  continue;
                }
                // A warning about a unit that is not in the plan has no row to
                // sit on, so it belongs in the list below instead of vanishing
                const code = unitCode && placedCodes.has(normaliseCode(unitCode)) ? unitCode : null;
                if (code && message) {
                  const key = normaliseCode(code);
                  byUnit.set(key, [...(byUnit.get(key) ?? []), message]);
                } else if (message) {
                  messages.push(message);
                }
              }

              const addUnitToSemester = (code: string, bucket: CustomSemesterBucket) => {
                // If adding a generic elective placeholder slot
                if (code === 'ELECTIVE') {
                  const electiveSlot: SchedulableUnit = {
                    code: 'ELECTIVE',
                    name: 'Elective (To be selected)',
                    category: 'elective',
                    creditPoints: 12.5,
                    offeringSemesters: [1, 2],
                    requisiteGroups: [],
                  };
                  applyEdit(addUnit(semesters, electiveSlot, bucket.year, bucket.semester));
                  return;
                }

                const unit = planUnits.find((u) => normaliseCode(u.code) === normaliseCode(code));
                if (unit) applyEdit(addUnit(semesters, unit, bucket.year, bucket.semester));
              };

              const completedKeys = new Set(
                (dashboardData?.completedCodes ?? []).map((code: string) => normaliseCode(code))
              );
              const isMpuCode = (code: string) => normaliseCode(code).startsWith('MPU');
              const milestoneUnitCodes = new Set(breakMilestones.map((bm: any) => normaliseCode(bm.unitCode)));
              const isWilUnit = (u: any) =>
                u.category === 'wil' ||
                milestoneUnitCodes.has(normaliseCode(u.code)) ||
                normaliseCode(u.code).startsWith('ICT20016') ||
                normaliseCode(u.code).startsWith('SWE40001');

              const poolCategory = new Map(planUnits.map((u) => [normaliseCode(u.code), u.category]));
              const candidateKeys = new Set(planElectiveCandidates.map((u) => normaliseCode(u.code)));

              // Section one is the planner's own elective list. A prescribed elective
              // or a double major unit that the plan already names has its own place,
              // and choosing it here would quietly change its category.
              const pickerPlannerUnits = planElectiveCandidates.filter((u) => {
                const key = normaliseCode(u.code);
                const named = poolCategory.get(key);
                return (
                  !placedCodes.has(key) &&
                  !completedKeys.has(key) &&
                  !isMpuCode(u.code) &&
                  !isWilUnit(u) &&
                  (named === undefined || named === 'elective')
                );
              });

              // Section two is everything else. The route drops what the planner
              // template names, but the pool also holds recommended electives and
              // injected minor units, which the "+ Add unit" dropdown already
              // offers, so the pool is filtered here too. Units in section one
              // stay out, so no unit is offered twice.
              const pickerCatalogueUnits = catalogue.filter((u) => {
                const key = normaliseCode(u.code);
                return (
                  !placedCodes.has(key) &&
                  !poolCategory.has(key) &&
                  !candidateKeys.has(key) &&
                  !completedKeys.has(key) &&
                  !isMpuCode(u.code) &&
                  !isWilUnit(u)
                );
              });

              // Semesters as the plan shows them, for the picker that lets the
              // advisor choose one. The default is the earliest with room under
              // the normal load, else the last, where the over-capacity note will say so.
              const normalLoad = normalLoadFor(DEFAULT_SCHEDULER_CONFIG);
              const shownSemesters = semesters.filter(
                (sem) => sem.units.some((u) => u.category !== 'mpu') || isPlanEdited
              );
              const pickerSlots: PickerSlot[] = shownSemesters.map((sem) => {
                const term = calendarTermFor(sem.semester, planIntakeSemester);
                return {
                  key: `${sem.year}-${sem.semester}`,
                  label: `Y${sem.year} S${sem.semester} · ${monthsOf(term)}`,
                  term,
                };
              });
              const roomy = shownSemesters.find(
                (sem) => sem.units.filter((u) => u.category !== 'mpu').length < normalLoad
              ) ?? shownSemesters[shownSemesters.length - 1];
              const defaultSlotKey = roomy ? `${roomy.year}-${roomy.semester}` : '';
              const activeSlotKey = pickerSlots.some((slot) => slot.key === pickerSlotKey)
                ? pickerSlotKey
                : defaultSlotKey;
              const activeSlot = pickerSlots.find((slot) => slot.key === activeSlotKey);

              // Helper to check if a candidate unit's prerequisites are fulfilled prior to the target semester
              const getUnmetPrereqReasonForSlot = (targetYear: number, targetSemester: 1 | 2) => {
                // Collect all unit codes completed prior to this semester slot
                const completedPrior = new Set<string>([
                  ...(dashboardData?.completedCodes ?? []).map((c: string) => normaliseCode(c)),
                ]);

                // Add units from earlier planned semesters
                for (const s of semesters) {
                  if (s.year < targetYear || (s.year === targetYear && s.semester < targetSemester)) {
                    for (const u of s.units) {
                      if (u.code !== 'ELECTIVE') {
                        completedPrior.add(normaliseCode(u.code));
                      }
                    }
                  }
                }

                return (candidate: SchedulableUnit): string | null => {
                  const meta = unitData.get(normaliseCode(candidate.code)) ?? candidate;
                  const reqGroups = meta.requisiteGroups ?? [];
                  if (reqGroups.length === 0) return null;

                  for (const group of reqGroups) {
                    const missingUnits: string[] = [];
                    let groupSatisfied = false;

                    for (const cond of group) {
                      const reqCode = cond.unitCode ? normaliseCode(cond.unitCode) : null;
                      if (reqCode && completedPrior.has(reqCode)) {
                        groupSatisfied = true;
                        break;
                      }
                      if (cond.unitCode) missingUnits.push(cond.unitCode);
                    }

                    if (!groupSatisfied && missingUnits.length > 0) {
                      return `Needs ${missingUnits.join(' or ')}`;
                    }
                  }
                  return null;
                };
              };

              const chooseElective = (
                unit: SchedulableUnit,
                source: PickerSource,
                year: number,
                semester: 1 | 2,
                isExtra: boolean = false
              ) => {
                if (!picker) return;
                // The advisor's own choice, so never a recommendation. Only a unit
                // from outside the planner is tagged as such.
                const chosen = {
                  ...unit,
                  category: 'elective',
                  recommended: false,
                  outsidePlanner: source === 'catalogue',
                  isExtraUnit: isExtra || (picker as any).isExtraUnit || false,
                };
                if (source === 'catalogue') {
                  // Kept in the session as well as the plan, so validatePlan can
                  // still read its offerings and requisites after the edit.
                  setPlanExtraUnits((current) =>
                    current.some((u) => normaliseCode(u.code) === normaliseCode(unit.code))
                      ? current
                      : [...current, chosen]
                  );
                }
                applyEdit(
                  picker.mode === 'replace'
                    ? replaceUnit(semesters, picker.oldCode, chosen, { year, semester })
                    : addUnit(semesters, chosen, year, semester)
                );
                setPicker(null);
              };

              const moveUnitToSlot = (code: string, slot: string) => {
                const [year, semester] = slot.split('-').map(Number);
                applyEdit(moveUnit(semesters, code, year, semester as 1 | 2));
              };

              const restoreUnitToOriginalSlot = (code: string) => {
                const unit = planUnits.find((u) => normaliseCode(u.code) === normaliseCode(code));
                if (!unit) return;

                const savedSlot = removedUnitSlots?.[normaliseCode(code)];
                // Check if the original semester bucket still exists
                let targetBucket = savedSlot
                  ? semesters.find((s) => s.year === savedSlot.year && s.semester === savedSlot.semester)
                  : null;

                // Fallback if the original semester was deleted
                if (!targetBucket && semesters.length > 0) {
                  targetBucket = semesters[semesters.length - 1];
                }

                if (targetBucket) {
                  applyEdit(addUnit(semesters, unit, targetBucket.year, targetBucket.semester));
                  showToast(`Restored ${unit.code} back to Year ${targetBucket.year} Semester ${targetBucket.semester}.`, 'info');
                }
              };

              const handleDirectPdfDownload = async () => {
                // Check if any generic unselected elective slots exist in the pathway
                const unselectedElectiveCount = semesters
                  .flatMap((s) => s.units)
                  .filter((u) => u.code === 'ELECTIVE').length;

                if (unselectedElectiveCount > 0) {
                  showToast(
                    `Please select a unit for all elective slots (${unselectedElectiveCount} remaining) before downloading the PDF.`,
                    'info'
                  );
                  return;
                }


                setIsExporting(true);
                showToast('Generating official study plan PDF...', 'info');

                try {
                  const { default: jsPDF } = await import('jspdf');
                  const { default: autoTable } = await import('jspdf-autotable');

                  const primaryMilestone = breakMilestones?.[0];
                  const activeWilSlot = customWilSlot ?? primaryMilestone?.insertBeforeSlotKey;
                  const allTranscriptUnits = [
                    ...(scrapedStudent?.student?.courseList ?? []),
                    ...(dashboardData?.mpuCourseList ?? []),
                  ];
                  const transcriptStates = resolveUnitStates(allTranscriptUnits);
                  const completeCodes = new Set(
                    [...transcriptStates].filter(([, state]) => state === 'passed').map(([code]) => code)
                  );
                  const currentCodes = new Set(
                    [...transcriptStates].filter(([, state]) => state === 'in_progress').map(([code]) => code)
                  );
                  const takenCodes = new Set([...completeCodes, ...currentCodes]);
                  const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
                  const defaultRemainingMpus = getRemainingMpuUnits(activePlanner, dashboardData, takenCodes);
                  const remainingMpus = customMpuList ?? defaultRemainingMpus;
                  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

                  // Header: Course Title & Major
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(16);
                  doc.setTextColor(0, 0, 0);
                  doc.text((selectedPlanner?.course?.name ?? 'Course Study Plan').toUpperCase(), 14, 18);

                  doc.setFontSize(11);
                  doc.setFont('helvetica', 'bold');
                  doc.setTextColor(0, 0, 0);
                  doc.text(`Major: ${selectedPlanner?.major?.name ?? 'Standard Pathway'}`, 14, 25);

                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(9);
                  doc.setTextColor(0, 0, 0);
                  const intakeSem = selectedPlanner?.intake_month != null && selectedPlanner.intake_month >= 7 ? 'Semester 2' : 'Semester 1';
                  doc.text(`Intake: Year ${selectedPlanner?.intake_year ?? ''} (${intakeSem}) · Custom Study Pathway`, 14, 30);

                  let currentY = 36;

                  // Group Semesters by Academic Year
                  const yearsMap = new Map<number, CustomSemesterBucket[]>();
                  for (const s of semesters) {
                    if (!yearsMap.has(s.year)) yearsMap.set(s.year, []);
                    yearsMap.get(s.year)!.push(s);
                  }

                  const hexToRgb = (hex: string): [number, number, number] => {
                    const clean = hex.replace('#', '');
                    return [
                      parseInt(clean.substring(0, 2), 16),
                      parseInt(clean.substring(2, 4), 16),
                      parseInt(clean.substring(4, 6), 16),
                    ];
                  };

                  const getCategoryColor = (category: string): [number, number, number] => {
                    if (category === 'core') return hexToRgb('#c6d9f1');
                    if (category === 'major_core') return hexToRgb('#fde9d9');
                    if (category === 'wil') return hexToRgb('#b2a1c7');
                    if (category === 'mpu') return hexToRgb('#e5b8b7');
                    return hexToRgb('#d6e3bc'); // Electives
                  };

                  const getCategoryLabel = (category: string, code: string) => {
                    if (code === 'ELECTIVE') return 'Elective';
                    if (category === 'core') return 'Core';
                    if (category === 'major_core') return 'Major Core';
                    if (category === 'prescribed_elective') return 'Prescribed Elective';
                    if (category === 'double_major') return 'Double Major';
                    if (category === 'minor') return 'Minor Elective';
                    if (category === 'wil') return 'Work-Integrated Learning';
                    if (category === 'mpu') return 'MPU';
                    return 'Elective';
                  };

                  // Render Year by Year
                  for (const [yearNum, sems] of Array.from(yearsMap.entries())) {
                    if (currentY > 230) {
                      doc.addPage();
                      currentY = 18;
                    }

                    // Year Text
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(0, 0, 0);
                    doc.text(`Year ${YEAR_WORDS[yearNum] ?? yearNum}`, 14, currentY);
                    currentY += 4;

                    // Build unified rows for the entire academic year (Sem 1, break milestone, Sem 2)
                    const yearRows: any[] = [];

                    for (const sem of sems) {
                      const slotKey = `${sem.year}-${sem.semester}`;
                      const isWilSlot = primaryMilestone && activeWilSlot === slotKey;
                      const calTerm = calendarTermFor(sem.semester, planIntakeSemester);
                      const semMonths = calTerm === 1 ? 'Feb/Mar' : 'Aug/Sept';

                      const colHeaderRow = [
                        { content: 'Unit Code', styles: { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontStyle: 'bold' as const, fontSize: 9 } },
                        { content: 'Unit Name', styles: { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontStyle: 'bold' as const, fontSize: 9 } },
                        { content: 'Category', styles: { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontStyle: 'bold' as const, fontSize: 9 } },
                      ];

                      // If an intensive break milestone (e.g. WIL placement) sits before this semester
                      if (isWilSlot) {
                        const currentBreakOption = primaryMilestone?.availableBreakSlots?.find((b: any) => b.slotKey === slotKey);
                        const breakTitle = currentBreakOption?.termType === 'winter'
                          ? 'Winter Term'
                          : 'Summer Term';
                        // Title Banner
                        yearRows.push([
                          {
                            content: breakTitle,
                            colSpan: 3,
                            styles: { fillColor: [64, 64, 64], textColor: [255, 255, 255], fontStyle: 'bold' as const, fontSize: 10 },
                          },
                        ]);

                        // Column Headers
                        yearRows.push(colHeaderRow);

                        // Unit Row
                        yearRows.push([
                          { content: primaryMilestone.unitCode, styles: { fontStyle: 'normal' as const, fillColor: getCategoryColor('wil') } },
                          { content: primaryMilestone.unitName, styles: { fillColor: getCategoryColor('wil') } },
                          { content: 'Work-Integrated Learning', styles: { fillColor: getCategoryColor('wil') } },
                        ]);
                      }

                      // Regular Semester: Title Banner
                      const semTitle = `Semester ${sem.semester} | ${semMonths}`;
                      yearRows.push([
                        {
                          content: semTitle,
                          colSpan: 3,
                          styles: { fillColor: [64, 64, 64], textColor: [255, 255, 255], fontStyle: 'bold' as const, fontSize: 10 },
                        },
                      ]);

                      // Column Headers
                      yearRows.push(colHeaderRow);

                      // Unit Rows
                      const semUnits = sem.units
                        .filter((u: any) => u.category !== 'mpu')
                        .map((u: any) => [
                          { content: u.code, styles: { fontStyle: 'normal' as const, fillColor: getCategoryColor(u.category) } },
                          { content: u.name, styles: { fillColor: getCategoryColor(u.category) } },
                          { content: getCategoryLabel(u.category, u.code), styles: { fillColor: getCategoryColor(u.category) } },
                        ]);

                      yearRows.push(...semUnits);
                    }

                    // Render one single continuous table for the year
                    autoTable(doc, {
                      startY: currentY,
                      margin: { left: 14, right: 14 },
                      body: yearRows,
                      bodyStyles: { textColor: [0, 0, 0], fontSize: 9 },
                      theme: 'plain',
                      columnStyles: {
                        0: { cellWidth: 35 },
                        1: { cellWidth: 105 },
                        2: { cellWidth: 42 },
                      },
                    });

                    // Space before the next Year header
                    currentY = (doc as any).lastAutoTable.finalY + 14;
                  }

                  // MPU Units Section
                  if (remainingMpus.length > 0) {
                    if (currentY > 220) {
                      doc.addPage();
                      currentY = 18;
                    }

                    if (currentY > 40) {
                      currentY += 6;
                    }

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(0, 0, 0);
                    doc.text('MPU Units', 14, currentY);
                    currentY += 4;

                    const getMpuOfferingText = (code: string) => {
                      const cleanCode = normaliseCode(code);
                      const meta = unitData.get(cleanCode);
                      const plannerUnit = (activePlanner?.units ?? []).find(
                        (tu: any) => normaliseCode(tu.unit?.unit_code ?? '') === cleanCode
                      );

                      // Collect all raw semester numbers from the database
                      const rawOfferings: any[] = plannerUnit?.unit?.unit_offerings ?? (meta as any)?.unit?.unit_offerings ?? [];
                      const termNumbers = new Set<number>([
                        ...(meta?.offeringSemesters ?? []),
                        ...rawOfferings.map((o) => Number(o.semester ?? o.term_id ?? o.semester_id)).filter((n) => !isNaN(n) && n > 0),
                      ]);

                      const hasSem1 = termNumbers.has(1);
                      const hasSem2 = termNumbers.has(2);
                      const hasSummer = termNumbers.has(3);
                      const hasWinter = termNumbers.has(4);

                      // If it only runs in short terms (3 = summer, 4 = winter)
                      if (!hasSem1 && !hasSem2) {
                        if (hasSummer && hasWinter) return 'Short Term Only (Winter / Summer)';
                        if (hasSummer) return 'Short Term Only (Summer)';
                        if (hasWinter) return 'Short Term Only (Winter)';
                        return 'Short Term Only (Winter / Summer)';
                      }

                      // Standard semester offerings
                      if (hasSem1 && hasSem2) return 'Semester 1 & 2';
                      if (hasSem1) return 'Semester 1 (Feb/Mar)';
                      if (hasSem2) return 'Semester 2 (Aug/Sept)';

                      return 'Semester 1 & 2';
                    };

                    const mpuBannerTitle = 'General Studies (MPU) | Flexible Schedule (Can be completed in any semester)';

                    const mpuRows = remainingMpus.map((mpu) => [
                      { content: mpu.code, styles: { fontStyle: 'normal' as const, fillColor: getCategoryColor('mpu') } },
                      { content: mpu.name, styles: { fillColor: getCategoryColor('mpu') } },
                      { content: 'MPU', styles: { fillColor: getCategoryColor('mpu') } },
                      { content: getMpuOfferingText(mpu.code), styles: { fillColor: getCategoryColor('mpu') } },
                    ]);

                    autoTable(doc, {
                      startY: currentY,
                      margin: { left: 14, right: 14 },
                      head: [
                        [
                          {
                            content: mpuBannerTitle,
                            colSpan: 4,
                            styles: { fillColor: [64, 64, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
                          },
                        ],
                        ['Unit Code', 'Unit Name', 'Category', 'Semester Offered'],
                      ],
                      body: mpuRows,
                      headStyles: { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontSize: 9 },
                      bodyStyles: { textColor: [0, 0, 0], fontSize: 9 },
                      theme: 'plain',
                      columnStyles: {
                        0: { cellWidth: 30 },
                        1: { cellWidth: 85 },
                        2: { cellWidth: 27 },
                        3: { cellWidth: 40 },
                      },
                    });
                  }

                  // Embeds the same restore payload the Excel export carries,
                  // in the one custom Info field jsPDF actually writes
                  // (setProperties silently drops any key besides title,
                  // subject, author, keywords and creator). The PDF is the
                  // main deliverable, so an oversized plan never blocks the
                  // export; it just exports without the payload, same as an
                  // export this feature predates.
                  const pdfPayloadInput = buildPlanPayloadInputForExport({
                    selectedPlanner, semesters, allTranscriptUnits, retakeUnitCodes, concededPassRetakeCodes,
                    planExtraUnits, availableMinors, injectedMinors, selectedDoubleMajorId, availableDoubleMajors,
                    customWilSlot, remainingMpus, customPlanStart, planIntakeSemester,
                  });
                  const pdfPayload = buildPlanPayload(pdfPayloadInput);
                  const encodedKeywords = encodePayloadForPdf(pdfPayload);
                  if (encodedKeywords.length - PDF_PAYLOAD_PREFIX.length <= PDF_PAYLOAD_LIMITS.maxEncodedLength) {
                    doc.setProperties({ keywords: encodedKeywords });
                  } else {
                    showToast('Restore data was omitted because this plan is too large to embed in the PDF.', 'info');
                  }

                  const fileName = `${(selectedPlanner?.course?.name ?? 'Course').replace(/[^a-zA-Z0-9]/g, '_')}_Study_Plan.pdf`;
                  doc.save(fileName);
                  showToast('Please choose your save location in the dialog to save your PDF.', 'info');
                } catch (err) {
                  console.error(err);
                  showToast('Failed to generate PDF.', 'error');
                } finally {
                  setIsExporting(false);
                }
              };

              const handleExcelDownload = async () => {
                // Same pre-flight check as the PDF export, same message pattern
                const unselectedElectiveCount = semesters
                  .flatMap((s) => s.units)
                  .filter((u) => u.code === 'ELECTIVE').length;

                if (unselectedElectiveCount > 0) {
                  showToast(
                    `Please select a unit for all elective slots (${unselectedElectiveCount} remaining) before downloading the Excel file.`,
                    'info'
                  );
                  return;
                }

                setIsExportingExcel(true);
                showToast('Generating Excel study plan...', 'info');

                try {
                  const XLSX = await import('xlsx-js-style');

                  const primaryMilestone = breakMilestones?.[0];
                  const activeWilSlot = customWilSlot ?? primaryMilestone?.insertBeforeSlotKey;
                  const allTranscriptUnits = [
                    ...(scrapedStudent?.student?.courseList ?? []),
                    ...(dashboardData?.mpuCourseList ?? []),
                  ];
                  const transcriptStates = resolveUnitStates(allTranscriptUnits);
                  const completeCodes = new Set(
                    [...transcriptStates].filter(([, state]) => state === 'passed').map(([code]) => code)
                  );
                  const currentCodes = new Set(
                    [...transcriptStates].filter(([, state]) => state === 'in_progress').map(([code]) => code)
                  );
                  const takenCodes = new Set([...completeCodes, ...currentCodes]);
                  const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
                  const defaultRemainingMpus = getRemainingMpuUnits(activePlanner, dashboardData, takenCodes);
                  const remainingMpus = customMpuList ?? defaultRemainingMpus;

                  const rows = buildExcelRows(semesters, planIntakeSemester, primaryMilestone, activeWilSlot, remainingMpus);

                  const headerInfo: ExcelPlanHeaderInfo = {
                    courseName: selectedPlanner?.course?.name ?? 'Course',
                    majorName: selectedPlanner?.major?.name ?? null,
                    intakeYear: selectedPlanner?.intake_year ?? null,
                    intakeMonth: selectedPlanner?.intake_month ?? null,
                  };
                  const payloadInput: BuildPlanPayloadInput = buildPlanPayloadInputForExport({
                    selectedPlanner, semesters, allTranscriptUnits, retakeUnitCodes, concededPassRetakeCodes,
                    planExtraUnits, availableMinors, injectedMinors, selectedDoubleMajorId, availableDoubleMajors,
                    customWilSlot, remainingMpus, customPlanStart, planIntakeSemester,
                  });
                  const payload = buildPlanPayload(payloadInput);

                  // Checked before any write, not after: a damaged or
                  // silently-truncated Plan Data cell would be worse than no
                  // export at all, since it would restore wrong or not at all.
                  const oversizedFields = findOversizedPlanDataCells(payload);
                  if (oversizedFields.length > 0) {
                    showToast(
                      'This plan is too large to save a restorable Excel file (one of its saved fields exceeds Excel\'s own cell size limit). The readable table itself is unaffected; only the "Plan Data" restore sheet is.',
                      'error'
                    );
                    return;
                  }

                  const wb = buildExcelWorkbook(XLSX, rows, headerInfo, payload);

                  const fileName = `${(selectedPlanner?.course?.name ?? 'Course').replace(/[^a-zA-Z0-9]/g, '_')}_Study_Plan.xlsx`;
                  XLSX.writeFile(wb, fileName);
                  showToast(
                    'Please choose your save location in the dialog to save your Excel file. This file includes hidden restore data (completed units and plan details).',
                    'info'
                  );
                } catch (err) {
                  console.error(err);
                  showToast('Failed to generate Excel file.', 'error');
                } finally {
                  setIsExportingExcel(false);
                }
              };

              const breakTermCodes = new Set(
                (customPlan.warnings ?? [])
                  .filter((w: any) => w.kind === 'short_term_only')
                  .map((w: any) => normaliseCode(w.unitCode))
              );
              const nonMpuUnschedulable = (customPlan.unschedulableUnits ?? []).filter(
                (u: any) =>
                  u.category !== 'mpu' &&
                  !u.code?.toUpperCase().startsWith('MPU') &&
                  !breakTermCodes.has(normaliseCode(u.code)) &&
                  !milestoneCodes.has(normaliseCode(u.code))
              );
              // Ready to graduate: nothing left to schedule in the required
              // categories, and no genuine failure reason either, just MPU
              // and/or short-term items, tracked separately below.
              const readyToGraduate = semesters.length === 0 && totalUnplanned === 0 && nonMpuUnschedulable.length === 0;
              const remainingMpus = customMpuList ?? getRemainingMpuUnits(activePlanner, dashboardData, takenCodes);

              return (
              <div>
                {readyToGraduate ? (
                  <div className={styles.mpuEmptyAlert}>
                    {remainingMpus.length > 0
                      ? '✓ No further core units required. Complete the remaining MPU units below to finish this degree.'
                      : '✓ This student has completed all requirements for this planner.'}
                  </div>
                ) : semesters.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
                    No semesters could be generated. The reasons are listed below.
                  </div>
                ) : (
                  semesters
                  .filter((sem) => sem.units.some((u) => u.category !== 'mpu') || isPlanEdited)
                  .map((sem) => {
                    const slotKey = `${sem.year}-${sem.semester}`;
                    const capacity = overCapacity.get(slotKey);
                    const calendarTerm = calendarTermFor(sem.semester, planIntakeSemester);
                    const primaryMilestone = breakMilestones[0];
                    const activeWilSlot = customWilSlot ?? primaryMilestone?.insertBeforeSlotKey;
                    const isWilSlot = primaryMilestone && activeWilSlot === slotKey;

                    // Derive dynamic title based on the active position
                    const currentBreakOption = primaryMilestone?.availableBreakSlots?.find((b: any) => b.slotKey === slotKey);
                    const dynamicBreakTitle = currentBreakOption
                      ? currentBreakOption.termType === 'summer'
                        ? `YEAR ${currentBreakOption.year} · SUMMER BREAK (Dec – Feb)`
                        : `YEAR ${currentBreakOption.year} · WINTER BREAK (June – July)`
                      : primaryMilestone?.breakTermName;

                    return (
                    <div key={`sem-wrap-${slotKey}`}>
                      {/* Chronological Break Milestone Strip for WIL with Move Dropdown */}
                      {isWilSlot && (
                        <div className={styles.breakMilestoneStrip}>
                          <div className={styles.breakMilestoneHeader}>
                            <span className={styles.breakMilestoneTitle}>
                              {currentBreakOption?.termType === 'winter'} {dynamicBreakTitle} · Intensive Break Period
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Advisor dropdown to switch break term location */}
                              {primaryMilestone.availableBreakSlots?.length > 1 && (
                                <select
                                  className={styles.breakMoveSelect}
                                  value={activeWilSlot}
                                  onChange={(e) => setCustomWilSlot(e.target.value)}
                                  title="Change which break period to take this placement"
                                >
                                  {primaryMilestone.availableBreakSlots.map((opt: any) => (
                                    <option key={opt.slotKey} value={opt.slotKey}>
                                      Move to: {opt.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <Badge label="Summer / Winter" cls="badgePurple" />
                            </div>
                          </div>
                          <div className={styles.breakMilestoneBody}>
                            <InlineCode>{primaryMilestone.unitCode}</InlineCode>
                            <span className={styles.breakMilestoneName}>{primaryMilestone.unitName}</span>
                            <span className={styles.breakMilestoneTag}>
                              {primaryMilestone.unitCode?.toUpperCase().includes('OPTIONAL') ? (
                                `${primaryMilestone.creditPoints ?? 25} CP · REPLACES 2 ELECTIVES`
                              ) : primaryMilestone.creditPoints === 0 ? (
                                '0 CP · COMPULSORY ACCREDITATION HURDLE'
                              ) : (
                                `${primaryMilestone.creditPoints ?? 25} CP · COMPULSORY WIL`
                              )}
                            </span>

                          </div>
                        </div>
                      )}

                    <div
                      key={`cp-${sem.year}-${sem.semester}`}
                      style={{ marginBottom: 8, border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4, overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(244,135,113,0.06)' }}>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>
                          YEAR {sem.year} · SEM {sem.semester} · {monthsOf(calendarTerm)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                          {sem.units.filter((u) => u.category !== 'mpu').length} units · Custom
                        </span>
                        {capacity && (
                          <span
                            className={styles.capacityTag}
                            title={`${capacity.count} standard units, above the normal load of ${capacity.limit}`}
                          >
                            ⚠ {capacity.count} units, over the normal load of {capacity.limit}
                          </span>
                        )}
                        <select
                          className={styles.addUnitSelect}
                          style={capacity ? undefined : { marginLeft: 'auto' }}
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            e.target.value = ''; // Reset immediately
                            if (val === '__EXTRA_UNIT__') {
                              setExtraUnitTargetSemester({ year: sem.year, semester: sem.semester });
                            } else if (val) {
                              addUnitToSemester(val, sem);
                            }
                          }}
                          title="Add a unit to this semester"
                        >
                          <option value="" disabled hidden>
                            + Add unit
                          </option>
                          {unplacedUnits.map((u) => {
                            if (u.code === 'ELECTIVE') {
                              return (
                                <option key="ELECTIVE" value="ELECTIVE">
                                  + Elective Slot (To be selected)
                                </option>
                              );
                            }
                            const hint = offeringHint(u, calendarTerm);
                            return (
                              <option key={u.code} value={u.code}>
                                {u.code} · {u.name}{hint ? ` · ${hint}` : ''}
                              </option>
                            );
                          })}
                          <option value="__EXTRA_UNIT__">
                            + Add Extra Unit (From Catalogue)
                          </option>
                        </select>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => {
                            if (sem.units.length === 0) {
                              applyEdit(removeSemester(semesters, sem.year, sem.semester));
                              showToast(`Removed Year ${sem.year} Semester ${sem.semester}.`, 'success');
                              return;
                            }
                            setSemesterToDelete({ year: sem.year, semester: sem.semester });
                          }}
                          title="Delete this semester and return its units to the pool"
                          aria-label={`Delete Year ${sem.year} Semester ${sem.semester}`}
                        >
                          ✕
                        </button>
                      </div>
                      {picker && picker.mode !== 'add' && picker.year === sem.year && picker.semester === sem.semester && (
                        <ElectivePicker
                          title={
                            picker.mode === 'add_extra'
                              ? `Add Extra Unit · Y${sem.year} S${sem.semester}`
                              : picker.oldCode === 'ELECTIVE'
                              ? 'Choose an elective'
                              : `Swap ${picker.oldCode}`
                          }
                          plannerUnits={pickerPlannerUnits}
                          catalogueUnits={pickerCatalogueUnits}
                          prefixes={cataloguePrefixes}
                          loading={catalogueLoading}
                          term={calendarTerm}
                          getUnmetPrereqReason={getUnmetPrereqReasonForSlot(sem.year, sem.semester)}
                          onChoose={(unit, source) =>
                            chooseElective(
                              unit,
                              source,
                              sem.year,
                              sem.semester,
                              picker.mode === 'add_extra'
                            )
                          }
                          onClose={() => setPicker(null)}
                        />
                      )}
                      <div style={{ overflowX: 'auto' }}>
                        <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                          <colgroup>
                            <col style={{ width: 110 }} />
                            <col style={{ width: 'auto' }} />
                            <col style={{ width: 185 }} />
                            <col style={{ width: 150 }} />
                          </colgroup>
                          <thead>
                            <tr><th>Unit Code</th><th>Unit Name</th><th>Type</th><th>Edit</th></tr>
                          </thead>
                          <tbody>
                            {sem.units
                            .filter((u) => u.category !== 'mpu')
                            .map((u, uIdx) => {
                              const unitMessages = byUnit.get(normaliseCode(u.code)) ?? [];
                              return (
                              <tr key={`${u.code}-${uIdx}`} className={unitMessages.length > 0 ? styles.rowFlagged : undefined}>
                                <td>
                                  <InlineCode red={u.category === 'core' || u.category === 'major_core'}>
                                    {u.code}
                                  </InlineCode>
                                </td>
                                <td style={{ whiteSpace: 'normal' }}>
                                  {u.name}
                                  {retakeUnitCodes.has(normaliseUnitCode(u.code)) && (
                                    <span
                                      title={
                                        concededPassRetakeCodes.has(normaliseCode(u.code))
                                          ? 'Retaken: was a Conceded Pass'
                                          : 'Previously attempted and failed — this is a repeat attempt.'
                                      }
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--accent-orange)',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      {concededPassRetakeCodes.has(normaliseCode(u.code)) ? 'RETAKE (CP)' : 'RETAKE'}
                                    </span>
                                  )}
                                  {u.recommended && u.code !== 'ELECTIVE' && (
                                    <span
                                      title="Not named by the planner — chosen from its elective groups to fill an empty elective slot."
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--accent-purple)',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      RECOMMENDED
                                    </span>
                                  )}
                                  {u.outsidePlanner && (
                                    <span
                                      title="Added from the catalogue, not on this planner. Counted as an elective."
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--accent-blue)',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      OUTSIDE PLANNER
                                    </span>
                                  )}
                                  {unitMessages.map((message, mIdx) => (
                                    <div key={`msg-${message}-${mIdx}`} className={styles.rowWarning} title={message}>
                                      <span aria-hidden="true">⚠</span> {message}.
                                    </div>
                                  ))}
                                </td>
                                <td>
                                  <Badge
                                    label={
                                      (u as any).isExtraUnit ? 'Extra Unit' :
                                      u.code === 'ELECTIVE' ? 'Elective Slot' :
                                      u.category === 'double_major' ? 'Double Major' :
                                      u.category === 'prescribed_elective' ? 'Prescribed Elec' :
                                      u.category === 'minor' ? 'minor elective' :
                                      u.category.replace(/_/g, ' ')
                                    }
                                    cls={
                                      (u as any).isExtraUnit ? 'badgeBlue' :
                                      u.code === 'ELECTIVE' ? 'badgePurple' :
                                      // Matches the canonical mapping in CourseListTable.tsx,
                                      // the Study Planners page's reference: major_core is
                                      // badgeYellow there, and double_major/minor fall to its
                                      // default badgeGreen (neither has its own explicit case).
                                      u.category === 'core' ? 'badgeBlue' :
                                      u.category === 'major_core' ? 'badgeYellow' :
                                      u.category === 'double_major' ? 'badgeGreen' :
                                      u.category === 'mpu' ? 'badgeRed' :
                                      u.category === 'minor' ? 'badgeGreen' :
                                      u.category === 'prescribed_elective' ? 'badgeGreen' :
                                      u.category === 'elective' ? 'badgeGreen' :
                                      'badgePurple'
                                    }
                                  />
                                </td>
                                <td>
                                  <div className={styles.rowActions}>
                                    {u.code === 'ELECTIVE' ? (
                                          <button
                                            type="button"
                                            className={styles.btnSecondary}
                                            style={{ fontSize: 11, padding: '3px 8px', borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}
                                            onClick={() => {
                                              openPicker({ mode: 'replace', oldCode: u.code, year: sem.year, semester: sem.semester });
                                            }}
                                            title="Click to select an elective from the catalogue"
                                          >
                                            + Select Unit
                                          </button>
                                    ) : (
                                    <select
                                      className={styles.moveSelect}
                                      value={`${sem.year}-${sem.semester}`}
                                      onChange={(e) => moveUnitToSlot(u.code, e.target.value)}
                                      title="Move to another semester"
                                    >
                                      {semesters.map((target) => {
                                        const targetCalTerm = calendarTermFor(target.semester, planIntakeSemester);
                                        const targetUnitMeta = unitData.get(normaliseCode(u.code));
                                        const offeringTerms = targetUnitMeta?.offeringSemesters ?? (u as any).offeringSemesters ?? [];
                                        
                                        // Empty means unrestricted (available in both semesters)
                                        const isOffered = offeringTerms.length === 0 || offeringTerms.includes(targetCalTerm);
                                        const isCurrent = target.year === sem.year && target.semester === sem.semester;

                                        return (
                                          <option
                                            key={`${target.year}-${target.semester}`}
                                            value={`${target.year}-${target.semester}`}
                                            disabled={!isOffered && !isCurrent}
                                            title={!isOffered ? `Not offered in ${monthsOf(targetCalTerm)}` : `Move to Y${target.year} S${target.semester}`}
                                          >
                                            {isOffered || isCurrent
                                              ? `Y${target.year} S${target.semester}`
                                              : `⚠ Y${target.year} S${target.semester}`}
                                          </option>
                                        );
                                      })}
                                    </select>

                                    )}
                                    {u.category === 'elective' && u.code !== 'ELECTIVE' && (
                                      <button
                                        type="button"
                                        className={styles.swapBtn}
                                        onClick={() => openPicker({ mode: 'replace', oldCode: u.code, year: sem.year, semester: sem.semester })}
                                        title={`Swap ${u.code} for another elective`}
                                        aria-label={`Swap ${u.code}`}
                                      >
                                        Swap
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className={styles.removeBtn}
                                      onClick={() => setUnitToRemove({ code: u.code, name: u.name, category: u.category })}
                                      title={`Remove ${u.code} from this plan`}
                                      aria-label={`Remove ${u.code}`}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                            {sem.units.filter((u) => u.category !== 'mpu').length === 0 && (
                              <tr>
                                <td colSpan={4} style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                  No units in this semester yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      </div>
                    </div>
                    );
                  })
                )}

                <div className={styles.planActions}>
                  <button
                    className={styles.btnSecondary}
                    style={{ fontSize: 11 }}
                    onClick={() => applyEdit(addSemester(semesters))}
                  >
                    + Add semester
                  </button>
                  {isPlanEdited && (
                    <button
                      className={styles.btnSecondary}
                      style={{ fontSize: 11 }}
                      onClick={resetToGenerated}
                      title="Discard edits and show the scheduler's plan again"
                    >
                      ↺ Reset to generated plan
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={handleDirectPdfDownload}
                    disabled={isExporting || isExportingExcel}
                    title="Directly download official custom study planner as PDF"
                  >
                    {isExporting ? '⏳ Generating PDF...' : '💾 Download PDF'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={handleExcelDownload}
                    disabled={isExporting || isExportingExcel}
                    title="Download the study plan as a flat, sortable Excel sheet"
                  >
                    {isExportingExcel ? '⏳ Generating Excel...' : '📊 Download Excel'}
                  </button>
                </div>

                {warnings.length > 0 && (
                  <ul className={styles.warningList}>
                    {warnings.map((w, wIdx) => {
                      // Suppress warnings for units already scheduled in break milestones
                      const milestoneCodes = new Set(breakMilestones.map((bm: any) => normaliseCode(bm.unitCode)));
                      if ('unitCode' in w && milestoneCodes.has(normaliseCode(w.unitCode))) return null;
                      if ('unitCodes' in w && (w.unitCodes as string[]).some((c) => milestoneCodes.has(normaliseCode(c)))) return null;

                      // Suppress no_offering_data or requisite warnings for unselected 'ELECTIVE' placeholder slots
                      if ('unitCode' in w && normaliseCode(w.unitCode) === 'ELECTIVE') return null;

                      // Suppress short_term_only warnings since break milestones handle them
                      if (w.kind === 'short_term_only') return null;

                      // Suppress WIL shortfall if break milestones provide the required credit points
                      const totalWilMilestoneCp = breakMilestones.reduce((sum: number, bm: any) => sum + (bm.creditPoints ?? 0), 0);
                      if (w.kind === 'requirement_shortfall' && w.category === 'wil' && totalWilMilestoneCp >= w.need) {
                        return null;
                      }

                      const message = describeWarning(w, DEFAULT_SCHEDULER_CONFIG.maxSemesters, planIntakeSemester);
                      if (!message || w.kind === 'over_capacity') return null;

                      const isCompulsoryMissing = w.kind === 'compulsory_missing';
                      const missingCodes = isCompulsoryMissing ? w.unitCodes : [];

                      return (
                        <li
                          key={`warn-${wIdx}`}
                          className={styles.warningItem}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span aria-hidden="true">⚠</span>
                            <span>{message}.</span>
                            {chooseElectiveMessages.has(message) && (
                              <button
                                type="button"
                                className={styles.swapBtn}
                                onClick={() => {
                                  setPickerSlotKey('');
                                  if (picker?.mode === 'add') setPicker(null);
                                  else openPicker({ mode: 'add' });
                                }}
                              >
                                Choose elective
                              </button>
                            )}
                          </div>

                          {/* Restore Button(s) on the right */}
                          {isCompulsoryMissing && (
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              {missingCodes.map((code) => {
                                const savedSlot = removedUnitSlots?.[normaliseCode(code)];
                                const slotLabel = savedSlot ? `Y${savedSlot.year} S${savedSlot.semester}` : 'Plan';

                                return (
                                  <button
                                    key={code}
                                    type="button"
                                    className={styles.btnSecondary}
                                    style={{
                                      fontSize: 10,
                                      padding: '3px 8px',
                                      borderColor: 'var(--accent-orange)',
                                      color: 'var(--accent-orange)',
                                    }}
                                    onClick={() => restoreUnitToOriginalSlot(code)}
                                    title={`Restore ${code} directly back into ${slotLabel}`}
                                  >
                                    + Restore to {slotLabel}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {picker?.mode === 'add' && activeSlot && (() => {
                  const [activeY, activeS] = activeSlotKey.split('-').map(Number);
                  return (
                    <ElectivePicker
                      title="Choose an elective"
                      plannerUnits={pickerPlannerUnits}
                      catalogueUnits={pickerCatalogueUnits}
                      prefixes={cataloguePrefixes}
                      loading={catalogueLoading}
                      term={activeSlot.term}
                      slots={pickerSlots}
                      slotKey={activeSlotKey}
                      onSlotChange={setPickerSlotKey}
                      getUnmetPrereqReason={getUnmetPrereqReasonForSlot(activeY, activeS as 1 | 2)}
                      onChoose={(unit, source) => {
                        chooseElective(unit, source, activeY, activeS as 1 | 2);
                      }}
                      onClose={() => setPicker(null)}
                    />
                  );
                })()}

                {(() => {
                  // Collect codes for optional break units (summer/winter only)
                  const breakTermCodes = new Set(
                    (customPlan.warnings ?? [])
                      .filter((w: any) => w.kind === 'short_term_only')
                      .map((w: any) => normaliseCode(w.unitCode))
                  );

                  // Filter out MPU units and optional break units (which are displayed in their own table below)
                  const milestoneCodes = new Set(breakMilestones.map((bm: any) => normaliseCode(bm.unitCode)));
                  const nonMpuUnschedulable = (customPlan.unschedulableUnits ?? []).filter(
                    (u: any) =>
                      u.category !== 'mpu' &&
                      !u.code?.toUpperCase().startsWith('MPU') &&
                      !breakTermCodes.has(normaliseCode(u.code)) &&
                      !milestoneCodes.has(normaliseCode(u.code))
                  );


                  if (!isPlanEdited && messages.length === 0 && nonMpuUnschedulable.length > 0) {
                    return (
                      <div className={styles.warningItem}>
                        <span aria-hidden="true">⚠</span>
                        <span>
                          {nonMpuUnschedulable.length} unit{nonMpuUnschedulable.length !== 1 ? 's' : ''} could
                          not be scheduled: {nonMpuUnschedulable.map((u: any) => u.code).join(', ')}.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Remaining MPU units */}
                {(() => {
                  const defaultRemainingMpus = getRemainingMpuUnits(activePlanner, dashboardData, takenCodes);
                  const activeMpus = customMpuList ?? defaultRemainingMpus;
                  const currentMpuCodes = new Set(activeMpus.map((m) => m.code));

                  // All MPU units defined on the degree planner
                  const plannerMpuCodes = new Set(
                    (activePlanner?.units ?? [])
                      .filter((tu: any) => tu.category === 'mpu' && tu.unit)
                      .map((tu: any) => tu.unit.unit_code?.trim().toUpperCase())
                  );

                  // Planner MPU units currently not in the table
                  const unplacedPlannerMpus = (activePlanner?.units ?? [])
                    .filter((tu: any) => tu.category === 'mpu' && tu.unit)
                    .map((tu: any) => ({
                      code: tu.unit.unit_code?.trim().toUpperCase(),
                      name: tu.unit.unit_name,
                    }))
                    .filter((u: any) => u.code && !currentMpuCodes.has(u.code) && !takenCodes.has(u.code));

                  // All other MPU units in the entire database not on this planner and not in the table
                  const otherAvailableMpus = allDatabaseMpus
                    .filter(
                      (u) =>
                        u.code &&
                        !plannerMpuCodes.has(u.code) &&
                        !currentMpuCodes.has(u.code) &&
                        !takenCodes.has(u.code)
                    );

                  const removeMpuUnit = (code: string) => {
                    const next = activeMpus.filter((m) => m.code !== code);
                    setCustomMpuList(next);
                    setIsPlanEdited(true);
                    showToast(`Removed ${code} from MPU requirements.`, 'info');
                  };

                  const addMpuUnit = (code: string) => {
                    const found =
                      unplacedPlannerMpus.find((m: any) => m.code === code) ||
                      otherAvailableMpus.find((m: any) => m.code === code);
                    if (!found) return;

                    const next = [...activeMpus, found];
                    setCustomMpuList(next);
                    setIsPlanEdited(true);
                    showToast(`Added ${found.code} to MPU requirements.`, 'info');
                  };

                  const totalAvailableToAdd = unplacedPlannerMpus.length + otherAvailableMpus.length;

                  return (
                    <div className={styles.mpuSection}>
                      <div className={styles.mpuHeader}>
                        <div className={styles.sectionTitle} style={{ margin: 0, fontSize: 13 }}>
                          Remaining MPU Units ({activeMpus.length})
                        </div>
                        <select
                          className={styles.addUnitSelect}
                          style={{ marginLeft: 'auto' }}
                          value=""
                          disabled={totalAvailableToAdd === 0}
                          onChange={(e) => {
                            const val = e.target.value;
                            e.target.value = ''; // Reset immediately
                            if (val) {
                              addMpuUnit(val);
                            }
                          }}
                          title={totalAvailableToAdd === 0 ? 'All eligible MPU units are already included' : 'Add an MPU unit'}
                        >
                          <option value="" disabled hidden>
                            + Add MPU unit
                          </option>
                          {unplacedPlannerMpus.length > 0 && (
                            <optgroup label="From this planner">
                              {unplacedPlannerMpus.map((u: any) => (
                                <option key={u.code} value={u.code}>
                                  {u.code} · {u.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherAvailableMpus.length > 0 && (
                            <optgroup label="Other MPU units">
                              {otherAvailableMpus.map((u: any) => (
                                <option key={u.code} value={u.code}>
                                  {u.code} · {u.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      {activeMpus.length === 0 ? (
                        <div className={styles.mpuEmptyAlert}>
                          ✓ All required MPU units have been completed, exempted, or satisfied
                        </div>
                      ) : (
                        <div className={styles.mpuTableWrap}>
                          <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                            <colgroup>
                              <col style={{ width: 120 }} />
                              <col style={{ width: 'auto' }} />
                              <col style={{ width: 140 }} />
                              <col style={{ width: 80 }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>Unit Code</th>
                                <th>Unit Title</th>
                                <th>Type</th>
                                <th style={{ textAlign: 'center' }}>Edit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeMpus.map((mpu) => (
                                <tr key={mpu.code}>
                                  <td>
                                    <InlineCode>{mpu.code}</InlineCode>
                                  </td>
                                  <td style={{ whiteSpace: 'normal' }}>{mpu.name}</td>
                                  <td>
                                    <Badge label="MPU" cls="badgeRed" />
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className={styles.removeBtn}
                                      onClick={() => removeMpuUnit(mpu.code)}
                                      title={`Remove ${mpu.code} from MPU requirements`}
                                      aria-label={`Remove ${mpu.code}`}
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              );
            })()}
          </div>
        );
      })()}
      {/* Unit Removal Confirmation Modal */}
      {unitToRemove && (() => {
        const isCore = unitToRemove.category === 'core' || unitToRemove.category === 'major_core';
        const isElective = unitToRemove.category === 'elective' || unitToRemove.category === 'prescribed_elective';
        const dependentUnits = findDependentUnits(unitToRemove.code);

        return (
          <div className={styles.modalOverlay} onClick={() => setUnitToRemove(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span className={styles.modalTitle}>
                  <span aria-hidden="true">⚠</span> Remove Unit from Pathway?
                </span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => setUnitToRemove(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: 13 }}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div>
                  Are you sure you want to remove <InlineCode>{unitToRemove.code}</InlineCode> (<strong>{unitToRemove.name}</strong>) from this study plan?
                </div>

                <div className={styles.modalWarningBox}>
                  <strong>Consequences of Removal:</strong>
                  <ul>
                    {isCore && (
                      <li>
                        <strong>Compulsory Core Unit:</strong> Required to satisfy degree requirements. Removing it will block graduation until completed.
                      </li>
                    )}
                    {isElective && (
                      <li>
                        <strong>Credit Shortfall:</strong> Removing this elective reduces total earned credits and may leave the plan short of the graduation requirement.
                      </li>
                    )}
                    {dependentUnits.length > 0 && (
                      <li>
                        <strong>Broken Prerequisite Chain:</strong> {dependentUnits.length} other planned unit{dependentUnits.length !== 1 ? 's' : ''} ({dependentUnits.map((d: any) => d.code).join(', ')}) depend on this unit!
                      </li>
                    )}
                    <li>
                      The unit will be returned to the unplaced pool and can be re-added later.
                    </li>
                  </ul>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setUnitToRemove(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => {
                    const code = unitToRemove.code;
                    // Find which semester this unit is currently sitting in before removing
                    const currentBucket = customPlan.semesters.find((s: any) =>
                      s.units.some((u: any) => normaliseCode(u.code) === normaliseCode(code))
                    );
                    if (currentBucket) {
                      setRemovedUnitSlots((prev) => ({
                        ...prev,
                        [normaliseCode(code)]: { year: currentBucket.year, semester: currentBucket.semester },
                      }));
                    }

                    applyEdit(
                      removeUnit(
                        customPlan.semesters,
                        code,
                        currentBucket ? { year: currentBucket.year, semester: currentBucket.semester } : undefined
                      )
                    );

                    setUnitToRemove(null);
                    showToast(`Removed ${code} from study pathway.`, 'info');
                  }}
                >
                  Remove Unit
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Semester Deletion Confirmation Modal: same shell as the unit-removal
          modal above, reused rather than a second differently-styled dialog. */}
      {semesterToDelete && (() => {
        const targetBucket = (customPlan?.semesters ?? []).find(
          (s: any) => s.year === semesterToDelete.year && s.semester === semesterToDelete.semester
        );
        const semesterUnits = targetBucket?.units ?? [];
        const unitCount = semesterUnits.length;
        const coreUnits = semesterUnits.filter((u: any) => u.category === 'core' || u.category === 'major_core');
        const electiveUnits = semesterUnits.filter((u: any) => u.category === 'elective' || u.category === 'prescribed_elective');

        // Same check as the unit-removal modal, once per unit in this semester,
        // excluding dependents that are themselves being deleted along with it
        const semesterCodes = new Set(semesterUnits.map((u: any) => normaliseCode(u.code)));
        const dependentsByUnit = semesterUnits
          .map((u: any) => ({
            unit: u,
            dependents: findDependentUnits(u.code).filter((d: any) => !semesterCodes.has(normaliseCode(d.code))),
          }))
          .filter((entry: any) => entry.dependents.length > 0);

        return (
          <div className={styles.modalOverlay} onClick={() => setSemesterToDelete(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span className={styles.modalTitle}>
                  <span aria-hidden="true">⚠</span> Delete this semester?
                </span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => setSemesterToDelete(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: 13 }}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div>
                  Are you sure you want to delete Year {semesterToDelete.year} Semester {semesterToDelete.semester}?
                </div>

                {unitCount > 0 && (
                  <div className={styles.modalWarningBox}>
                    <strong>Consequences of Deletion:</strong>
                    <ul>
                      {coreUnits.length > 0 && (
                        <li>
                          <strong>Compulsory Core Unit{coreUnits.length !== 1 ? 's' : ''}:</strong> {coreUnits.map((u: any) => u.code).join(', ')} required to satisfy degree requirements. Deleting this semester will block graduation until completed.
                        </li>
                      )}
                      {electiveUnits.length > 0 && (
                        <li>
                          <strong>Credit Shortfall:</strong> Removing {electiveUnits.length} elective{electiveUnits.length !== 1 ? 's' : ''} reduces total earned credits and may leave the plan short of the graduation requirement.
                        </li>
                      )}
                      {dependentsByUnit.map((entry: any) => (
                        <li key={entry.unit.code}>
                          <strong>Broken Prerequisite Chain:</strong> {entry.dependents.length} other planned unit{entry.dependents.length !== 1 ? 's' : ''} ({entry.dependents.map((d: any) => d.code).join(', ')}) depend on {entry.unit.code}!
                        </li>
                      ))}
                      <li>
                        {unitCount} unit{unitCount !== 1 ? 's' : ''} will be returned to the unplaced pool and can be re-added later.
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setSemesterToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => {
                    applyEdit(removeSemester(customPlan.semesters, semesterToDelete.year, semesterToDelete.semester));
                    showToast(
                      `Removed Year ${semesterToDelete.year} Semester ${semesterToDelete.semester}. ${unitCount} unit${unitCount !== 1 ? 's' : ''} returned to the unplaced pool.`,
                      'success'
                    );
                    setSemesterToDelete(null);
                  }}
                >
                  Delete Semester
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Extra Unit Confirmation Modal */}
      {extraUnitTargetSemester && (
        <div className={styles.modalOverlay} onClick={() => setExtraUnitTargetSemester(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                <span aria-hidden="true">⚠</span> Add Extra Unit (Beyond Degree Requirements)
              </span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setExtraUnitTargetSemester(null)}
                style={{ background: 'transparent', border: 'none', fontSize: 13 }}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                You are adding an extra unit into <strong>Year {extraUnitTargetSemester.year} Semester {extraUnitTargetSemester.semester}</strong>.
              </div>
              <div className={styles.modalWarningBox}>
                <strong>Important Advising Notice:</strong>
                <ul>
                  <li>
                    <strong>Degree Cap Exceeded:</strong> This student is already on track to satisfy standard graduation credit point requirements.
                  </li>
                </ul>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setExtraUnitTargetSemester(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  const target = extraUnitTargetSemester;
                  setExtraUnitTargetSemester(null);
                  openPicker({
                    mode: 'add_extra',
                    year: target.year,
                    semester: target.semester,
                    isExtraUnit: true,
                  });
                }}
              >
                Confirm & Choose Unit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
