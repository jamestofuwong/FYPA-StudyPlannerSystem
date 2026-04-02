import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as prerequisiteGroupRepository from "../../../../../core/db/repositories/unitPrerequisiteGroupRepository";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await prerequisiteGroupRepository.deletePrerequisiteGroup(id);
        return NextResponse.json({ message: "Prerequisite group deleted successfully" }, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to delete prerequisite group" }, { status: 500 });
    }
}