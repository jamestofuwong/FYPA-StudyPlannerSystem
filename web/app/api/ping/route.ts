import { NextResponse } from "next/server";
import { ping } from "../../../../core/services/pingService";

export async function GET() {
  return NextResponse.json(ping(), { status: 200 });
}
