import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as conditionRepository from "../../../../../core/db/repositories/unitPrerequisiteConditionRepository";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await conditionRepository.deleteCondition(id);
        return NextResponse.json({ message: "Condition deleted successfully" }, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to delete condition" }, { status: 500 });
    }
}