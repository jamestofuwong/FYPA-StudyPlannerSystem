// ============================================================
// Downloads a saved estimation run as an Excel workbook.
//
// Built from the saved run rather than from a fresh estimate on purpose. The file is a record of what was
// reported, so re-running the pipeline to produce it would mean the spreadsheet and the run it claims to be
// could disagree once the cohort or the planners changed.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getEstimationRun } from '../../../../../../../core/db/repositories/estimationRunRepository';
import {
  buildRunExport,
  runExportFilename,
} from '../../../../../../../core/services/classEstimation/runExportService';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const run = await getEstimationRun(id);
    if (!run) return NextResponse.json({ error: 'No run with that id' }, { status: 404 });

    const workbook = buildRunExport(run);

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${runExportFilename(run)}"`,
        'Content-Length': String(workbook.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[class-estimation runs] export failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
