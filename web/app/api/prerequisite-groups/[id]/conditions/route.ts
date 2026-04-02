import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as conditionRepository from "../../../../../../core/db/repositories/unitPrerequisiteConditionRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const conditions = await conditionRepository.getConditionsByGroup(id);
        return NextResponse.json(conditions, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch conditions for group" }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await req.json();
        const condition = await conditionRepository.createCondition({
        ...body,
        group_id: id
        });
        return NextResponse.json(condition, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create condition" }, { status: 500 });
    }
}