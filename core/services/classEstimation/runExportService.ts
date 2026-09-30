// ============================================================
// Writes a saved estimation run to an Excel workbook, which is the form the figures actually leave the
// system in. A headcount is only useful once it reaches whoever allocates rooms and staff, and that handover
// happens in a spreadsheet, not by reading a dashboard aloud.
//
// Two sheets, and the second is not optional padding. A projection means nothing months later without the
// retention rate, the load cap and the new-intake figure behind it, so every workbook carries its own
// assumptions. Anyone opening the file can see what it was built from without going back to the system.
//
// The style palette is a small deliberate copy of core/services/export/exportService.ts rather than an
// import. That module drives the student report other features depend on, and exporting its private
// helpers to save ten lines of constants is not worth the chance of disturbing it. Worth unifying if a
// third exporter ever appears.
// ============================================================

import * as XLSX from 'xlsx-js-style';
import type { EstimationRunDetail } from '../../db/repositories/estimationRunRepository';

const hex = (h: string) => ({ rgb: h });
const thin = () => ({ style: 'thin' as const, color: hex('CCCCCC') });
const border = () => ({ top: thin(), bottom: thin(), left: thin(), right: thin() });

function style(background: string, fontOptions: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fill: { patternType: 'solid', fgColor: hex(background) },
    font: { name: 'Calibri', sz: 11, color: hex('1F1F1F'), ...fontOptions },
    border: border(),
    alignment: { vertical: 'center', wrapText: false },
  };
}

const S = {
  title:   style('1F3864', { bold: true, sz: 13, color: hex('FFFFFF') }),
  header:  style('2E5FAC', { bold: true, color: hex('FFFFFF') }),
  row:     style('FFFFFF'),
  rowAlt:  style('F5F5F5'),
  /** A unit projected to draw nobody, which is a result worth seeing rather than a blank. */
  rowNone: style('FCE4D6'),
  label:   style('D6E4F0', { bold: true }),
  note:    style('FFFFFF', { italic: true, color: hex('595959') }),
};

const SHEETS = {
  projection: 'Projected Enrolment',
  details: 'Run Details',
};

function applyRow(sheet: XLSX.WorkSheet, row: number, columns: number, cellStyle: unknown): void {
  for (let column = 0; column < columns; column++) {
    const address = XLSX.utils.encode_cell({ r: row, c: column });
    if (sheet[address]) (sheet[address] as { s?: unknown }).s = cellStyle;
  }
}

function semesterLabel(run: EstimationRunDetail): string {
  return `Semester ${run.targetSemester}, ${run.targetYear}`;
}

/**
 * The figures, one row per unit, largest first.
 *
 * The breakdown columns are kept rather than collapsed into the headcount. A unit drawing 40 students who
 * must take it is a different staffing proposition from one drawing 40 who might choose it, and only the
 * breakdown tells them apart.
 */
function buildProjectionSheet(run: EstimationRunDetail): XLSX.WorkSheet {
  const rows: unknown[][] = [
    [`Projected enrolment, ${semesterLabel(run)}`, '', '', '', ''],
    ['Unit', 'Required', 'Elective', 'New students', 'Projected headcount'],
  ];

  for (const unit of run.units) {
    rows.push([
      unit.unitCode,
      unit.fromNamedPicks || '',
      unit.fromElectives > 0 ? Number(unit.fromElectives.toFixed(2)) : '',
      unit.fromNewIntake || '',
      unit.headcount,
    ]);
  }

  rows.push([]);
  rows.push(['Total', '', '', '', run.units.reduce((sum, unit) => sum + unit.headcount, 0)]);
  rows.push([]);
  rows.push(['Required counts students whose planner says they still owe the unit.']);
  rows.push(['Elective counts shares of a student spread across the options they could pick, so it is fractional.']);
  rows.push(['New students is the expected intake, which is not discounted because it is already what you expect to arrive.']);
  rows.push(['Each unit is rounded on its own, so the column may not add up to the total exactly.']);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 20 }];
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

  applyRow(sheet, 0, 5, S.title);
  applyRow(sheet, 1, 5, S.header);

  run.units.forEach((unit, index) => {
    const row = index + 2;
    applyRow(sheet, row, 5, unit.headcount === 0 ? S.rowNone : index % 2 === 0 ? S.row : S.rowAlt);
  });

  const totalRow = run.units.length + 3;
  applyRow(sheet, totalRow, 5, S.label);
  for (let row = totalRow + 2; row <= totalRow + 5; row++) applyRow(sheet, row, 1, S.note);

  return sheet;
}

/** What the figures were built from. Without this sheet the other one is a list of numbers with no meaning. */
function buildDetailsSheet(run: EstimationRunDetail): XLSX.WorkSheet {
  const sourceLabels: Record<string, string> = {
    portal: 'Read from the student portal',
    import: 'Imported from DPA files',
    mock: 'Generated test data, NOT real students',
    mixed: 'More than one source',
    none: 'No students',
  };

  const rows: unknown[][] = [
    ['How this estimate was produced', ''],
    ['Semester estimated', semesterLabel(run)],
    ['Produced on', run.createdAt.toLocaleString()],
    ['Label', run.label ?? ''],
    ['', ''],
    ['Students read', run.studentCount],
    ['Distinct situations among them', run.groupCount],
    ['Estimated without a detected major', run.commonCoreCount],
    ['Where the transcripts came from', sourceLabels[run.source] ?? run.source],
    ['', ''],
    ['Students assumed returning', `${(run.retentionRate * 100).toFixed(0)}%`],
    ['New students expected', run.newIntake],
    ['Units per student per semester', run.loadCap],
    ['', ''],
    ['Students with no detected major are estimated from the units every major shares, since first-year'],
    ['units are the same whichever major a student later picks.'],
    ['The returning-students rate is applied to current students only. The new-student figure is used as'],
    ['entered, because it already describes who is expected to arrive.'],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 36 }, { wch: 40 }];
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

  applyRow(sheet, 0, 2, S.title);
  for (const row of [1, 2, 3, 5, 6, 7, 8, 10, 11, 12]) {
    applyRow(sheet, row, 2, S.row);
    const address = XLSX.utils.encode_cell({ r: row, c: 0 });
    if (sheet[address]) (sheet[address] as { s?: unknown }).s = S.label;
  }
  for (let row = 14; row <= 17; row++) applyRow(sheet, row, 1, S.note);

  return sheet;
}

export function buildRunExport(run: EstimationRunDetail): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildProjectionSheet(run), SHEETS.projection);
  XLSX.utils.book_append_sheet(workbook, buildDetailsSheet(run), SHEETS.details);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** A filename that says what the file is without needing to be opened. */
export function runExportFilename(run: EstimationRunDetail): string {
  const date = run.createdAt.toISOString().slice(0, 10);
  const label = run.label ? `-${run.label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}` : '';
  return `class-estimate-${run.targetYear}-S${run.targetSemester}-${date}${label}.xlsx`;
}
