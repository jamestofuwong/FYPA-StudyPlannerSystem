// ============================================================
// Imports student DPA exports into class estimation, as an alternative to reading the portal.
//
// Accepts several files at once and reports the outcome of each, since a cohort arrives as a folder of
// exports and one unreadable file should not discard the rest. Records land in the same store the scrape
// writes to, so everything downstream cannot tell the two apart.
//
// Two modes:
//   preview=1  parse and report what was found, storing nothing
//   (default)  parse and store, replacing whatever the previous run left
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '../../../../../core/db/client';
import { NOTICE_VERSION } from '../../../../lib/privacyNoticeContent';
import {
  parseDpaWorkbook,
  studentIdFromFilename,
  DpaParseError,
} from '../../../../../core/services/classEstimation/dpaImport/dpaFileParser';
import { buildEstimationRecord } from '../../../../../core/services/classEstimation/estimationRecordBuilder';
import {
  resetEstimationRecords,
  pushEstimationRecord,
  getEstimationRecords,
} from '../../../../../core/services/classEstimation/estimationStore';

export const dynamic = 'force-dynamic';

interface FileOutcome {
  filename: string;
  ok: boolean;
  students: Array<{ studentId: string; unitCount: number; intakeYear: number; intakeSemester: 1 | 2; warnings: string[] }>;
  /** Row-level problems from the parser, e.g. a line with no unit code. */
  rowWarnings: string[];
  error?: string;
}

export async function POST(req: NextRequest) {
  // Same server-side privacy gate the dashboard's import uses (REQ-PRI-101). DPA files carry real student
  // data, so the check belongs here too rather than only in front of the other route.
  const acknowledged = await prisma.privacyEvent.findFirst({
    where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
  });
  if (!acknowledged) {
    return NextResponse.json(
      { error: 'Privacy notice has not been acknowledged. Restart the application and accept it before importing data.' },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form with one or more files.' }, { status: 400 });
  }

  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files were provided.' }, { status: 400 });
  }

  const preview = formData.get('preview') === '1' || req.nextUrl.searchParams.get('preview') === '1';
  const outcomes: FileOutcome[] = [];
  const pending: Parameters<typeof buildEstimationRecord>[0][] = [];

  for (const file of files) {
    const outcome: FileOutcome = { filename: file.name, ok: false, students: [], rowWarnings: [] };

    try {
      const parsed = parseDpaWorkbook(await file.arrayBuffer());
      outcome.rowWarnings = parsed.warnings.map((w) => `row ${w.row}: ${w.message}`);

      for (const student of parsed.students) {
        // A sheet with an ID column names its own students. A single-student export does not, so the ID
        // comes off the filename, and a file with neither is refused rather than given an invented ID.
        const studentId = student.studentId ?? studentIdFromFilename(file.name);
        if (!studentId) {
          outcome.rowWarnings.push(
            'Skipped: no student ID. Add a "Student ID" column, or name the file after the student, e.g. 102780000_DPA.xlsx.',
          );
          continue;
        }

        const input = { source: 'import' as const, studentId, transcript: student.courseList };
        const record = buildEstimationRecord(input);
        pending.push(input);

        outcome.students.push({
          studentId,
          unitCount: student.courseList.length,
          intakeYear: record.rawInput.intakeYear,
          intakeSemester: record.rawInput.intakeSemester,
          warnings: record.mappingWarnings,
        });
      }

      outcome.ok = outcome.students.length > 0;
      if (!outcome.ok && !outcome.error) outcome.error = 'No students could be read from this file.';
    } catch (err) {
      outcome.error = err instanceof DpaParseError || err instanceof Error ? err.message : String(err);
    }

    outcomes.push(outcome);
  }

  const totalStudents = outcomes.reduce((sum, o) => sum + o.students.length, 0);

  if (!preview && totalStudents > 0) {
    // Replaces the previous run, matching what a scrape does, so a stale cohort cannot be silently mixed
    // into a new estimate. Only written once every file has parsed, so a failure part way through does not
    // leave the store half filled.
    resetEstimationRecords();
    for (const input of pending) pushEstimationRecord(buildEstimationRecord(input));
  }

  return NextResponse.json({
    preview,
    files: outcomes,
    totalFiles: files.length,
    filesFailed: outcomes.filter((o) => !o.ok).length,
    totalStudents,
    storedStudents: preview ? 0 : getEstimationRecords().length,
  }, { status: totalStudents > 0 ? 200 : 422 });
}

/** What is currently in the store, so the panel can show whether a previous import is still loaded. */
export async function GET() {
  const records = getEstimationRecords();
  return NextResponse.json({
    storedStudents: records.length,
    bySource: records.reduce<Record<string, number>>((acc, record) => {
      acc[record.source] = (acc[record.source] ?? 0) + 1;
      return acc;
    }, {}),
  });
}
