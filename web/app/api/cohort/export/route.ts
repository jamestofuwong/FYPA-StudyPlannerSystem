import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { getActiveSession } from '../store';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Style helpers (matching exportService.ts pattern)
// ---------------------------------------------------------------------------

const hex = (h: string) => ({ rgb: h });
const thin = () => ({ style: 'thin' as const, color: hex('CCCCCC') });
const bdr = () => ({ top: thin(), bottom: thin(), left: thin(), right: thin() });

function mkStyle(bg: string, fontOpts: Record<string, any> = {}): any {
  return {
    fill: { patternType: 'solid', fgColor: hex(bg) },
    font: { name: 'Calibri', sz: 11, color: hex('1F1F1F'), ...fontOpts },
    border: bdr(),
    alignment: { vertical: 'center', wrapText: false },
  };
}

const S = {
  hdrDark:  mkStyle('1F3864', { bold: true, color: hex('FFFFFF') }),
  row:      mkStyle('FFFFFF'),
  rowAlt:   mkStyle('F5F5F5'),
  rowRed:   mkStyle('FCE4D6'),
  rowOrange:mkStyle('FDEBD0'),
  rowYellow:mkStyle('FEF9E7'),
};

function applyRow(ws: any, r: number, numCols: number, style: any) {
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (ws[addr]) ws[addr].s = style;
  }
}

function rowStyleForRisk(level: string): any {
  switch (level) {
    case 'critical': return S.rowRed;
    case 'high':     return S.rowOrange;
    case 'medium':   return S.rowYellow;
    default:         return S.row;
  }
}

/**
 * POST /api/cohort/export — Generate a cohort summary Excel workbook.
 *
 * Body: { sessionId: string }
 * Returns an XLSX binary as an attachment.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body ?? {};

    const session = getActiveSession();
    if (!session) {
      return NextResponse.json(
        { error: 'No active cohort session found.' },
        { status: 404 },
      );
    }

    if (sessionId && session.id !== sessionId) {
      return NextResponse.json(
        { error: 'Session ID does not match active session.' },
        { status: 409 },
      );
    }

    const NUM_COLS = 8;
    const headers = [
      'Student ID',
      'Name',
      'Detected Major',
      'Match %',
      'At-Risk Level',
      'Graduation Eligible',
      'Missing Core Count',
      'Status',
    ];

    const rows: any[][] = [headers];
    const styles: any[] = [S.hdrDark];

    session.results.forEach((r, i) => {
      const mr = r.matchResult;
      rows.push([
        r.studentId,
        r.studentName ?? '—',
        mr?.detectedMajor ?? '—',
        mr ? `${mr.matchPct.toFixed(1)}%` : '—',
        mr?.atRiskLevel ?? (r.status === 'error' ? 'error' : '—'),
        mr ? (mr.graduationEligible ? 'Yes' : 'No') : '—',
        mr?.missingCoreCount ?? '—',
        mr?.status ?? r.status,
      ]);

      const riskLevel = mr?.atRiskLevel ?? '';
      const baseStyle = rowStyleForRisk(riskLevel);
      styles.push(i % 2 === 0 ? baseStyle : (riskLevel ? baseStyle : S.rowAlt));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, // Student ID
      { wch: 28 }, // Name
      { wch: 30 }, // Detected Major
      { wch: 10 }, // Match %
      { wch: 14 }, // At-Risk Level
      { wch: 18 }, // Graduation Eligible
      { wch: 18 }, // Missing Core Count
      { wch: 18 }, // Status
    ];

    styles.forEach((style, r) => applyRow(ws, r, NUM_COLS, style));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const filename = `cohort-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[Cohort Export] Error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Export failed.' },
      { status: 500 },
    );
  }
}
