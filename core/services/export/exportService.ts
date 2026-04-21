import * as XLSX from 'xlsx';
import type { ExportInput, ExportSection } from '../../shared/types/export';

// ---------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------

function buildStudentProfileSheet(input: ExportInput): XLSX.WorkSheet {
  const { student, studentId } = input;

  const rows: [string, string | number][] = [
    ['Field', 'Value'],
    ['Student Name',        student.studentName ?? '—'],
    ['Student ID',          studentId],
    ['GPA',                 student.cgpa ?? '—'],
    ['Grade Level',         student.gradeLevel ?? '—'],
    ['Enrollment Date',     student.enrollmentDate ?? '—'],
    ['Expected Graduation', student.graduationDate ?? '—'],
    ['Credits Required',    student.creditsRequired ?? '—'],
    ['Credits Completed',   student.creditsCompleted ?? '—'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 30 }];
  return ws;
}

function buildMajorMatchSheet(input: ExportInput): XLSX.WorkSheet {
  const { match, planner } = input;
  const primary = match.primaryMajor;

  const rows: [string, string | number][] = [
    ['Field', 'Value'],
    ['Course',                      planner.course.name],
    ['Major',                       primary?.majorName ?? '—'],
    ['Match Percentage',            primary ? `${primary.matchPct}%` : '—'],
    ['Detection Status',            match.status],
    ['', ''],
    ['Category Breakdown', ''],
    ['Core Units Matched',          primary ? `${primary.breakdown.core.matched} / ${primary.breakdown.core.required}` : '—'],
    ['Major Core Units Matched',    primary ? `${primary.breakdown.majorCore.matched} / ${primary.breakdown.majorCore.required}` : '—'],
    ['Prescribed Electives Matched',primary ? `${primary.breakdown.prescribed.matched} / ${primary.breakdown.prescribed.required}` : '—'],
    ['Free Electives Matched',      primary ? `${primary.breakdown.freeElective.matched} / ${primary.breakdown.freeElective.required}` : '—'],
    ['WIL',                         primary ? `${primary.breakdown.wil.matched} / ${primary.breakdown.wil.required}` : '—'],
  ];

  if (primary?.breakdown.core.missingUnits?.length) {
    rows.push(['', '']);
    rows.push(['Missing Core Units', primary.breakdown.core.missingUnits.join(', ')]);
  }
  if (primary?.breakdown.majorCore.missingUnits?.length) {
    rows.push(['Missing Major Core Units', primary.breakdown.majorCore.missingUnits.join(', ')]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 40 }];
  return ws;
}

function buildUnitPlanSheet(input: ExportInput): XLSX.WorkSheet {
  const { planner, completedCodes, intakeYear } = input;

  const header = ['Unit Code', 'Unit Name', 'Year', 'Semester', 'Type', 'Status'];
  const dataRows = planner.units
    .filter((u) => u.unit !== null)
    .sort((a, b) => a.year_level - b.year_level || a.semester - b.semester)
    .map((u) => {
      const completed = completedCodes.includes(u.unit!.unit_code);
      return [
        u.unit!.unit_code,
        u.unit!.unit_name,
        `Year ${u.year_level} (${intakeYear + u.year_level - 1})`,
        `Semester ${u.semester}`,
        u.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        completed ? 'Completed' : 'Pending',
      ];
    });

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  ws['!cols'] = [{ wch: 12 }, { wch: 36 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 12 }];
  return ws;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const SHEET_BUILDERS: Record<ExportSection, (input: ExportInput) => XLSX.WorkSheet> = {
  student_profile: buildStudentProfileSheet,
  major_match:     buildMajorMatchSheet,
  unit_plan:       buildUnitPlanSheet,
};

const SHEET_NAMES: Record<ExportSection, string> = {
  student_profile: 'Student Profile',
  major_match:     'Major & Course Match',
  unit_plan:       'Unit Plan',
};

/**
 * Generates an xlsx workbook buffer from the provided dashboard data.
 * Only sections listed in options.sections are included.
 */
export function generateExport(input: ExportInput): Buffer {
  const wb = XLSX.utils.book_new();

  for (const section of input.options.sections) {
    const ws = SHEET_BUILDERS[section](input);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAMES[section]);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
