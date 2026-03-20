import { NextResponse } from "next/server";
import * as unitRepository from "../../../../core/db/repositories/unitRepository";

export async function GET() {
  try {
    const units = await unitRepository.getAllUnits();
    return NextResponse.json(units, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const newUnit = await unitRepository.createUnit(body);
    return NextResponse.json(newUnit, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error creating unit" }, { status: 500 });
  }
}
