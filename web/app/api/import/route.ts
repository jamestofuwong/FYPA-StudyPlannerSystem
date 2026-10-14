import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { prisma } from '../../../../core/db/client';
import { NOTICE_VERSION } from '../../../lib/privacyNoticeContent';
import { parseResultsSheet } from '../../../lib/resultsSheet';

export async function POST(req: NextRequest) {
  // Server-side privacy gate — belt-and-suspenders behind the UI modal (REQ-PRI-101)
  const acknowledged = await prisma.privacyEvent.findFirst({
    where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
  });
  if (!acknowledged) {
    return NextResponse.json(
      { error: 'Privacy notice has not been acknowledged. Please restart the application and accept the privacy notice before importing data.' },
      { status: 403 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

    // Columns are found by their header names, not by position.
    const parsed = parseResultsSheet(rows);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { courseList } = parsed;

    return NextResponse.json({ courseList });
  } catch {
    return NextResponse.json({ error: 'Failed to parse file.' }, { status: 500 });
  }
}
