import { readBody, UNIT_FIELDS } from "@/lib/requestBody";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as unitRepository from "../../../../../core/db/repositories/unitRepository";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const unit = await unitRepository.getUnitById(id);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    return NextResponse.json(unit, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch unit" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const parsed = await readBody(req, UNIT_FIELDS, { partial: true });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
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
