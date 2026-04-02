import { NextResponse } from "next/server";
import * as templateUnitRepository from "../../../../core/db/repositories/templateUnitRepository";

export async function GET() {
    try {
        const templateUnits = await templateUnitRepository.getAllTemplateUnits();
        return NextResponse.json(templateUnits, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch template units" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const newTemplateUnit = await templateUnitRepository.createTemplateUnit(body);
        return NextResponse.json(newTemplateUnit, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error creating template unit" }, { status: 500 });
    }
}