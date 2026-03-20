import { NextResponse } from "next/server";
import * as plannerRepository from "../../../../core/db/repositories/plannerRepository";

export async function GET() {
  try {
    const planners = await plannerRepository.getAllPlanners();
    return NextResponse.json(planners, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch planners" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const newPlanner = await plannerRepository.createPlanner(body);
    return NextResponse.json(newPlanner, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Server error creating planner" },
      { status: 500 }
    );
  }
}
