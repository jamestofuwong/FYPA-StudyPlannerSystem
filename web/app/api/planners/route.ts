import { NextResponse } from "next/server";
import { extractPlannerFromPdf } from "../../../../core/services/plannerImport/plannerImportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plannerRepository = await import("../../../../core/db/repositories/plannerRepository");
    const planners = await plannerRepository.getAllPlanners();
    return NextResponse.json(planners, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error('[/api/planners GET]', err);
    return NextResponse.json({ error: "Failed to fetch planners" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Expected a PDF file in form field 'file'" }, { status: 400 });
      }

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json({ error: "Only PDF uploads are supported" }, { status: 400 });
      }

      const result = await extractPlannerFromPdf(Buffer.from(await file.arrayBuffer()), {
        filename: file.name,
      });

      return NextResponse.json(result, { status: 200 });
    }

    const body = await req.json();
    const plannerRepository = await import("../../../../core/db/repositories/plannerRepository");
    const newPlanner = await plannerRepository.createPlanner(body);
    return NextResponse.json(newPlanner, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error creating planner";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
