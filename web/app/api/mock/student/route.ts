import { NextResponse } from "next/server";
import { getMockStudent } from "../../../../../core/services/studentService";

export async function GET() {
  return NextResponse.json(getMockStudent(), { status: 200 });
}
