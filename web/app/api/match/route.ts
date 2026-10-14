import { NextResponse } from 'next/server';
import { runDashboardMatch } from '../../../../core/services/matching/dashboardMatch';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawStudent = body.student;

    if (!rawStudent) return NextResponse.json({ error: "Missing student data" }, { status: 400 });

    const { data, graduationCheck, processingTime } = await runDashboardMatch(rawStudent);

    return NextResponse.json({
      success: true,
      data,
      graduationCheck,
      processingTime,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Matching API Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
