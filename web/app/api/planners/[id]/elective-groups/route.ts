import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as electiveGroupRepository from "../../../../../../core/db/repositories/electiveGroupRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const groups = await electiveGroupRepository.getElectiveGroupsByPlanner(id);
        return NextResponse.json(groups, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch elective groups for planner" }, { status: 500 });
    }
}