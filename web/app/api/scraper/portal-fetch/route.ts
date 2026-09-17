import { NextRequest, NextResponse } from 'next/server';
import { portalFetch, PortalAuthError } from '../../../../../core/services/portal/portalFetch';
import { portalSessionStore, scraperStore, clearPersistedSession } from '../store';
import type { ScrapedStudent, ScrapedCourseListItem } from '../../../../../core/shared/types/student';

// ─── Portal API response types ────────────────────────────────────────────────
// Note: field names contain portal typos and must be used exactly as-is.

type PortalCourseRecord = {
  CourseCode: string;
  CourseDescription: string;
  Units: number;
  UnitEarned: number;
  CourseStatus: string;
  CourseLetterGrade: string;
  TermCode: string;
};

type PortalAuditRecord = {
  Description: string;
  CurrentEnrollmetStatus: string;   // typo in portal API: missing 'n'
  OverallEnrollmentCumGPA: number;
  OverallEnrollmentunitRequired: number;
  OverallEnrollmentunitEarned: number;
  ScheduledCredits: number;
  GradeLevel: string;
  AreasOfStudies: string;
  EnrollmeDate: string;             // typo in portal API: missing 'nt'
  OriginalGraduateDate: string;
  CourseTakenInfoMessageList: PortalCourseRecord[];
};

type DegreeAuditResponse = {
  DataList: PortalAuditRecord[];
  ErrorMessage: string | null;
};

// ─── Map portal response → ScrapedStudent ────────────────────────────────────

function mapToScrapedStudent(
  audit: PortalAuditRecord,
  studentNumber: string,
): ScrapedStudent {
  const courseList: ScrapedCourseListItem[] = (audit.CourseTakenInfoMessageList ?? []).map(c => ({
    courseId:     c.CourseCode,
    courseTitle:  c.CourseDescription,
    level:        '',
    credits:      c.Units,
    creditsEarned: c.UnitEarned,
    status:       c.CourseStatus,
    grade:        c.CourseLetterGrade,
    term:         c.TermCode,
  }));

  return {
    studentId:    studentNumber,
    course:       audit.Description ?? '',
    status:       audit.CurrentEnrollmetStatus ?? '',
    cgpa:         audit.OverallEnrollmentCumGPA ?? 0,
    creditsRequired:  audit.OverallEnrollmentunitRequired ?? 0,
    creditsCompleted: audit.OverallEnrollmentunitEarned ?? 0,
    scheduledCredits: audit.ScheduledCredits ?? 0,
    gradeLevel:   audit.GradeLevel ?? '',
    enrollmentDate: audit.EnrollmeDate ?? '',
    graduationDate: audit.OriginalGraduateDate ?? null,
    areasOfStudy: audit.AreasOfStudies ? [audit.AreasOfStudies] : undefined,
    courseList,
  };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (portalSessionStore.sessionStatus !== 'logged-in' || !portalSessionStore.cookies || !portalSessionStore.portalToken) {
    return NextResponse.json({ ok: false, error: 'Not logged in to portal' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { dbId, enrollID, studentNumber } = body as { dbId?: number; enrollID?: number; studentNumber?: string };
  if (!dbId || !enrollID) {
    return NextResponse.json({ ok: false, error: 'dbId and enrollID are required' }, { status: 400 });
  }

  try {
    const data = await portalFetch<DegreeAuditResponse>(
      `/WebServices/api/CourseRegistration/DegreeAudit?enrollID=${enrollID}&Studentid=${dbId}`,
      { cookies: portalSessionStore.cookies, portalToken: portalSessionStore.portalToken },
    );

    if (data.ErrorMessage) {
      return NextResponse.json({ ok: false, error: data.ErrorMessage });
    }

    const auditRecord = data.DataList?.[0];
    if (!auditRecord) {
      return NextResponse.json({ ok: false, error: 'No audit data returned' });
    }

    const student = mapToScrapedStudent(auditRecord, studentNumber ?? '');

    // Store in scraperStore so legacy polling still works
    scraperStore.result = student;
    scraperStore.status = 'done';

    return NextResponse.json({ ok: true, student });
  } catch (err) {
    if (err instanceof PortalAuthError) {
      clearPersistedSession();
      return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : 'Failed to fetch degree audit';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
