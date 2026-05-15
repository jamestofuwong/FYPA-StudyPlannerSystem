/**
 * POST /api/scraper/run?action=check|sync
 *
 * Streams Server-Sent Events back to the client as the scraper runs.
 * Each event is a JSON object on a `data:` line.
 *
 * Event shapes:
 *   { type: 'step',     stepId: string, label: string }
 *   { type: 'log',      messages: string[] }
 *   { type: 'progress', current: number, total: number, description: string }
 *   { type: 'result',   action: string, data: unknown }
 *   { type: 'error',    message: string }
 *   { type: 'done' }
 *
 * DB side-effects:
 *   - Creates a SyncRun record at the start (status: 'running')
 *   - On completion, updates it with final status, counts, duration, and logs
 *   - check: read-only (no DB writes to planners)
 *   - sync: upserts PortalPlannerEntry metadata + downloads/parses each PDF
 *           + saves parsed data to PlannerTemplate tables
 *
 * Environment:
 *   SCRAPER_SIMULATE=true  — use mock data instead of real Puppeteer (skips parsing)
 *   PLANNER_PDF_DIR        — directory to save downloaded PDFs (default: /tmp/planners)
 *   PYTHON_EXECUTABLE      — path to python3 binary (default: python3 from PATH)
 */

import type { NextRequest } from 'next/server';
import type { ScraperCallbacks, ScraperStepId, PlannerIndexEntry, PlannerDiff } from '@core/services/plannerScraper/types';
import { db } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Internal result shape — normalised from both real and simulated runs
// ---------------------------------------------------------------------------

interface RunResult {
  totalScraped: number;
  diff: PlannerDiff;
  unchangedCount: number;
  failedCount: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

type SseEvent =
  | { type: 'step'; stepId: string; label: string }
  | { type: 'log'; messages: string[] }
  | { type: 'progress'; current: number; total: number; description: string }
  | { type: 'result'; action: string; data: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };

function sseChunk(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const action = new URL(req.url).searchParams.get('action') ?? 'check';
  const simulate = process.env.SCRAPER_SIMULATE === 'true';

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      const allLogs: string[] = [];

      const send = (event: SseEvent) => {
        try { controller.enqueue(sseChunk(event)); } catch { /* stream closed */ }
      };

      // Collect all log messages alongside streaming them
      const sendLog = (messages: string[]) => {
        allLogs.push(...messages);
        send({ type: 'log', messages });
      };

      // Create the sync run record immediately
      let runId: string | undefined;
      try {
        const run = await db.syncRun.create({
          data: { status: 'running', action, trigger_source: 'manual' },
        });
        runId = run.id;
      } catch (dbErr) {
        console.error('[scraper/run] Failed to create SyncRun:', dbErr);
      }

      const callbacks: ScraperCallbacks = {
        onLog: sendLog,
        onStep: (stepId: ScraperStepId, label: string) => send({ type: 'step', stepId, label }),
        onProgress: (current, total, description) =>
          send({ type: 'progress', current, total, description }),
      };

      // Load existing portal planner records so the diff can classify entries
      // correctly as new / updated / unchanged rather than always treating
      // everything as new.
      let storedRecords: { unitCode: string; year: string; intakeMonth: string; lastUpdated: string }[] = [];
      try {
        const existing = await db.portalPlannerEntry.findMany({
          select: { unit_code: true, year: true, intake_month: true, last_updated: true },
        });
        storedRecords = existing.map(r => ({
          unitCode: r.unit_code,
          year: r.year,
          intakeMonth: r.intake_month,
          lastUpdated: r.last_updated ?? '',
        }));
        sendLog([`→ Loaded ${storedRecords.length} existing record(s) from database for diff`]);
      } catch (dbErr) {
        console.error('[scraper/run] Failed to load stored records:', dbErr);
        sendLog(['→ Could not load stored records — treating all entries as new']);
      }

      try {
        let result: RunResult;

        if (simulate) {
          result = await runSimulation(action, send, sendLog);
        } else {
          result = await runReal(action, storedRecords, callbacks);
        }

        const toUpsert = action === 'sync'
          ? [...result.diff.newEntries, ...result.diff.updatedEntries]
          : [];

        // -----------------------------------------------------------------------
        // Upsert portal planner entry metadata — only on sync, not check.
        // -----------------------------------------------------------------------
        if (toUpsert.length > 0) {
          try {
            for (const entry of toUpsert) {
              await db.portalPlannerEntry.upsert({
                where: {
                  unit_code_year_intake_month: {
                    unit_code: entry.unitCode,
                    year: entry.year,
                    intake_month: entry.intakeMonth ?? '',
                  },
                },
                create: {
                  year: entry.year,
                  unit_code: entry.unitCode,
                  course_name: entry.courseName,
                  intake_month: entry.intakeMonth ?? '',
                  program_level: entry.programLevel ?? null,
                  pdf_url: entry.pdfUrl,
                  last_updated: entry.lastUpdated ?? null,
                  last_updated_iso: entry.lastUpdatedISO ?? null,
                },
                update: {
                  course_name: entry.courseName,
                  program_level: entry.programLevel ?? null,
                  pdf_url: entry.pdfUrl,
                  last_updated: entry.lastUpdated ?? null,
                  last_updated_iso: entry.lastUpdatedISO ?? null,
                },
              });
            }
          } catch (dbErr) {
            console.error('[scraper/run] Failed to upsert PortalPlannerEntries:', dbErr);
          }
        }

        // -----------------------------------------------------------------------
        // PDF parsing — download + parse each PDF + save to PlannerTemplate tables.
        // Only on real sync (not check, not simulation).
        // -----------------------------------------------------------------------
        let parsed = 0;
        let parseFailed = 0;

        if (action === 'sync' && !simulate && toUpsert.length > 0) {
          const parserUrl = (process.env.PLANNER_PARSER_URL ?? 'http://pdf-parser:8001').replace(/\/$/, '');
          const { savePlannerFromImport } = await import('@core/db/repositories/plannerRepository');

          sendLog([`→ Parsing PDFs for ${toUpsert.length} planner(s) via ${parserUrl}…`]);

          for (let i = 0; i < toUpsert.length; i++) {
            const entry = toUpsert[i];
            send({ type: 'progress', current: i + 1, total: toUpsert.length, description: entry.unitCode });
            sendLog([`  [${i + 1}/${toUpsert.length}] Downloading: ${entry.unitCode}`]);

            try {
              // Download the PDF from the portal
              const pdfRes = await fetch(entry.pdfUrl);
              if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status} downloading PDF`);
              const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

              sendLog([`  [${i + 1}/${toUpsert.length}] Parsing: ${entry.unitCode}`]);

              // Send PDF to the FastAPI sidecar for parsing.
              // pdfplumber is already loaded in that process — no cold start.
              const filename = `${entry.unitCode}-${entry.year}-${(entry.intakeMonth ?? '').replace(/\s+/g, '-')}.pdf`;
              const form = new FormData();
              form.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
              form.append('use_llm', 'false');

              const parseRes = await fetch(`${parserUrl}/parse`, { method: 'POST', body: form });
              if (!parseRes.ok) {
                const detail = await parseRes.text();
                throw new Error(`Parser service error ${parseRes.status}: ${detail}`);
              }

              const importResult = await parseRes.json() as import('@core/shared/types/plannerImport').PlannerImportResult;

              // Persist the parsed planner structure to DB
              const template = await savePlannerFromImport(importResult.planner);

              // Link the portal entry back to the parsed template
              await db.portalPlannerEntry.update({
                where: {
                  unit_code_year_intake_month: {
                    unit_code: entry.unitCode,
                    year: entry.year,
                    intake_month: entry.intakeMonth ?? '',
                  },
                },
                data: { planner_template_id: template.id },
              });

              sendLog([`  ✓ ${entry.unitCode}: parsed and saved`]);
              parsed++;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg === 'DUPLICATE_PLANNER') {
                sendLog([`  ⚠ ${entry.unitCode}: already parsed — skipping re-parse`]);
                // Don't count as failed — it's just already there
              } else {
                sendLog([`  ✗ ${entry.unitCode}: ${msg}`]);
                parseFailed++;
              }
            }
          }

          send({ type: 'progress', current: toUpsert.length, total: toUpsert.length, description: 'Done' });
          sendLog([`✓ PDF parsing complete — ${parsed} parsed, ${parseFailed} failed`]);
        }

        // -----------------------------------------------------------------------
        // Persist the completed sync run
        // -----------------------------------------------------------------------
        if (runId) {
          try {
            await db.syncRun.update({
              where: { id: runId },
              data: {
                status: (result.errorMessage || parseFailed > 0) ? 'partial' : 'success',
                completed_at: new Date(),
                duration_ms: Date.now() - startTime,
                planners_scanned: result.totalScraped,
                planners_new: result.diff.newEntries.length,
                planners_updated: result.diff.updatedEntries.length,
                planners_unchanged: result.unchangedCount,
                planners_failed: result.failedCount + parseFailed,
                error_message: result.errorMessage ?? null,
                logs: allLogs,
              },
            });
          } catch (dbErr) {
            console.error('[scraper/run] Failed to update SyncRun:', dbErr);
          }
        }

        // Send the final result event (always emitted here, not inside runReal/runSimulation)
        send({
          type: 'result',
          action,
          data: {
            totalScraped: result.totalScraped,
            diff: result.diff,
            parsed,
            parseFailed,
          },
        });

        send({ type: 'done' });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);

        if (runId) {
          try {
            await db.syncRun.update({
              where: { id: runId },
              data: {
                status: 'failed',
                completed_at: new Date(),
                duration_ms: Date.now() - startTime,
                error_message: message,
                logs: allLogs,
              },
            });
          } catch (dbErr) {
            console.error('[scraper/run] Failed to update SyncRun on error:', dbErr);
          }
        }

        send({ type: 'error', message });
        send({ type: 'done' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// Real scraper — no DB writes, just scrape + diff
// ---------------------------------------------------------------------------

async function runReal(
  action: string,
  storedRecords: { unitCode: string; year: string; intakeMonth: string; lastUpdated: string }[],
  callbacks: ScraperCallbacks,
): Promise<RunResult> {
  const { createPuppeteerAdapter, checkForUpdates } =
    await import('@core/services/plannerScraper/index');

  const adapter = await createPuppeteerAdapter({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  });
  try {
    const { diff, totalScraped } = await checkForUpdates(adapter, storedRecords, callbacks);
    return {
      totalScraped,
      diff,
      unchangedCount: diff.unchangedEntries.length,
      failedCount: 0,
    };
  } finally {
    await adapter.close();
  }
}

// ---------------------------------------------------------------------------
// Simulation (SCRAPER_SIMULATE=true) — no real browser, no real parsing
// ---------------------------------------------------------------------------

const MOCK_NEW_ENTRIES: PlannerIndexEntry[] = [
  {
    year: '2025', unitCode: 'CT000-3-3', courseName: 'Bachelor of Computer Science (Hons)',
    intakeMonth: 'March intake', programLevel: 'Undergraduate',
    pdfUrl: 'https://www.swinburne.edu.my/planners/ct000-2025-march.pdf',
    lastUpdated: '10 April 2025', lastUpdatedISO: '2025-04-10',
  },
  {
    year: '2025', unitCode: 'IT000-3-3', courseName: 'Bachelor of Information Technology (Hons)',
    intakeMonth: 'July intake', programLevel: 'Undergraduate',
    pdfUrl: 'https://www.swinburne.edu.my/planners/it000-2025-july.pdf',
    lastUpdated: '10 April 2025', lastUpdatedISO: '2025-04-10',
  },
];

const MOCK_UPDATED_ENTRIES: PlannerIndexEntry[] = [
  {
    year: '2024', unitCode: 'BM000-3-3', courseName: 'Bachelor of Business Management (Hons)',
    intakeMonth: 'March intake', programLevel: 'Undergraduate',
    pdfUrl: 'https://www.swinburne.edu.my/planners/bm000-2024-march.pdf',
    lastUpdated: '2 April 2025', lastUpdatedISO: '2025-04-02',
  },
];

async function runSimulation(
  action: string,
  send: (e: SseEvent) => void,
  sendLog: (messages: string[]) => void,
): Promise<RunResult> {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const steps: Array<{ stepId: string; label: string; logs: string[]; ms: number }> = [
    {
      stepId: 'navigate-to-index',
      label: 'Navigating to planner index page',
      logs: [
        '→ Navigating to https://www.swinburne.edu.my/current-students/get-started/program-study-planner/',
        '✓ Landed on: https://www.swinburne.edu.my/current-students/get-started/program-study-planner/',
      ],
      ms: 1200,
    },
    {
      stepId: 'wait-for-content',
      label: 'Waiting for page content to load',
      logs: [
        '→ Polling for .tab_container elements (timeout: 20000ms)',
        '✓ Found 4 tab_container element(s)',
      ],
      ms: 800,
    },
    {
      stepId: 'detect-year-tabs',
      label: 'Detecting year tabs',
      logs: [
        '→ Reading year tab labels',
        '✓ 4 tab(s) found: 2022, 2023, 2024, 2025',
      ],
      ms: 300,
    },
    {
      stepId: 'scrape-planner-index',
      label: 'Scraping planner index',
      logs: [
        '→ Scraping all planner rows from all year tabs',
        '✓ Scraped 18 planner entries across 4 tab(s)',
        '   2022: 3 planner(s)',
        '   2023: 5 planner(s)',
        '   2024: 5 planner(s)',
        '   2025: 5 planner(s)',
      ],
      ms: 600,
    },
  ];

  for (const step of steps) {
    send({ type: 'step', stepId: step.stepId, label: step.label });
    await delay(step.ms);
    sendLog(step.logs);
  }

  const diff: PlannerDiff = {
    newEntries: MOCK_NEW_ENTRIES,
    updatedEntries: MOCK_UPDATED_ENTRIES,
    unchangedEntries: [],
  };

  if (action === 'sync') {
    const changeCount = MOCK_NEW_ENTRIES.length + MOCK_UPDATED_ENTRIES.length;
    sendLog([
      `✓ [sync] ${changeCount} planner(s) queued for database update (metadata only in simulation mode)`,
    ]);
  } else {
    sendLog([
      `✓ [checkForUpdates] Done.`,
      `   New: ${MOCK_NEW_ENTRIES.length}`,
      `   Updated: ${MOCK_UPDATED_ENTRIES.length}`,
      `   Unchanged: 15`,
    ]);
  }

  return {
    totalScraped: 18,
    diff,
    unchangedCount: 15,
    failedCount: 0,
  };
}
