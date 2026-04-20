import { NextRequest, NextResponse } from "next/server";
import type { ScrapeResult } from "../../../../core/shared/types/scraping";
import type { ScrapedStudent, ScrapedCourseListItem } from "../../../../core/shared/types/student";
import { scraperStore } from "./store";

// Map a successful ScrapeResult to the ScrapedStudent shape used by the rest of the app.
function mapToScrapedStudent(result: ScrapeResult & { scraped: true }): ScrapedStudent {
  const d = result.data;

  const courseList: ScrapedCourseListItem[] = (result.gridRows ?? []).map((row) => ({
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    credits: parseFloat(row.credits) || 0,
    creditsEarned: parseFloat(row.earned) || 0,
    status: row.status,
    grade: row.grade,
    term: row.term,
  }));

  return {
    course: d.program ?? "",
    status: d.status ?? "",
    cgpa: parseFloat(d.enrollmentCumGPA ?? "") || 0,
    creditsRequired: parseFloat(d.creditsRequiredFromEnrolment ?? "") || 0,
    creditsCompleted: parseFloat(d.creditsCompletedFromEnrolment ?? "") || 0,
    gradeLevel: d.gradeLevel ?? "",
    enrollmentDate: d.enrollDate ?? "",
    graduationDate: d.expGradDate ?? null,
    scheduledCredits: parseFloat(d.creditsCurrentScheduled ?? "") || 0,
    areasOfStudy: d.areasOfStudies ? [d.areasOfStudies] : undefined,
    courseList,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = body as ScrapeResult;

  if (!result || typeof result !== "object" || !("scraped" in result)) {
    return NextResponse.json({ error: "Invalid scrape result shape" }, { status: 400 });
  }

  if (!result.scraped) {
    return NextResponse.json(
      { error: result.error ?? "Scrape was unsuccessful" },
      { status: 422 }
    );
  }

  const student = mapToScrapedStudent(result);

  // Update the shared store so the dashboard polling loop can pick up the result.
  scraperStore.status = 'done';
  scraperStore.result = student;
  scraperStore.error = null;

  return NextResponse.json(student, { status: 200 });
}
