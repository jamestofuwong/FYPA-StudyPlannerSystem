import type { OllamaTool, AgentSessionStore } from './types';

export const AGENT_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_student',
      description: 'Fetch academic data for a student from the scraper session. The advisor must have already scraped this student. Returns student transcript with completed units. Must be called before run_major_detection.',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'string', description: 'The student ID, e.g. "12345678"' },
        },
        required: ['studentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_major_detection',
      description: 'Run the major detection algorithm on a student. Returns detected major, match percentage, missing units, and at-risk level. Must call fetch_student first.',
      parameters: {
        type: 'object',
        properties: {
          student: { type: 'object', description: 'The student object returned from fetch_student' },
        },
        required: ['student'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_planners',
      description: 'Get a list of all available study planner templates. Use when asked about available programmes, majors, or planners.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_student_report',
      description: 'Queue an Excel report download for the currently analysed student. Only call after run_major_detection has been run.',
      parameters: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            description: 'Sections to include. Options: student_profile, major_match, unit_plan, study_planner',
            items: { type: 'string' },
          },
        },
        required: ['sections'],
      },
    },
  },
];

export interface ToolExecutorContext {
  baseUrl: string;
  store: AgentSessionStore;
}

export type ToolExecutor = (args: Record<string, unknown>, ctx: ToolExecutorContext) => Promise<unknown>;

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  async fetch_student(args, ctx) {
    const studentId = String(args.studentId ?? '');

    // Check if this student is already the last scrape result
    try {
      const statusRes = await fetch(`${ctx.baseUrl}/api/scraper/status`);
      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data?.result?.studentId === studentId) {
          ctx.store.lastStudent = data.result;
          ctx.store.loadedStudentId = data.result.studentId;
          return data.result;
        }
      }
    } catch { /* fall through to scrape */ }

    // Trigger a fresh scrape
    const startRes = await fetch(`${ctx.baseUrl}/api/scraper/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, enrollmentMode: 'latest' }),
    }).catch(() => null);

    if (!startRes?.ok) {
      return { error: 'Failed to start scraper. Ensure you are logged into the student portal via the Scraping page.' };
    }

    // Poll until done (max 2 minutes)
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 1_500));
      const res = await fetch(`${ctx.baseUrl}/api/scraper/status`).catch(() => null);
      if (!res?.ok) continue;
      const data = await res.json();
      if (data.status === 'done' && data.result) {
        ctx.store.lastStudent = data.result;
        ctx.store.loadedStudentId = data.result.studentId;
        return data.result;
      }
      if (data.status === 'error') {
        return { error: data.error ?? 'Scrape failed. The portal may be unavailable or the student ID was not found.' };
      }
    }
    return { error: 'Scrape timed out after 2 minutes.' };
  },

  async run_major_detection(args, ctx) {
    const student = args.student;
    if (!student) return { error: 'No student data provided. Call fetch_student first.' };
    try {
      const res = await fetch(`${ctx.baseUrl}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student }),
      });
      const result = await res.json();
      ctx.store.lastMatchResult = result;
      ctx.store.lastStudent = student;
      // Return condensed result to save context window space
      return summariseMatchResult(result);
    } catch (e: any) {
      return { error: `Match pipeline failed: ${e.message}` };
    }
  },

  async get_all_planners(_args, ctx) {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/planners`);
      const planners = await res.json();
      return (Array.isArray(planners) ? planners : []).map((p: any) => ({
        id: p.id,
        course: p.course?.name ?? p.course_id,
        major: p.major?.name ?? 'N/A',
        intakeYear: p.intake_year,
        intakeMonth: p.intake_month,
      }));
    } catch (e: any) {
      return { error: e.message };
    }
  },

  async export_student_report(args, ctx) {
    if (!ctx.store.lastStudent || !ctx.store.lastMatchResult) {
      return { error: 'No student data in session. Run fetch_student and run_major_detection first.' };
    }
    // Signal to the frontend to trigger export
    ctx.store.pendingExport = {
      sections: args.sections ?? ['student_profile', 'major_match'],
      student: ctx.store.lastStudent,
      matchResult: ctx.store.lastMatchResult,
    };
    return { success: true, message: 'Export queued. The report will download shortly.' };
  },
};

function summariseMatchResult(result: any): object {
  const d = result?.data;
  return {
    detectedMajor: d?.primaryMajor?.majorName ?? 'Not detected',
    matchPercentage: d?.primaryMajor?.matchPct ?? 0,
    secondMajor: d?.secondMajor?.majorName ?? null,
    missingCoreUnits: d?.unmatchedCore ?? [],
    graduationEligible: result?.graduationCheck?.isEligible ?? false,
    atRiskLevel: d?.riskReport?.level ?? 'unknown',
    detectionStatus: d?.status,
  };
}
