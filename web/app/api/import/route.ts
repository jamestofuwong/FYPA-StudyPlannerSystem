import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    if (rows.length < 2) return NextResponse.json({ error: 'File has no data rows.' }, { status: 400 });

    // Map columns: Course | Course Title | Credits | Earned | Status | Grade | Term
    const courseList = rows
      .slice(1)
      .filter((row) => row.length >= 5 && row[0])
      .map((row) => ({
        courseId:      String(row[0] ?? '').trim(),
        courseTitle:   String(row[1] ?? '').trim(),
        level:         '',
        credits:       Number(row[2]) || 0,
        creditsEarned: Number(row[3]) || 0,
        status:        String(row[4] ?? '').trim(),
        grade:         String(row[5] ?? '').trim(),
        term:          String(row[6] ?? '').trim(),
      }));

    return NextResponse.json({ courseList });
  } catch {
    return NextResponse.json({ error: 'Failed to parse file.' }, { status: 500 });
  }
}
