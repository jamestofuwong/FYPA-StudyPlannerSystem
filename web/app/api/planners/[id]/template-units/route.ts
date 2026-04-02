import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as templateUnitRepository from "../../../../../../core/db/repositories/templateUnitRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const templateUnits = await templateUnitRepository.getTemplateUnitsByPlanner(id);
        return NextResponse.json(templateUnits, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch template units for planner" }, { status: 500 });
    }
}