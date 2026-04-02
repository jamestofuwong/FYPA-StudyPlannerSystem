import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as majorRepository from "../../../../../../core/db/repositories/majorRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const majors = await majorRepository.getMajorsByCourseId(id);
        return NextResponse.json(majors, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch majors for course" }, { status: 500 });
    }
}