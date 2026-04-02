import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as electiveGroupUnitRepository from "../../../../../../core/db/repositories/electiveGroupUnitRepository";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ electiveGroupId: string; unitId: string }> }
) {
    const { electiveGroupId, unitId } = await params;
    try {
        await electiveGroupUnitRepository.deleteElectiveGroupUnit(electiveGroupId, unitId);
        return NextResponse.json({ message: "Elective group unit deleted successfully" }, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to delete elective group unit" }, { status: 500 });
    }
}