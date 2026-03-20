import { NextResponse } from "next/server";
import * as majorRepository from "../../../../core/db/repositories/majorRepository";

export async function GET() {
  try {
    const majors = await majorRepository.getAllMajors();
    return NextResponse.json(majors, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch majors" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const newMajor = await majorRepository.createMajor(body);
    return NextResponse.json(newMajor, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Server error creating major" },
      { status: 500 }
    );
  }
}
