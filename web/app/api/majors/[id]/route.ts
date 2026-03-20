import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as majorRepository from "../../../../../core/db/repositories/majorRepository";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const updatedMajor = await majorRepository.updateMajor(id, body);
    return NextResponse.json(updatedMajor, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to update major" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await majorRepository.deleteMajor(id);
    return NextResponse.json({ message: "Major deleted successfully" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to delete major" }, { status: 500 });
  }
}
