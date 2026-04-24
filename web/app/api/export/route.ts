import { NextResponse } from 'next/server';
import { generateExport } from '../../../../core/services/export/exportService';
import type { ExportInput } from '../../../../core/shared/types/export';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const input = await req.json() as ExportInput;

    if (!input.options?.sections?.length) {
      return NextResponse.json({ error: 'No export sections selected.' }, { status: 400 });
    }

    const buffer = generateExport(input);
    const filename = `student-${input.studentId}-report.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[Export] Error:', error);
    return NextResponse.json({ error: error.message ?? 'Export failed.' }, { status: 500 });
  }
}
