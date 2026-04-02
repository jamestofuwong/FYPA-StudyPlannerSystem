import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as templateUnitRepository from "../../../../../core/db/repositories/templateUnitRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const templateUnit = await templateUnitRepository.getTemplateUnitById(id);
        if (!templateUnit) {
            return NextResponse.json({ error: "Template unit not found" }, { status: 404 });
        }
        return NextResponse.json(templateUnit, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch template unit" }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await req.json();
        const updated = await templateUnitRepository.updateTemplateUnit(id, body);
        return NextResponse.json(updated, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to update template unit" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await templateUnitRepository.deleteTemplateUnit(id);
        return NextResponse.json({ message: "Template unit deleted successfully" }, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to delete template unit" }, { status: 500 });
    }
}