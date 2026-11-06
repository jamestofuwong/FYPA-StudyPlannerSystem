// Reads a results spreadsheet that a student chooses in the Plan Builder, and turns it into completed semesters.
//
// This runs in the browser. The file is read on the student's own computer and is never uploaded or stored. Only the unit
// codes and the terms go on to the Plan Builder. The grades are used to decide what counts and are then dropped.
import { parseResultsSheet } from '@core/shared/resultsSheet'
import { completedSemestersFromTranscript, type TranscriptImport } from '@core/shared/transcriptImport'

/** A results spreadsheet is a few kilobytes. A much bigger file is not one. */
export const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024

export type TranscriptReadResult =
  | { ok: true; transcript: TranscriptImport; rowCount: number }
  | { ok: false; error: string }

export type RowReader = (file: File) => Promise<unknown[][]>

/** The spreadsheet reader loads only when a student uses the import, so it costs nothing for everybody else. */
const readRowsWithLibrary: RowReader = async (file) => {
  const { readSheet } = await import('read-excel-file/browser')
  return (await readSheet(file)) as unknown[][]
}

export async function readTranscriptFile(file: File, readRows: RowReader = readRowsWithLibrary): Promise<TranscriptReadResult> {
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: 'Choose an Excel file that ends in .xlsx.' }
  if (file.size === 0) return { ok: false, error: 'This file is empty.' }
  if (file.size > MAX_TRANSCRIPT_BYTES) return { ok: false, error: 'This file is too big for a results spreadsheet (2 MB at most).' }

  let rows: unknown[][]
  try {
    rows = await readRows(file)
  } catch {
    return { ok: false, error: 'This file could not be read. Check that it is an Excel .xlsx file with your results.' }
  }

  // The same reader of the columns as the advisor app, so the same files work in both
  const parsed = parseResultsSheet(rows)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  return { ok: true, transcript: completedSemestersFromTranscript(parsed.courseList), rowCount: parsed.courseList.length }
}
