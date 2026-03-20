import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as unitRepository from "../../../../../core/db/repositories/unitRepository";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const updatedUnit = await unitRepository.updateUnit(id, body);
    return NextResponse.json(updatedUnit, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await unitRepository.deleteUnit(id);
    return NextResponse.json({ message: "Unit deleted successfully" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete unit" }, { status: 500 });
  }
}
