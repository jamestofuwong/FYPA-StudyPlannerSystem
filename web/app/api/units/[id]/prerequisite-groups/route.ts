import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as prerequisiteGroupRepository from "../../../../../../core/db/repositories/unitPrerequisiteGroupRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const groups = await prerequisiteGroupRepository.getPrerequisiteGroupsByUnit(id);
        return NextResponse.json(groups, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch prerequisite groups for unit" }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const group = await prerequisiteGroupRepository.createPrerequisiteGroup({ unit_id: id });
        return NextResponse.json(group, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create prerequisite group" }, { status: 500 });
    }
}