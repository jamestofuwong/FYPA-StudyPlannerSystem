import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as electiveGroupUnitRepository from "../../../../../../core/db/repositories/electiveGroupUnitRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const units = await electiveGroupUnitRepository.getElectiveGroupUnitsByGroup(id);
        return NextResponse.json(units, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch units for elective group" }, { status: 500 });
    }
}