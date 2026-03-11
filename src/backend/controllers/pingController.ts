import { NextResponse } from "next/server";
import { createPingResponse } from "../services/pingService";

export async function pingController() {
  return NextResponse.json(createPingResponse(), { status: 200 });
}
