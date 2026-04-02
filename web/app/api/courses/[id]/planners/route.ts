import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as plannerRepository from "../../../../../../core/db/repositories/plannerRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const planners = await plannerRepository.getPlannersByCourse(id);
        return NextResponse.json(planners, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch planners for course" }, { status: 500 });
    }
}