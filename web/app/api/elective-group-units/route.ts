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
        const body = await req.json();
        const newUnit = await electiveGroupUnitRepository.createElectiveGroupUnit(body);
        return NextResponse.json(newUnit, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error creating elective group unit" }, { status: 500 });
    }
}