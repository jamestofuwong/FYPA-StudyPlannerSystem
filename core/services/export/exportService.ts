import * as XLSX from 'xlsx-js-style';
import type { ExportInput, ExportSection } from '../../shared/types/export';

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const hex = (h: string) => ({ rgb: h });
const thin = () => ({ style: 'thin' as const, color: hex('CCCCCC') });
const bdr  = () => ({ top: thin(), bottom: thin(), left: thin(), right: thin() });

function mkStyle(bg: string, fontOpts: Record<string, any> = {}): any {
  return {
    fill: { patternType: 'solid', fgColor: hex(bg) },
    font: { name: 'Calibri', sz: 11, color: hex('1F1F1F'), ...fontOpts },
    border: bdr(),
    alignment: { vertical: 'center', wrapText: false },
  };
}

const S = {
  hdrDark:   mkStyle('1F3864', { bold: true, color: hex('FFFFFF') }),
  hdrMed:    mkStyle('2E5FAC', { bold: true, color: hex('FFFFFF') }),
  hdrLight:  mkStyle('D6E4F0', { bold: true }),
  row:       mkStyle('FFFFFF'),
  rowAlt:    mkStyle('F5F5F5'),
  rowGreen:  mkStyle('E2EFDA'),  // Current — matches dashboard green
  rowSalmon: mkStyle('FCE4D6'),  // Not taken / Pending — matches dashboard red tint
};

/** Apply a style to every existing cell in the given row. */
function applyRow(ws: any, r: number, numCols: number, style: any) {
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr]) ws[addr].s = style;
  }
}

/** Make col-0 cells bold (label column) for the given row indices. */
function boldCol0(ws: any, rowIndices: number[]) {
  for (const r of rowIndices) {
    const addr = XLSX.utils.encode_cell({ r, c: 0 });
    if (ws[addr]) {
      ws[addr].s = { ...ws[addr].s, font: { ...ws[addr].s?.font, bold: true } };
    }
  }
}

// ---------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------

const DATA_SOURCE_LABELS: Record<string, string> = {
  scrape:        'Web Scrape (Anthology Portal)',
  import_xlsx:   'Manual Import — Excel File',
  import_manual: 'Manual Import — Unit-by-Unit Entry',
  import_paste:  'Manual Import — Paste from Table',
};

// Forward-declared so buildReportInfoSheet can reference SHEET_NAMES before it's defined.
const SHEET_NAMES: Record<ExportSection, string> = {
  student_profile: 'Student Profile',
  major_match:     'Major & Course Match',
  unit_plan:       'Completed Units',
  study_planner:   'Study Planner',
};

function buildReportInfoSheet(input: ExportInput): any {
  const NUM_COLS = 2;

  const now = new Date();
  const exportDate =
    now.toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' }) +
    ', ' +
    now.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });

  const p = input.planner;
  const intakeMonthStr = p.intakeMonth != null
    ? new Date(2000, p.intakeMonth - 1).toLocaleString('en-MY', { month: 'long' })
    : null;
  const plannerLabel = [
    p.course?.name,
    p.major?.name,
    [input.intakeYear, intakeMonthStr].filter(Boolean).join(' '),
  ].filter(Boolean).join(' · ') || '—';

  const sectionsIncluded = input.options.sections.map((s) => SHEET_NAMES[s]).join(', ');

  const dataRows: [string, string][] = [
    ['Export Date',       exportDate],
    ['Student ID',        input.studentId === 'imported' ? '— (manual import)' : input.studentId],
    ['Student Name',      input.student.studentName ?? '—'],
    ['Data Source',       DATA_SOURCE_LABELS[input.enrollmentMode ?? 'scrape'] ?? '—'],
    ['Sections Included', sectionsIncluded],
    ['Planner',           plannerLabel],
    ['System Version',    input.appVersion ?? '—'],
  ];

  const rows = [['Field', 'Value'], ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 46 }];

  applyRow(ws, 0, NUM_COLS, S.hdrDark);
  dataRows.forEach((_, i) => applyRow(ws, i + 1, NUM_COLS, i % 2 === 0 ? S.row : S.rowAlt));
  boldCol0(ws, dataRows.map((_, i) => i + 1));

  return ws;
}

function buildStudentProfileSheet(input: ExportInput): any {
  const { student, studentId } = input;
  const NUM_COLS = 2;

  const dataRows: [string, string | number][] = [
    ['Student Name',        student.studentName ?? '—'],
    ['Student ID',          studentId],
    ['GPA',                 student.cgpa ?? '—'],
    ['Grade Level',         student.gradeLevel ?? '—'],
    ['Enrollment Date',     student.enrollmentDate ?? '—'],
    ['Expected Graduation', student.graduationDate ?? '—'],
    ['Credits Required',    student.creditsRequired ?? '—'],
    ['Credits Completed',   student.creditsCompleted ?? '—'],
  ];

  const rows = [['Field', 'Value'], ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 30 }];

  applyRow(ws, 0, NUM_COLS, S.hdrDark);
  dataRows.forEach((_, i) => applyRow(ws, i + 1, NUM_COLS, i % 2 === 0 ? S.row : S.rowAlt));
  boldCol0(ws, dataRows.map((_, i) => i + 1));

  return ws;
}

function buildMajorMatchSheet(input: ExportInput): any {
  const { match, planner } = input;
  const primary = match.primaryMajor;
  const NUM_COLS = 5;

  const rows: (string | number)[][] = [];
  type RowStyle = 'hdrDark' | 'hdrMed' | 'hdrLight' | 'row' | 'rowAlt' | 'blank';
  const styles: RowStyle[] = [];
  const boldRows: number[] = [];

  function add(row: (string | number)[], style: RowStyle, boldLabel = false) {
    const padded = [...row];
    while (padded.length < NUM_COLS) padded.push('');
    rows.push(padded);
    styles.push(style);
    if (boldLabel) boldRows.push(rows.length - 1);
  }

  add(['Field', 'Value'],                                                                                                                      'hdrDark');
  add(['Course',                       planner.course.name],                                                                                  'row',    true);
  add(['Major',                        primary?.majorName ?? '—'],                                                                            'rowAlt', true);
  add(['Match Percentage',             primary ? `${primary.matchPct}%` : '—'],                                                              'row',    true);
  add(['Detection Status',             match.status],                                                                                         'rowAlt', true);
  add([''],                                                                                                                                    'blank');
  add(['Category Breakdown'],                                                                                                                  'hdrMed');
  const completedSet  = new Set(input.completedCodes);
  const statusMap     = new Map<string, string>(input.student.courseList.map((c) => [c.courseId, c.status]));
  const mpuStatusMap  = new Map<string, string>((input.mpuCourseList ?? []).map((c) => [c.courseId, c.status]));

  // Prescribed electives: count directly from planner units
  const prescribedUnits    = planner.units.filter((u) => u.unit !== null && u.category === 'prescribed_elective');
  const prescribedRequired = prescribedUnits.length;
  const prescribedMatched  = prescribedUnits.filter((u) => completedSet.has(u.unit!.unit_code)).length;

  add(['Core Units Matched',           primary ? `${primary.breakdown.core.matched} / ${primary.breakdown.core.required}` : '—'],            'row',    true);
  add(['Major Core Units Matched',     primary ? `${primary.breakdown.majorCore.matched} / ${primary.breakdown.majorCore.required}` : '—'],  'rowAlt', true);
  add(['Prescribed Electives Matched', `${prescribedMatched} / ${prescribedRequired}`],                                                       'row',    true);
  add(['Free Electives Matched',       primary ? `${primary.breakdown.freeElective.matched} / ${primary.breakdown.freeElective.required}` : '—'], 'rowAlt', true);
  add(['WIL',                          primary ? `${primary.breakdown.wil.matched} / ${primary.breakdown.wil.required}` : '—'],              'row',    true);

  const notTaken = planner.units
    .filter((u) => {
      if (u.unit === null) return false;
      const code = u.unit.unit_code;
      const status = statusMap.get(code) ?? mpuStatusMap.get(code);
      return !completedSet.has(code) && status !== 'Current';
    })
    .sort((a, b) => a.year_level - b.year_level || a.semester - b.semester);

  if (notTaken.length > 0) {
    add([''], 'blank');
    add(['Units to Be Taken'], 'hdrMed');
    add(['Unit Code', 'Unit Name', 'Type', 'Year', 'Semester'], 'hdrLight');
    notTaken.forEach((u, i) => {
      const type = u.category.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
      add([u.unit!.unit_code, u.unit!.unit_name, type, `Year ${u.year_level}`, `Sem ${u.semester}`], i % 2 === 0 ? 'row' : 'rowAlt');
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 36 }, { wch: 18 }, { wch: 10 }, { wch: 10 }];

  const styleMap: Record<Exclude<RowStyle, 'blank'>, any> = {
    hdrDark: S.hdrDark, hdrMed: S.hdrMed, hdrLight: S.hdrLight,
    row: S.row, rowAlt: S.rowAlt,
  };
  styles.forEach((style, r) => {
    if (style !== 'blank') applyRow(ws, r, NUM_COLS, styleMap[style]);
  });
  boldCol0(ws, boldRows);

  return ws;
}

function buildCompletedUnitsSheet(input: ExportInput): any {
  const { planner, intakeYear, student } = input;
  const NUM_COLS = 6;

  const completedSet = new Set(input.completedCodes);
  const gradeMap     = new Map<string, string>(student.courseList.map((c) => [c.courseId, c.grade]));

  const rows: (string | number)[][] = [['Unit Code', 'Unit Name', 'Year', 'Semester', 'Type', 'Grade']];
  const rowStyles: any[] = [S.hdrDark];

  planner.units
    .filter((u) => u.unit !== null && completedSet.has(u.unit!.unit_code))
    .sort((a, b) => a.year_level - b.year_level || a.semester - b.semester)
    .forEach((u, i) => {
      const code  = u.unit!.unit_code;
      const type  = u.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const grade = gradeMap.get(code) ?? '—';
      rows.push([
        code,
        u.unit!.unit_name,
        `Year ${u.year_level} (${intakeYear + u.year_level - 1})`,
        `Semester ${u.semester}`,
        type,
        grade,
      ]);
      rowStyles.push(i % 2 === 0 ? S.row : S.rowAlt);
    });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 36 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 10 }];
  rowStyles.forEach((style, r) => applyRow(ws, r, NUM_COLS, style));

  return ws;
}

function buildStudyPlannerSheet(input: ExportInput): any {
  const { planner, completedCodes, intakeYear, student } = input;
  const NUM_COLS = 6;

  const completedSet = new Set(completedCodes);
  const statusMap = new Map<string, string>(student.courseList.map((c) => [c.courseId, c.status]));
  const termMap   = new Map<string, string>(student.courseList.map((c) => [c.courseId, c.term]));
  const gradeMap  = new Map<string, string>(student.courseList.map((c) => [c.courseId, c.grade]));

  const sorted = planner.units
    .filter((u) => u.unit !== null)
    .sort((a, b) => a.year_level - b.year_level || a.semester - b.semester);

  const intakeMonthStr = planner.intakeMonth != null
    ? new Date(2000, planner.intakeMonth - 1).toLocaleString('en-MY', { month: 'long' })
    : null;

  const rows: (string | number)[][] = [];
  const rowStyles: any[] = [];

  // ── Planner info header block ─────────────────────────────────────────────
  const infoRows: [string, string][] = [
    ['Course',    planner.course?.name ?? '—'],
    ['Major',     planner.major?.name  ?? '—'],
    ['Intake',    [intakeYear, intakeMonthStr].filter(Boolean).join(' ')],
  ];
  rows.push(['Planner Information', '', '', '', '', '']);
  rowStyles.push(S.hdrMed);
  for (const [label, value] of infoRows) {
    rows.push([label, value, '', '', '', '']);
    rowStyles.push(S.row);
  }
  rows.push(['', '', '', '', '', '']);
  rowStyles.push(S.row);
  // ─────────────────────────────────────────────────────────────────────────

  let currentGroup = '';

  for (const u of sorted) {
    const groupKey = `${u.year_level}-${u.semester}`;
    if (groupKey !== currentGroup) {
      currentGroup = groupKey;
      const calYear = intakeYear + u.year_level - 1;
      rows.push([`Year ${u.year_level} (${calYear})  ·  Semester ${u.semester}`, '', '', '', '', '']);
      rowStyles.push(S.hdrDark);
      rows.push(['Unit Code', 'Unit Name', 'Type', 'Status', 'Grade', 'Term']);
      rowStyles.push(S.hdrLight);
    }

    const code = u.unit!.unit_code;
    const portalStatus = statusMap.get(code);
    const status = portalStatus === 'Current' ? 'Current' : completedSet.has(code) ? 'Completed' : 'Pending';
    const grade  = gradeMap.get(code) ?? '—';
    const term   = termMap.get(code) ?? '—';
    const type   = u.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    rows.push([code, u.unit!.unit_name, type, status, grade, term]);
    rowStyles.push(
      status === 'Current'   ? S.rowGreen  :
      status === 'Completed' ? S.row       :
                               S.rowSalmon
    );
  }

  const colAWidth = Math.max(16, ...rows.map((r) => String(r[0] ?? '').length));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: colAWidth }, { wch: 36 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
  rowStyles.forEach((style, r) => applyRow(ws, r, NUM_COLS, style));
  boldCol0(ws, [1, 2, 3]); // Course, Major, Intake labels

  return ws;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const SHEET_BUILDERS: Record<ExportSection, (input: ExportInput) => any> = {
  student_profile: buildStudentProfileSheet,
  major_match:     buildMajorMatchSheet,
  unit_plan:       buildCompletedUnitsSheet,
  study_planner:   buildStudyPlannerSheet,
};

/**
 * Generates an xlsx workbook buffer from the provided dashboard data.
 * Always includes a "Report Info" sheet as the first tab.
 * Only content sections listed in options.sections are included.
 */
export function generateExport(input: ExportInput): Buffer {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildReportInfoSheet(input), 'Report Info');

  for (const section of input.options.sections) {
    const ws = SHEET_BUILDERS[section](input);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAMES[section]);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
