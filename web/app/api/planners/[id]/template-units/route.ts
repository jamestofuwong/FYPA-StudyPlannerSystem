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

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: plannerId } = await params;
        const body = await req.json();
        const templateUnitId = String(body.template_unit_id || "");
        if (!templateUnitId) return NextResponse.json({ error: "template_unit_id is required" }, { status: 400 });
        const updated = await templateUnitRepository.updateTemplateUnitDetails(templateUnitId, plannerId, body);
        return NextResponse.json(updated, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update planner unit";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
