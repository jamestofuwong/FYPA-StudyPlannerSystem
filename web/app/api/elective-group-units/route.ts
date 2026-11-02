import { readBody, ELECTIVE_GROUP_UNIT_FIELDS } from "@/lib/requestBody";
import { NextResponse } from "next/server";
import * as electiveGroupUnitRepository from "../../../../core/db/repositories/electiveGroupUnitRepository";

export async function GET() {
    try {
        const units = await electiveGroupUnitRepository.getAllElectiveGroupUnits();
        return NextResponse.json(units, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch elective group units" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const parsed = await readBody<{ elective_group_id: string; unit_id: string }>(req, ELECTIVE_GROUP_UNIT_FIELDS);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data;
        const newUnit = await electiveGroupUnitRepository.createElectiveGroupUnit(body);
        return NextResponse.json(newUnit, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error creating elective group unit" }, { status: 500 });
    }
}