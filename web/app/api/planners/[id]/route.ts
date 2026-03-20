import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as plannerRepository from "../../../../../core/db/repositories/plannerRepository";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const updatedPlanner = await plannerRepository.updatePlanner(id, body);
    return NextResponse.json(updatedPlanner, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update planner" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await plannerRepository.deletePlanner(id);
    return NextResponse.json(
      { message: "Planner deleted successfully" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Failed to delete planner" }, { status: 500 });
  }
}
