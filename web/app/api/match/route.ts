import { NextResponse } from 'next/server';
import { runDashboardMatch } from '../../../../core/services/matching/dashboardMatch';

/** The fields the matcher reads without a default. Anything else is rejected here instead of failing inside it. */
function invalidStudent(student: unknown): string | null {
  if (!student || typeof student !== 'object') return 'Missing student data';
  const s = student as Record<string, unknown>;
  if (!Array.isArray(s.completedUnitCodes) || !s.completedUnitCodes.every((c) => typeof c === 'string')) {
    return 'completedUnitCodes must be a list of unit codes';
  }
  if (!Number.isInteger(s.intakeYear)) return 'intakeYear must be a whole number';
  if (s.intakeSemester !== 1 && s.intakeSemester !== 2) return 'intakeSemester must be 1 or 2';
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawStudent = body.student;

    const invalid = invalidStudent(rawStudent);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { data, processingTime } = await runDashboardMatch(rawStudent);

    return NextResponse.json({
      success: true,
      data,
      processingTime,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Matching API Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
