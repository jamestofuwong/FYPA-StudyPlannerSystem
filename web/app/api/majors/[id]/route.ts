import { readBody, MAJOR_FIELDS } from "@/lib/requestBody";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as majorRepository from "@core/db/repositories/majorRepository";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const major = await majorRepository.getMajorById(id);
    if (!major) {
      return NextResponse.json({ error: "Major not found" }, { status: 404 });
    }
    return NextResponse.json(major, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch major" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const parsed = await readBody(req, MAJOR_FIELDS, { partial: true });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
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
