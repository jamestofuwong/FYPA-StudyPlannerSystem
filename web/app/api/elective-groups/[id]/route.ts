import { readBody, ELECTIVE_GROUP_FIELDS } from "@/lib/requestBody";
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
        const parsed = await readBody(req, ELECTIVE_GROUP_FIELDS, { partial: true });
        if (!parsed.ok) return parsed.response;
        const body = parsed.data;
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