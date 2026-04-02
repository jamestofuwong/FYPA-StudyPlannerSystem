import { NextResponse } from "next/server";
import * as electiveGroupRepository from "../../../../core/db/repositories/electiveGroupRepository";

export async function GET() {
    try {
        const groups = await electiveGroupRepository.getAllElectiveGroups();
        return NextResponse.json(groups, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch elective groups" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const newGroup = await electiveGroupRepository.createElectiveGroup(body);
        return NextResponse.json(newGroup, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error creating elective group" }, { status: 500 });
    }
}