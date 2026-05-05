import { NextResponse } from 'next/server';
import { savePlannerFromImport } from '../../../../../core/db/repositories/plannerRepository';
import type { PlannerImportPlanner } from '../../../../../core/shared/types/plannerImport';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const planner = body.planner || body;

    if (!planner || !planner.course_information) {
      return NextResponse.json({ error: 'Invalid planner data structure' }, { status: 400 });
    }

    const result = await savePlannerFromImport(planner as PlannerImportPlanner);
    return NextResponse.json({ success: true, plannerId: result.id });
  } catch (error: any) {
    console.error('SAVE ERROR:', error);
    
    // Check for duplicate planner error
    if (error.message === 'DUPLICATE_PLANNER') {
      return NextResponse.json(
        { error: 'A planner with this course, major, intake year and month already exists' },
        { status: 409 }
      );
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}