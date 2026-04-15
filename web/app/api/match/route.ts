import { NextResponse } from 'next/server';
import { runMatchingPipeline } from '../../../../core/services/matching/matchingService';
import * as plannerRepository from '../../../../core/db/repositories/plannerRepository';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { student } = body;

    if (!student) return NextResponse.json({ error: "Missing student data" }, { status: 400 });

    const planners = await plannerRepository.getAllPlanners();

    const formattedPlanners = planners.map(p => ({
      ...p,
      requiredCore: ["COS10009", "COS20007", "COS10022", "COS10026", "TNE10006"],
      requiredMajorCore: new Set(),
      prescribedElectives: new Set(),
      prescribedElectiveCategories: [],
      openElectives: 0,
      electivesCount: 0
    }));

    const unitCatalog = student.completedUnitCodes.map((code: string) => ({
          code: code,
          creditPoints: 12.5
        }));

    const result = runMatchingPipeline({
      student: student,
      planners: formattedPlanners as any,
      unitMasterTable: unitCatalog as any,
      config: { preferIntakeYear: false }
    });

    return NextResponse.json({
      success: true,
      data: result.payload,
      processingTime: result.durationMs
    });

  } catch (error) {
    console.error("Matching API Error:", error);
    return NextResponse.json({ success: false, error: "Failed to run matching pipeline" }, { status: 500 });
  }
}