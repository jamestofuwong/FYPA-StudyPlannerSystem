import { NextResponse } from 'next/server';
import { savePlannerFromImport } from '../../../../../core/db/repositories/plannerRepository';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const planner = body.planner || body;

    if (!planner || !planner.course_information) {
      return NextResponse.json({ error: 'Invalid planner data structure' }, { status: 400 });
    }

    const result = await savePlannerFromImport(planner);
    return NextResponse.json({ success: true, plannerId: result.id });
  } catch (error: any) {
    console.error('SAVE ERROR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
