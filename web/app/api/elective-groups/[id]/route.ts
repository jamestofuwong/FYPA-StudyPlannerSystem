import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as electiveGroupRepository from "../../../../../core/db/repositories/electiveGroupRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const group = await electiveGroupRepository.getElectiveGroupById(id);
        if (!group) {
            return NextResponse.json({ error: "Elective group not found" }, { status: 404 });
        }
        return NextResponse.json(group, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch elective group" }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await req.json();
        const updated = await electiveGroupRepository.updateElectiveGroup(id, body);
        return NextResponse.json(updated, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to update elective group" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await electiveGroupRepository.deleteElectiveGroup(id);
        return NextResponse.json({ message: "Elective group deleted successfully" }, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to delete elective group" }, { status: 500 });
    }
}