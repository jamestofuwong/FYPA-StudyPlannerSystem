# Study Planner System — Implementation Plan

> This document is the technical implementation guide for the five selected expansion features. It is intended to be read alongside `PROJECT_REFERENCE.md`. All file paths are relative to the repo root. Every design decision references existing patterns in the codebase to maintain consistency.

---

## Selected Features

| # | Feature | Scope |
|---|---------|-------|
| F1 | [AI Agent Interface](#f1-ai-agent-interface) | Local app |
| F2 | [Cohort-Level Processing](#f2-cohort-level-processing) | Local app (session-only, no persistence) |
| F4 | [At-Risk Detection](#f4-at-risk-detection) | Local app (per-student, post-match) |
| F7 | [Planner Template Diff](#f7-planner-template-diff) | Cloud app (primary), Local app (sync awareness) |
| F8 | [Graduation Audit PDF](#f8-graduation-audit-pdf) | Local app |

---

## F1: AI Agent Interface

### Problem Being Solved

The current app has a fixed multi-step workflow (navigate → scrape → match → interpret → export). An advisor who knows what they want — "tell me if Ahmad is at risk of not graduating" — still has to manually drive every step of that workflow. The agent removes the workflow entirely and lets the advisor talk to the system.

### Architecture Overview

The agent is a **server-side ReAct loop** that lives in a new API route. It receives a user message, decides which tools to call, calls them (by invoking existing internal API routes), feeds results back to the model, and repeats until the model produces a final answer. The UI is a chat panel appended to the existing shell layout.

```
User message
     │
     ▼
POST /api/agent
  │
  ├── Build conversation history + system prompt
  ├── POST http://localhost:11434/api/chat  (Ollama, tools defined)
  │
  │   ← model returns tool_calls
  │
  ├── Execute each tool_call → internal fetch to /api/*
  ├── Append tool results to conversation as role:"tool"
  └── Loop back → POST Ollama again
      │
      ← model returns content (no more tool_calls)
      │
  Return final content to client
```

### Model Selection

**Recommended model: `llama3.2:3b`** (Q4_K_M quantization, ~2.0 GB RAM)

Rationale:
- Native tool/function calling support (Llama 3.1+ architecture)
- Fits in ~2 GB of the 8 GB available, leaving room for Electron (~200 MB), Next.js (~300 MB), PostgreSQL (~100 MB), and OS overhead
- ~10 tokens/sec on CPU — acceptable for an agentic use case where the user expects the agent to "think"

**Fallback model: `phi4-mini`** (~2.3 GB RAM, slightly faster on CPU, strong instruction following)

The model to use should be stored in `system_config` under key `agent_model`, defaulting to `llama3.2:3b`. This lets it be changed via the Settings page without a code change.

### System Prompt Engineering

Small models on CPU fail at tool calling when the system prompt is ambiguous. The system prompt must be:
1. Explicit about what tools exist and exactly when to use them
2. Include a one-shot example of the correct tool-calling sequence
3. Strict about not fabricating any student data
4. Short — keep it under ~500 tokens so it doesn't crowd the context

**System prompt template** (`core/services/agent/systemPrompt.ts`):

```typescript
export function buildSystemPrompt(context: AgentContext): string {
  return `You are an academic advisor assistant for Swinburne University Sarawak.
You help academic advisors check student academic progression and detect student majors.

CRITICAL RULES:
- NEVER fabricate or guess student data, grades, unit codes, or match percentages.
- ALWAYS use the fetch_student tool before run_major_detection.
- ALWAYS run run_major_detection after fetching a student before answering questions about their major or progress.
- If you cannot complete a task with the available tools, say so clearly.
- Keep final answers concise and factual.

AVAILABLE CONTEXT:
- Today's date: ${context.currentDate}
- Currently loaded student: ${context.loadedStudentId ?? 'none'}

EXAMPLE INTERACTION:
User: "Is student 12345678 on track?"
→ Call fetch_student({"studentId": "12345678"})
→ Call run_major_detection({"student": <result from fetch_student>})
→ Answer: "Student 12345678 is [name], detected as [Major] with [X]% match.
   They are missing [N] core units: [list]. [Risk level if available]."`;
}

export interface AgentContext {
  currentDate: string;
  loadedStudentId?: string;
}
```

### Tool Definitions

**File:** `core/services/agent/agentTools.ts`

Each tool maps to an existing internal API route. The tool definition is the JSON Schema passed to Ollama; the executor is the actual function that calls the route.

```typescript
import type { Tool } from './types';

export const AGENT_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_student',
      description: 'Fetch academic data for a student from the university portal. Must be called before run_major_detection. Returns the student transcript including all completed units.',
      parameters: {
        type: 'object',
        properties: {
          studentId: {
            type: 'string',
            description: 'The student ID number, e.g. "12345678"',
          },
        },
        required: ['studentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_major_detection',
      description: 'Run the major detection algorithm on a student object returned by fetch_student. Returns detected major, match percentage, missing units, at-risk level, and graduation eligibility.',
      parameters: {
        type: 'object',
        properties: {
          student: {
            type: 'object',
            description: 'The ScrapedStudent object returned from fetch_student',
          },
        },
        required: ['student'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_planners',
      description: 'Get a list of all study planner templates in the system, including course name, major name, and intake year. Use this when the user asks about available planners or programmes.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_student_report',
      description: 'Generate and download an Excel report for the currently analysed student. Only call this after run_major_detection has been called for that student.',
      parameters: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['student_profile', 'major_match', 'unit_plan', 'study_planner'] },
            description: 'Which sections to include in the export',
          },
        },
        required: ['sections'],
      },
    },
  },
];
```

### Tool Executor

**File:** `core/services/agent/agentTools.ts` (continued)

The executor maps tool names to internal API calls. These are plain `fetch()` calls to `/api/*` from within the Next.js server process (same-process calls — no network hop).

```typescript
export type ToolExecutor = (args: Record<string, unknown>, context: ToolExecutorContext) => Promise<unknown>;

export interface ToolExecutorContext {
  baseUrl: string;                       // http://localhost:<port>
  agentSessionStore: AgentSessionStore;  // holds last scraped student + match result
}

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  async fetch_student({ studentId }, ctx) {
    // Uses the mock endpoint in dev; in production calls the scraper store
    // The scraper still runs in the webview — this tool uses the existing
    // scraper session store to retrieve the most recently scraped student,
    // or falls back to the mock endpoint for testing.
    const res = await fetch(`${ctx.baseUrl}/api/scraper/status`);
    const { student } = await res.json();
    if (student?.studentId === studentId) return student;
    // If not already scraped, return instruction to scraper
    return { error: 'Student not yet scraped. The advisor must scrape this student via the Scraping page first, or the agent can use the mock endpoint in dev mode.' };
  },

  async run_major_detection({ student }, ctx) {
    const res = await fetch(`${ctx.baseUrl}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student }),
    });
    const result = await res.json();
    ctx.agentSessionStore.lastMatchResult = result;
    // Return a condensed summary to avoid bloating the context window
    return summariseMatchResult(result);
  },

  async get_all_planners(_args, ctx) {
    const res = await fetch(`${ctx.baseUrl}/api/planners`);
    const planners = await res.json();
    // Return only metadata, not all units (too large for context)
    return planners.map((p: any) => ({
      id: p.id,
      course: p.course?.name,
      major: p.major?.name,
      intakeYear: p.intake_year,
      intakeMonth: p.intake_month,
    }));
  },

  async export_student_report({ sections }, ctx) {
    const { lastStudent, lastMatchResult } = ctx.agentSessionStore;
    if (!lastStudent || !lastMatchResult) {
      return { error: 'No student data available. Run major detection first.' };
    }
    // Trigger download on the client side via a flag in the session store
    ctx.agentSessionStore.pendingExport = { sections, student: lastStudent, matchResult: lastMatchResult };
    return { success: true, message: 'Export queued. The report will download shortly.' };
  },
};

// Returns a token-efficient summary of match results for the LLM context
function summariseMatchResult(result: any): object {
  const d = result.data;
  return {
    detectedMajor: d?.primaryMajor?.majorName ?? 'Not detected',
    matchPercentage: d?.primaryMajor?.matchPct ?? 0,
    secondMajor: d?.secondMajor?.majorName ?? null,
    missingCoreUnits: d?.unmatchedCore ?? [],
    graduationEligible: result.graduationCheck?.isEligible ?? false,
    atRiskLevel: d?.riskReport?.level ?? 'unknown',
    status: d?.status,
  };
}
```

### The ReAct Loop

**File:** `core/services/agent/agentService.ts`

```typescript
import { AGENT_TOOLS, TOOL_EXECUTORS } from './agentTools';
import { buildSystemPrompt } from './systemPrompt';
import type { AgentMessage, AgentSessionStore } from './types';

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const MAX_ITERATIONS = 6; // Safety cap — prevent infinite loops

export async function runAgentTurn(
  userMessage: string,
  history: AgentMessage[],
  context: { baseUrl: string; agentSessionStore: AgentSessionStore; modelName: string; loadedStudentId?: string },
): Promise<{ reply: string; updatedHistory: AgentMessage[] }> {
  const messages: AgentMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({ currentDate: new Date().toDateString(), loadedStudentId: context.loadedStudentId }),
    },
    ...history,
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: context.modelName,
        messages,
        tools: AGENT_TOOLS,
        stream: false,
        options: { temperature: 0.1 }, // Low temperature for deterministic tool calls
      }),
    });

    const data = await response.json();
    const assistantMessage = data.message;
    messages.push(assistantMessage);

    // No tool calls → model is done
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        reply: assistantMessage.content,
        updatedHistory: messages.slice(1), // Drop system prompt from stored history
      };
    }

    // Execute each tool call and collect results
    for (const toolCall of assistantMessage.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      const executor = TOOL_EXECUTORS[name];

      let toolResult: unknown;
      if (!executor) {
        toolResult = { error: `Unknown tool: ${name}` };
      } else {
        try {
          toolResult = await executor(args, { baseUrl: context.baseUrl, agentSessionStore: context.agentSessionStore });
        } catch (e: any) {
          toolResult = { error: e.message };
        }
      }

      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Exceeded iteration cap
  return {
    reply: 'I was unable to complete this task within the allowed number of steps. Please try rephrasing your request.',
    updatedHistory: messages.slice(1),
  };
}
```

### Context Window Management

Small models + long histories = degraded quality and slow CPU inference. Apply these constraints:

1. **History truncation**: Keep only the last 6 turns (3 user + 3 assistant) in history. Older turns are dropped.
2. **Condensed tool results**: Tool executors return summaries, not raw objects. A full `DisplayPayload` can be 5KB; the summarised version is ~200 bytes.
3. **System prompt token budget**: Keep system prompt under 500 tokens.
4. **Context reset**: On new student query (different student ID), clear history entirely.

**File:** `web/app/api/agent/store.ts` — per-session in-memory store (same pattern as scraper store)

```typescript
interface AgentSessionStore {
  history: AgentMessage[];
  lastStudent: ScrapedStudent | null;
  lastMatchResult: any | null;
  pendingExport: any | null;
}

const MAX_HISTORY_TURNS = 6;

export function trimHistory(history: AgentMessage[]): AgentMessage[] {
  // Keep only the last MAX_HISTORY_TURNS non-system messages
  return history.slice(-MAX_HISTORY_TURNS);
}
```

### API Route

**File:** `web/app/api/agent/route.ts`

```typescript
export async function POST(req: Request) {
  const { message, history } = await req.json();
  const modelName = (await getSystemConfig('agent_model')) ?? 'llama3.2:3b';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  const { reply, updatedHistory } = await runAgentTurn(message, history ?? [], {
    baseUrl,
    agentSessionStore: agentStore,
    modelName,
  });

  return Response.json({ reply, history: updatedHistory });
}
```

### UI: Chat Panel

**File:** `web/components/AgentChat.tsx`

- Rendered as a right-side drawer (`position: fixed, right: 0`) within the existing shell layout
- Toggle button in the `TopBar`
- Displays conversation as chat bubbles
- Shows "thinking..." with a spinner while awaiting a response
- Shows tool execution steps as small status chips between messages (e.g., "Ran fetch_student → done", "Ran run_major_detection → done") — extracted from the returned history
- Input field at bottom, sends on Enter

State management: React `useState` for `messages` and `isLoading`. History is stored client-side in component state (cleared on browser refresh — intentional, since student data must not persist).

### New Files Summary (F1)

| File | Purpose |
|------|---------|
| `core/services/agent/agentService.ts` | ReAct loop orchestrator |
| `core/services/agent/agentTools.ts` | Tool definitions + executors |
| `core/services/agent/systemPrompt.ts` | System prompt builder |
| `core/services/agent/types.ts` | AgentMessage, AgentSessionStore types |
| `web/app/api/agent/route.ts` | POST endpoint |
| `web/app/api/agent/store.ts` | Server-side session store |
| `web/components/AgentChat.tsx` | Chat panel UI |
| `web/components/layout/TopBar.tsx` | Add agent toggle button (modify) |

### Settings Page Additions (F1)

Add to `web/app/(pages)/settings/page.tsx`:
- **Agent Model** selector: reads/writes `agent_model` in `system_config`
- **Ollama Status** indicator: green/red based on `GET /api/ollama/status`
- **Model download** button that calls `POST /api/ollama/pull`

---

## F2: Cohort-Level Processing

### Constraint

No student data may be stored persistently. All cohort processing results exist only in the server-side session memory for the duration of the app session. They are discarded when the Next.js server restarts (i.e., when the app closes).

### Input Modes

Two input modes are supported, because the portal scraper (which uses a webview in the renderer) cannot be easily batched server-side:

**Mode A — Bulk Excel Upload (Primary)**
The advisor exports a class list or cohort transcript from the university system as an Excel file, then uploads it. The system parses all students from the file and runs the matching pipeline for each.

Bulk Excel format (to be defined):
```
Row 1:  STUDENT_ID | STUDENT_NAME | INTAKE_YEAR | INTAKE_MONTH | [unit rows begin below]
Row 2:  12345678   | Ahmad Bin Abdullah | 2022 | 3
Row 3:  [Course] | [Course Title] | [Credits] | [Earned] | [Status] | [Grade] | [Term]
Row 4:  CSC1024 | Programming 1 | 4 | 4 | Complete | A | 2022/2023 Sem 1
...
Row N:  STUDENT_ID | [next student begins]
...
```

This format places a student header row before each student's unit rows. The parser detects student boundaries by checking if the first column is a numeric string (student ID) or the literal `STUDENT_ID`.

Alternatively, if the university exports a flat format (all students in one sheet with a student ID column on every row), the parser groups rows by the student ID column. Both formats should be handled.

**Mode B — Sequential Portal Scraping**
The advisor provides a list of student IDs (one per line, in a textarea or a CSV file). The system iterates the list, showing a progress bar. For each student, it triggers the scraper in the renderer context via the existing ScraperContext mechanism.

This mode is slower (each student requires a full portal scrape cycle) and is most useful for small batches (< 20 students). The advisor must already be logged into the portal.

### Session Design

**File:** `web/app/api/cohort/store.ts`

```typescript
export interface CohortSession {
  id: string;
  createdAt: Date;
  mode: 'excel' | 'sequential';
  totalCount: number;
  processedCount: number;
  results: CohortStudentResult[];
  status: 'idle' | 'processing' | 'complete' | 'error';
}

export interface CohortStudentResult {
  studentId: string;
  studentName?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  matchResult?: {
    detectedMajor: string | null;
    matchPct: number;
    atRiskLevel: string;
    graduationEligible: boolean;
    missingCoreCount: number;
  };
  error?: string;
}

// Single active session per server instance (one advisor at a time)
let activeSession: CohortSession | null = null;

export function getActiveSession() { return activeSession; }
export function setActiveSession(s: CohortSession | null) { activeSession = s; }
```

### API Routes (F2)

**`POST /api/cohort/upload`** — Mode A entry point
- Accepts `multipart/form-data` with `file` (Excel)
- Parses all students from the file using the existing xlsx-js-style library
- Creates a `CohortSession` in memory
- For each parsed student, runs `runMatchingPipeline()` immediately (no scraping needed — data is in the file)
- Returns `{ sessionId, totalCount }`

**`POST /api/cohort/start`** — Mode B entry point
- Accepts `{ studentIds: string[] }`
- Creates a `CohortSession` with `mode: 'sequential'`
- Returns `{ sessionId }` — actual processing is driven from the frontend

**`POST /api/cohort/result`** — Mode B per-student result submission
- Frontend calls this after each student's scrape + match completes
- Accepts `{ sessionId, studentId, student: ScrapedStudent, matchResult }`
- Updates the corresponding `CohortStudentResult` in the session

**`GET /api/cohort/status`** — Poll session status
- Returns full `CohortSession` including all results so far
- Frontend polls this every 2 seconds during Mode A processing
- Mode B updates arrive via individual `POST /api/cohort/result` calls, so the frontend can also poll or use the result directly

**`POST /api/cohort/export`** — Generate Excel report for the entire cohort
- Accepts `{ sessionId }`
- Generates a cohort-level Excel workbook:
  - Sheet 1: Summary table (one row per student: ID, name, major, match %, at-risk, graduation eligible)
  - Sheet 2+: Individual student detail sheets (optional, based on advisor selection)
- Returns XLSX binary as attachment

### Cohort Excel Parser

**File:** `core/services/cohort/cohortExcelParser.ts`

```typescript
import * as XLSX from 'xlsx-js-style';

export interface ParsedCohortStudent {
  studentId: string;
  studentName: string;
  intakeYear: number;
  intakeMonth: number;
  courseList: ParsedCourseItem[];
}

export function parseCohortExcel(buffer: Buffer): ParsedCohortStudent[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  const students: ParsedCohortStudent[] = [];
  let current: ParsedCohortStudent | null = null;

  for (const row of rows) {
    if (isStudentHeaderRow(row)) {
      if (current) students.push(current);
      current = {
        studentId: String(row[0]).trim(),
        studentName: String(row[1] ?? '').trim(),
        intakeYear: Number(row[2]) || new Date().getFullYear(),
        intakeMonth: Number(row[3]) || 1,
        courseList: [],
      };
    } else if (current && isUnitRow(row)) {
      current.courseList.push({
        courseId: String(row[0]).trim(),
        courseTitle: String(row[1] ?? '').trim(),
        credits: Number(row[2]) || 0,
        creditsEarned: Number(row[3]) || 0,
        status: String(row[4] ?? '').trim(),
        grade: String(row[5] ?? '').trim(),
        term: String(row[6] ?? '').trim(),
      });
    }
  }
  if (current) students.push(current);
  return students;
}

function isStudentHeaderRow(row: any[]): boolean {
  // A student header row has a numeric string in column 0
  return row.length >= 2 && /^\d{7,10}$/.test(String(row[0] ?? '').trim());
}

function isUnitRow(row: any[]): boolean {
  // A unit row has a unit code pattern in column 0
  return row.length >= 5 && /^[A-Z]{2,4}\d{4}/.test(String(row[0] ?? '').trim());
}
```

### Cohort Dashboard UI

**File:** `web/app/(pages)/cohort/page.tsx` — new page added to the sidebar

Features:
- **Tab 1 — Import**: File upload zone (drag-and-drop) for Mode A Excel, or textarea for Mode B student IDs
- **Tab 2 — Results**: Table with columns: Student ID | Name | Detected Major | Match % | At-Risk | Graduation Eligible | Action (view full result)
  - Sortable by any column
  - Filter by at-risk level
  - Color-coded rows: red = critical, orange = high, yellow = medium, green = low
  - Row click → opens full single-student dashboard view (in-memory, not navigating away)
- **Export button**: Calls `POST /api/cohort/export`
- **Progress bar**: Visible during processing (Mode A with large files, Mode B always)

### New Files Summary (F2)

| File | Purpose |
|------|---------|
| `core/services/cohort/cohortExcelParser.ts` | Parse multi-student Excel file |
| `core/services/cohort/cohortService.ts` | Orchestrate batch matching |
| `web/app/api/cohort/upload/route.ts` | Mode A — bulk Excel processing |
| `web/app/api/cohort/start/route.ts` | Mode B — sequential scraping init |
| `web/app/api/cohort/result/route.ts` | Mode B — per-student result submission |
| `web/app/api/cohort/status/route.ts` | Poll session status |
| `web/app/api/cohort/export/route.ts` | Generate cohort Excel |
| `web/app/api/cohort/store.ts` | In-memory session store |
| `web/app/(pages)/cohort/page.tsx` | Cohort dashboard UI |
| `web/components/layout/Sidebar.tsx` | Add cohort nav entry (modify) |

### Export: Cohort Excel Workbook Schema

Sheet 1 — **Summary**:

| Student ID | Name | Course | Detected Major | Match % | Core % | Major Core % | At-Risk | Grad Eligible | Missing Core Count |
|---|---|---|---|---|---|---|---|---|---|

Sheet 2 — **Detail** (one sheet per student, optional, advisor can toggle):
Same format as the existing single-student Excel export.

---

## F4: At-Risk Detection

### Scope

Runs automatically after every call to `POST /api/match`. The result is appended to the match response and displayed in a new section on the dashboard. No separate user action required.

### Risk Factors

Six independent risk factors are evaluated. Each produces a severity level and a human-readable description.

#### Factor 1: Credit Trajectory

**Goal:** Determine if the student can accumulate the remaining credits before their expected graduation date.

```
credits_per_semester = creditsCompleted / semesters_elapsed
semesters_elapsed = derived from enrollmentDate and current date
credits_remaining = creditsRequired - creditsCompleted
semesters_needed = ceil(credits_remaining / credits_per_semester)
semesters_available = derived from graduationDate and current date (or programme duration)
deficit = semesters_needed - semesters_available
```

| deficit | Severity |
|---------|----------|
| > 2 | critical |
| 1–2 | high |
| 0–1 | medium |
| < 0 | low |

Edge cases: if `credits_per_semester` is 0 (student has no completed credits), flag as critical.

#### Factor 2: Failed or Withdrawn Required Units

**Goal:** Identify units in the required core/major core that the student has failed.

Cross-reference `ScrapedStudent.courseList` (filter by `grade === 'F'` or `status === 'Withdrawn'`) against the detected planner's `requiredCore` and `requiredMajorCore` lists.

```
failed_required = courseList
  .filter(u => u.grade === 'F' || u.status.includes('Withdrawn'))
  .filter(u => requiredCore.includes(u.courseId) || requiredMajorCore.has(u.courseId))
```

| Count of failed required units | Severity |
|--------------------------------|----------|
| ≥ 1 in major_core | critical |
| ≥ 1 in core | high |
| ≥ 1 in prescribed | medium |

#### Factor 3: Year-Level Core Gap

**Goal:** Flag students who are in a later year of study but are missing units that should have been completed in earlier years.

Derive the student's current year: `floor((semesters_elapsed / 2) + 1)`, clamped to 1–4.

For each missing core or major core unit in the detected planner's `TemplateUnit` list, check its `year_level`. If `unit.year_level < student_current_year`, the student is behind on a unit they should already have.

| Missing units from earlier years | Severity |
|----------------------------------|----------|
| Any Year 1 unit missing in Year 3+ | critical |
| Any Year 2 unit missing in Year 3+ | high |
| Any Year 2 unit missing in Year 2 | medium |

#### Factor 4: Major Core Completion Rate vs. Study Year

**Goal:** Flag students in later study years with low major core completion.

Using `majorCoreScore` from the match result (0–1 scale).

| Condition | Severity |
|-----------|----------|
| Year 4, majorCoreScore < 0.5 | critical |
| Year 4, majorCoreScore < 0.7 | high |
| Year 3, majorCoreScore < 0.4 | high |
| Year 3, majorCoreScore < 0.6 | medium |

#### Factor 5: CGPA

| CGPA | Severity |
|------|----------|
| < 2.0 | critical (probation threshold for Malaysian HEIs) |
| 2.0–2.5 | high |
| 2.5–3.0 | medium |
| ≥ 3.0 | low |

#### Factor 6: No Major Detected (Late Stage)

If the matching algorithm returns `status: 'noMajorDetected'` and the student is in Year 3 or later, this is itself a strong risk signal — the student's units don't clearly align with any major.

| Condition | Severity |
|-----------|----------|
| noMajorDetected + Year 3/4 | critical |
| noMajorDetected + Year 2 | high |
| noMajorDetected + Year 1 | medium |

### Risk Level Aggregation

The overall `AtRiskReport.level` is the highest severity across all factors.

### Output Types

**File:** `core/shared/types/risk.ts`

```typescript
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface RiskFactor {
  id: string;                   // e.g., "credit_trajectory", "failed_units"
  severity: RiskSeverity;
  title: string;                // Short label, e.g., "Credit Deficit"
  description: string;          // Human-readable explanation
  affectedUnits?: string[];     // Unit codes involved, if applicable
  data?: Record<string, unknown>; // Extra numeric data for the UI (e.g., deficit count)
}

export interface AtRiskReport {
  level: RiskSeverity;
  studentYear: number;           // Derived current year of study
  factors: RiskFactor[];
  recommendedActions: string[];  // Plain-English advisor action items
  estimatedGraduationDeficit?: number; // Semesters behind, if > 0
}
```

### Service Implementation

**File:** `core/services/riskAssessment/riskAssessmentService.ts`

```typescript
export function assessRisk(
  student: ScrapedStudent,
  matchResult: DisplayPayload,
  plannerTemplate: PlannerTemplate | null,
): AtRiskReport {
  const studentYear = deriveStudentYear(student.enrollmentDate);
  const factors: RiskFactor[] = [];

  factors.push(...assessCreditTrajectory(student));
  factors.push(...assessFailedUnits(student, matchResult));
  factors.push(...assessYearLevelGap(matchResult, plannerTemplate, studentYear));
  factors.push(...assessMajorCoreRate(matchResult, studentYear));
  factors.push(...assessCGPA(student));
  factors.push(...assessNoMajorLate(matchResult, studentYear));

  const overallLevel = aggregateSeverity(factors);

  return {
    level: overallLevel,
    studentYear,
    factors,
    recommendedActions: buildRecommendations(factors, overallLevel),
    estimatedGraduationDeficit: getDeficit(factors),
  };
}

function deriveStudentYear(enrollmentDate: string): number {
  const enrolled = new Date(enrollmentDate);
  const now = new Date();
  const monthsElapsed = (now.getFullYear() - enrolled.getFullYear()) * 12 + (now.getMonth() - enrolled.getMonth());
  return Math.min(4, Math.max(1, Math.ceil(monthsElapsed / 12)));
}

function aggregateSeverity(factors: RiskFactor[]): RiskSeverity {
  const order: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];
  return factors.reduce((max, f) =>
    order.indexOf(f.severity) > order.indexOf(max) ? f.severity : max,
    'low' as RiskSeverity
  );
}
```

### Integration into Match API Route

In `web/app/api/match/route.ts`, after calling `runMatchingPipeline()`:

```typescript
// Fetch the detected planner template for risk assessment
const detectedPlannerId = result.payload?.primaryMajor?.plannerId;
const plannerTemplate = detectedPlannerId
  ? formattedPlanners.find(p => p.plannerID === detectedPlannerId) ?? null
  : null;

const riskReport = assessRisk(student, result.payload, plannerTemplate);

return NextResponse.json({
  success: true,
  data: { ...result.payload, riskReport },
  graduationCheck,
  processingTime: result.durationMs,
});
```

### Dashboard UI Addition

Add a new collapsible "At-Risk Assessment" card below the major detection results in `web/app/(pages)/dashboard/page.tsx`.

Visual design:
- Card header background color reflects severity: red (critical), orange (high), yellow (medium), green (low)
- Risk level badge prominently displayed
- Expandable list of risk factors, each with severity icon and description
- Affected unit codes shown as inline code chips
- Recommended actions as a numbered list

### New Files Summary (F4)

| File | Purpose |
|------|---------|
| `core/services/riskAssessment/riskAssessmentService.ts` | All risk factor computations |
| `core/shared/types/risk.ts` | AtRiskReport, RiskFactor types |
| `web/app/api/match/route.ts` | Add assessRisk() call (modify) |
| `web/app/(pages)/dashboard/page.tsx` | Add risk assessment card (modify) |

---

## F7: Planner Template Diff

### Scope

**Cloud app:** Compute and store a diff every time a new planner is saved that supersedes an older one (same course + major, different intake year).

**Local app:** When syncing a planner via cloud-sync that would overwrite or sit alongside an existing local planner for the same course + major, show a diff so the advisor understands what changed.

### Diff Data Model

The diff service operates on `PlannerImportPlanner` objects (the format that moves between the cloud and local app). This is the common type already used by `savePlannerFromImport()`.

**File:** `core/shared/types/plannerDiff.ts`

```typescript
export interface PlannerDiff {
  oldIntakeYear: number;
  oldIntakeMonth: number | null;
  newIntakeYear: number;
  newIntakeMonth: number | null;

  unitsAdded: DiffUnit[];           // In new, not in old
  unitsRemoved: DiffUnit[];         // In old, not in new
  unitsMoved: MovedUnit[];          // Same code, different year/semester
  unitsRecategorised: RecatUnit[];  // Same code, different category
  unitsUnchanged: number;           // Count only (not listed)

  electiveGroupsAdded: number;
  electiveGroupsRemoved: number;
  electivePoolChanges: ElectivePoolChange[];

  creditSummaryChanges: CreditChange[];

  totalChanges: number;
  hasBreakingChanges: boolean; // True if any core or major_core units changed
  summary: string;             // Human-readable one-liner
}

export interface DiffUnit {
  unitCode: string;
  unitName: string;
  category: string;
  yearLevel: number;
  semester: number;
}

export interface MovedUnit {
  unitCode: string;
  unitName: string;
  category: string;
  oldYear: number; oldSemester: number;
  newYear: number; newSemester: number;
}

export interface RecatUnit {
  unitCode: string;
  unitName: string;
  oldCategory: string;
  newCategory: string;
  yearLevel: number;
  semester: number;
}

export interface ElectivePoolChange {
  groupIndex: number;
  unitsAdded: string[];
  unitsRemoved: string[];
}

export interface CreditChange {
  field: string; // e.g., 'core_cp', 'major_cp'
  oldValue: number;
  newValue: number;
}
```

### Diff Algorithm

**File:** `core/services/plannerDiff/plannerDiffService.ts`

The algorithm treats a planner as a map of `unit_code → { category, year_level, semester }`. This is a pure structural diff — no semantic interpretation.

```typescript
import type { PlannerImportPlanner } from '../../shared/types/plannerImport';
import type { PlannerDiff, DiffUnit, MovedUnit, RecatUnit } from '../../shared/types/plannerDiff';

export function diffPlanners(
  oldPlanner: PlannerImportPlanner,
  newPlanner: PlannerImportPlanner,
): PlannerDiff {
  // Build flat unit maps: code → { category, year_level, semester, name }
  const oldUnits = buildUnitMap(oldPlanner);
  const newUnits = buildUnitMap(newPlanner);

  const added: DiffUnit[] = [];
  const removed: DiffUnit[] = [];
  const moved: MovedUnit[] = [];
  const recat: RecatUnit[] = [];
  let unchanged = 0;

  // Units in new but not old → added
  for (const [code, nu] of newUnits) {
    if (!oldUnits.has(code)) {
      added.push(toDiffUnit(code, nu));
    } else {
      const ou = oldUnits.get(code)!;
      const posChanged = ou.year_level !== nu.year_level || ou.semester !== nu.semester;
      const catChanged = ou.category !== nu.category;

      if (catChanged) {
        recat.push({ unitCode: code, unitName: nu.name, oldCategory: ou.category, newCategory: nu.category, yearLevel: nu.year_level, semester: nu.semester });
      } else if (posChanged) {
        moved.push({ unitCode: code, unitName: nu.name, category: nu.category, oldYear: ou.year_level, oldSemester: ou.semester, newYear: nu.year_level, newSemester: nu.semester });
      } else {
        unchanged++;
      }
    }
  }

  // Units in old but not new → removed
  for (const [code, ou] of oldUnits) {
    if (!newUnits.has(code)) removed.push(toDiffUnit(code, ou));
  }

  const totalChanges = added.length + removed.length + moved.length + recat.length;
  const breakingCategories = new Set(['core', 'major_core']);
  const hasBreaking = [...added, ...removed].some(u => breakingCategories.has(u.category))
    || recat.some(u => breakingCategories.has(u.oldCategory) || breakingCategories.has(u.newCategory));

  const creditChanges = diffCreditSummary(oldPlanner, newPlanner);
  const electiveChanges = diffElectiveGroups(oldPlanner, newPlanner);

  return {
    oldIntakeYear: oldPlanner.course_information.intake_year,
    oldIntakeMonth: oldPlanner.course_information.intake_month ?? null,
    newIntakeYear: newPlanner.course_information.intake_year,
    newIntakeMonth: newPlanner.course_information.intake_month ?? null,
    unitsAdded: added,
    unitsRemoved: removed,
    unitsMoved: moved,
    unitsRecategorised: recat,
    unitsUnchanged: unchanged,
    electiveGroupsAdded: electiveChanges.added,
    electiveGroupsRemoved: electiveChanges.removed,
    electivePoolChanges: electiveChanges.poolChanges,
    creditSummaryChanges: creditChanges,
    totalChanges,
    hasBreakingChanges: hasBreaking,
    summary: buildSummary(added, removed, moved, recat, hasBreaking),
  };
}

function buildUnitMap(planner: PlannerImportPlanner): Map<string, { category: string; year_level: number; semester: number; name: string }> {
  const map = new Map();
  for (const year of planner.years ?? []) {
    for (const sem of year.semesters ?? []) {
      for (const unit of sem.units ?? []) {
        if (unit.unit_code) {
          map.set(unit.unit_code.toUpperCase(), {
            category: unit.category,
            year_level: year.year_number,
            semester: sem.semester_number,
            name: unit.unit_name ?? '',
          });
        }
      }
    }
  }
  return map;
}

function buildSummary(added: DiffUnit[], removed: DiffUnit[], moved: MovedUnit[], recat: RecatUnit[], breaking: boolean): string {
  const parts = [];
  if (added.length) parts.push(`${added.length} unit${added.length > 1 ? 's' : ''} added`);
  if (removed.length) parts.push(`${removed.length} removed`);
  if (moved.length) parts.push(`${moved.length} moved`);
  if (recat.length) parts.push(`${recat.length} recategorised`);
  if (parts.length === 0) return 'No structural changes';
  return parts.join(', ') + (breaking ? ' — includes core/major changes' : '');
}
```

### Cloud App: Storage

**Schema addition in `core/db/prisma/schema/cloud.prisma`:**

```prisma
model PlannerVersion {
  id            String   @id @default(uuid())
  course_code   String
  major_name    String
  intake_year   Int
  intake_month  Int?
  planner_data  Json     // Full PlannerImportPlanner stored as JSON
  diff_from_prev Json?   // PlannerDiff JSON, null if first version
  created_at    DateTime @default(now())

  @@map("planner_versions")
}
```

**Cloud API changes:**

`POST /api/scraper/run` (or the planner save flow in the cloud) — after saving a newly parsed planner:
1. Query for the most recent previous version for the same (course_code, major_name)
2. If found, call `diffPlanners(oldPlanner, newPlanner)`
3. Store diff in `PlannerVersion.diff_from_prev`

`GET /api/planners/[id]/diff` (new cloud route) — returns the stored `PlannerDiff` for a planner entry.

### Cloud Admin UI: Diff Viewer

**File:** `cloud/app/(admin)/planners/[id]/page.tsx` (modify)

Add a "Changes from Previous Version" section after the planner detail:

```
┌─ Changes from 2023 → 2024 Intake ─────────────────────────────────┐
│  ⚠ Breaking changes detected (core/major_core units affected)      │
│                                                                     │
│  ▲ Added (3)                                                        │
│    CSC4088 – Cybersecurity Capstone   [major_core, Y4 S1]  ✦ new  │
│    ...                                                              │
│                                                                     │
│  ▼ Removed (1)                                                      │
│    CSC4055 – Research Methods         [core, Y4 S2]                │
│                                                                     │
│  ↕ Moved (2)                                                        │
│    CSC3024 – Networks   Y3 S1 → Y3 S2                             │
│    ...                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

Color coding: green (added), red (removed), yellow (moved/recategorised).

### Local App: Sync Awareness

When `POST /api/cloud-sync` pulls a planner, check if a planner for the same course + major (any intake year) already exists locally. If yes:
1. Fetch the diff between the local version and the incoming version using `diffPlanners()`
2. If `diff.totalChanges > 0`, return the diff alongside the sync result instead of silently importing
3. The local UI shows a `PlannerDiffModal` before completing the import

**File:** `web/components/PlannerDiffModal.tsx` — modal dialog showing the diff with Accept/Cancel buttons.

Modify `web/app/api/cloud-sync/route.ts` POST handler:
```typescript
// After fetching the cloud planner but before calling savePlannerFromImport():
const existingLocal = await findExistingPlannerForMajor(planner.course_information.course_code, planner.major_name);
if (existingLocal) {
  const diff = diffPlanners(existingLocal, planner);
  if (diff.totalChanges > 0) {
    // Return diff for user review instead of auto-importing
    results.push({ id, status: 'diff_required', diff });
    continue; // Skip the savePlannerFromImport call
  }
}
await savePlannerFromImport(planner);
results.push({ id, status: 'pulled' });
```

The frontend `cloud-sync/page.tsx` handles the `diff_required` status by showing the diff modal, and provides "Confirm Import" / "Skip" buttons. Confirming sends a second POST with `{ ids: [id], forceSave: true }`.

### New Files Summary (F7)

| File | Purpose |
|------|---------|
| `core/services/plannerDiff/plannerDiffService.ts` | Diff algorithm (shared) |
| `core/shared/types/plannerDiff.ts` | PlannerDiff types |
| `core/db/prisma/schema/cloud.prisma` | Add PlannerVersion model (modify) |
| `cloud/app/api/planners/[id]/diff/route.ts` | GET diff for a cloud planner |
| `cloud/app/(admin)/planners/[id]/page.tsx` | Add diff viewer section (modify) |
| `web/components/PlannerDiffModal.tsx` | Diff review modal for local app |
| `web/app/api/cloud-sync/route.ts` | Add diff-awareness to POST (modify) |
| `web/app/(pages)/cloud-sync/page.tsx` | Handle diff_required status (modify) |

---

## F8: Graduation Audit PDF

### Approach

Use **Electron's `webContents.printToPDF()`** via a hidden `BrowserWindow` that loads a dedicated print-optimized Next.js page. This uses the already-embedded Chromium renderer (no extra dependencies) and produces pixel-perfect A4 output.

Puppeteer is intentionally not used here despite being a dependency — `printToPDF()` is simpler in the Electron context and doesn't require launching a separate browser process.

### Full Flow

```
1. User clicks "Generate Graduation Audit" on Dashboard
2. Frontend:
   a. Sends audit payload to POST /api/graduation-audit/session (stores in memory, returns sessionId)
   b. Calls window.auditAPI.generatePDF({ sessionId })
3. IPC: renderer → main (channel: 'print-graduation-audit', args: { sessionId })
4. Main process:
   a. Creates hidden BrowserWindow (width: 794 = A4 at 96dpi, height: 1123)
   b. Loads http://localhost:<port>/graduation-audit?sessionId=<id>
   c. Waits for 'did-finish-load'
   d. Calls webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 15, bottom: 15, left: 15, right: 15 } })
   e. Receives Buffer
   f. Calls dialog.showSaveDialog({ defaultPath: 'GraduationAudit-<studentId>.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
   g. Writes Buffer to chosen path
   h. Destroys hidden BrowserWindow
   i. Sends IPC reply to renderer with { success: true, filePath }
5. Frontend: shows toast "Audit saved to [path]"
```

### Audit Reference Number

Format: `AUDIT-{YYYYMMDD}-{studentId}-{6-char-alphanumeric}`

Generated at the time of audit creation (step 2a). Stored in the session alongside the report data.

```typescript
function generateAuditRef(studentId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AUDIT-${date}-${studentId}-${random}`;
}
```

### Session Store

**File:** `web/app/api/graduation-audit/store.ts`

Same pattern as the scraper store and cohort store — an in-memory singleton.

```typescript
export interface AuditSession {
  sessionId: string;
  auditRef: string;
  createdAt: Date;
  student: ScrapedStudent;
  matchResult: any; // DisplayPayload
  riskReport: AtRiskReport;
  generatedBy?: string; // Advisor name if provided
}

const auditSessions = new Map<string, AuditSession>();
```

### API Routes (F8)

**`POST /api/graduation-audit/session`** — store audit data, return sessionId + auditRef
**`GET /api/graduation-audit/session?sessionId=<id>`** — retrieve stored audit data (called by the print page)

### The Print Page

**File:** `web/app/(pages)/graduation-audit/page.tsx`

This page is only ever loaded in the hidden BrowserWindow. It uses `@media print` CSS to hide all app chrome and render only the report. The page fetches its data from the session store using the `sessionId` URL param.

**Report Layout** (A4 portrait, ~15mm margins):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SWINBURNE UNIVERSITY OF TECHNOLOGY SARAWAK
         Student Academic Progression Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  AUDIT REFERENCE    AUDIT-20260627-12345678-A3F9K2
  DATE GENERATED     27 June 2026, 14:32

━━ STUDENT INFORMATION ━━━━━━━━━━━━━━━━━━━━━━━━
  Student ID        12345678
  Name              Ahmad Bin Abdullah
  Programme         Bachelor of Computer Science
  Major             Artificial Intelligence
  Intake            March 2022 (Year 2022, Semester 1)
  Enrolment Date    21 February 2022
  Expected Grad     June 2025

━━ CREDIT SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Category               Required   Earned   Status
  Core Units               15         14      ●
  Major Core Units         12         12      ✓
  Prescribed Electives      8          6      ●
  Free Electives            4          4      ✓
  WIL                       1          1      ✓
  MPU                       5          5      ✓
  ─────────────────────────────────────────────
  TOTAL                    45         42

  Overall Match            82.4%
  Graduation Eligibility   NOT YET ELIGIBLE

━━ DETECTION RESULT ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Primary Major     Artificial Intelligence (82.4%)
  Second Major      —
  Status            Algorithm Detected
  Planner Version   2022 March Intake

━━ MISSING REQUIREMENTS ━━━━━━━━━━━━━━━━━━━━━━━
  Core Units (1 missing)
    • CSC3024 — Network Technology

  Prescribed Electives (2 missing)
    • Group A: 2 slots remaining
      Eligible units: CSC4011, CSC4023, CSC4031

━━ AT-RISK ASSESSMENT ━━━━━━━━━━━━━━━━━━━━━━━━━
  Overall Level     MEDIUM
  • Missing Year 3 core unit (CSC3024) — should complete by current semester
  • 2 prescribed elective slots unfilled

━━ ADVISOR NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [blank area for handwritten notes]



━━ SIGN-OFF ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Academic Advisor
  Name: _______________________  Date: __________
  Signature: __________________

  Head of Department (if required)
  Name: _______________________  Date: __________
  Signature: __________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  This document was generated by the Study Planner System.
  Ref: AUDIT-20260627-12345678-A3F9K2
  For internal use only. Contains academic data — handle per university privacy policy.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

CSS rules for print:
```css
@media print {
  /* Hide all shell layout components */
  nav, [data-sidebar], [data-topbar], [data-statusbar], [data-tabbar] { display: none; }
  body { margin: 0; font-family: 'Times New Roman', serif; font-size: 11pt; }
  .page-break { page-break-before: always; }
}
```

The page should also be visually presentable in the browser (for a non-print preview), but the print CSS takes over when `printToPDF()` is called.

### IPC Integration

**In `electron/main.ts`** — add new IPC handler:

```typescript
ipcMain.handle('print-graduation-audit', async (_event, { sessionId }) => {
  const printWin = new BrowserWindow({
    width: 794,  // A4 at 96dpi
    height: 1123,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  const appUrl = nextServerRef?.url ?? devServerUrl;
  await printWin.loadURL(`${appUrl}/graduation-audit?sessionId=${sessionId}`);

  // Wait for React to render — did-finish-load is not enough for CSR pages
  await new Promise<void>(resolve => {
    printWin.webContents.once('did-finish-load', () => {
      // Extra delay to allow React hydration + data fetch inside the page
      setTimeout(resolve, 1500);
    });
  });

  const pdfBuffer = await printWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 15, bottom: 15, left: 15, right: 15, marginType: 'custom' },
  });

  printWin.destroy();

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Graduation Audit',
    defaultPath: `GraduationAudit-${sessionId}.pdf`,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { success: false, reason: 'cancelled' };

  await fs.promises.writeFile(filePath, pdfBuffer);
  return { success: true, filePath };
});
```

**In `electron/preload.ts`** — expose audit API:

```typescript
contextBridge.exposeInMainWorld('auditAPI', {
  generatePDF: (args: { sessionId: string }) =>
    ipcRenderer.invoke('print-graduation-audit', args),
});
```

**In `core/shared/types/global.d.ts`** — add type:

```typescript
interface Window {
  // ... existing APIs
  auditAPI: {
    generatePDF(args: { sessionId: string }): Promise<{ success: boolean; filePath?: string; reason?: string }>;
  };
}
```

### Dashboard Integration

Add a "Generate Graduation Audit" button to the dashboard results section. This button:
1. Is only enabled after matching has been run
2. Calls `POST /api/graduation-audit/session` with the current student + match data
3. On success, calls `window.auditAPI.generatePDF({ sessionId })`
4. Shows a loading state while Electron generates the PDF
5. On completion, shows a toast with the file path

### New Files Summary (F8)

| File | Purpose |
|------|---------|
| `web/app/(pages)/graduation-audit/page.tsx` | Print-optimized audit report page |
| `web/app/(pages)/graduation-audit/page.module.css` | Print CSS + screen preview CSS |
| `web/app/api/graduation-audit/session/route.ts` | POST store / GET retrieve audit session |
| `web/app/api/graduation-audit/store.ts` | In-memory audit session store |
| `electron/main.ts` | Add print-graduation-audit IPC handler (modify) |
| `electron/preload.ts` | Add window.auditAPI (modify) |
| `core/shared/types/global.d.ts` | Add auditAPI type (modify) |
| `web/app/(pages)/dashboard/page.tsx` | Add audit button (modify) |

---

## Implementation Order

The features are largely independent, but this order is recommended to front-load the dependencies:

| Order | Feature | Reason |
|-------|---------|--------|
| 1 | **F4 — At-Risk Detection** | Pure service addition, no new UI pages, integrates directly into existing match flow. Unlocks richer data for F1 and F8. |
| 2 | **F7 — Planner Diff** | Cloud-side, isolated from local app. Shared diff service can be written and tested before cloud integration. |
| 3 | **F8 — Graduation Audit PDF** | Depends on F4 risk report being in the match result. Independent of F1 and F2. |
| 4 | **F2 — Cohort Processing** | New page and session store. Independent feature, moderate complexity. |
| 5 | **F1 — AI Agent** | Builds on F2, F4, and F8 existing. Also depends on Ollama model being available, which should be verified early. |

---

## Shared Infrastructure Notes

### In-Memory Store Pattern

F2, F8, and F1 all use server-side in-memory stores. Follow the pattern established by `web/app/api/scraper/store.ts`:
- Single module-level variable
- Exported get/set functions
- No TTL needed (data cleared on app restart, which is acceptable given no-persistence requirement)
- In F2's case, ensure old sessions are cleared when a new cohort session starts (one active session at a time)

### Ollama Availability Check

F1 depends on Ollama running with the right model. Before the agent chat panel is shown to the user, check `GET /api/ollama/status`. If Ollama is not running or the model is not downloaded, show a setup prompt instead of the chat interface.

### Privacy Gate

F2 and F8 both process student data. Both should check for privacy acknowledgement (same server-side gate used by `/api/import`):
```typescript
const acknowledged = await prisma.privacyEvent.findFirst({
  where: { event_type: 'acknowledged', notice_version: NOTICE_VERSION },
});
if (!acknowledged) return NextResponse.json({ error: '...' }, { status: 403 });
```

Add this check to `/api/cohort/upload`, `/api/cohort/start`, and `/api/graduation-audit/session`.
