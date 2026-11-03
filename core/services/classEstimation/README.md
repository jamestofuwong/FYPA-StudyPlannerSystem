# classEstimation: headcount forecast per unit

Helps a Head of Department see how many students will take each unit next semester. It reads the students of a course from the portal, predicts what each one can take, adds them up, applies a retention rate and adds a typed new-intake number.

## Entry points

- Routes: `web/app/api/class-estimation/{preview,run,import,runs}` (list in [api-routes](../../../docs/ai/generated/api-routes.md)). The page is `web/app/(pages)/class-estimation`.
- `scrapeOrchestrator.ts`: reads enrollments and degree audits from the portal for a run (phases `enrollments` and `audit`).
- `aggregationService.ts`: adds up the picks per unit, applies retention, adds the new intake, rounds once at the end.

## Pipeline (one file per job)

| File | Job |
|---|---|
| `estimationRecordBuilder.ts`, `scrapedStudentMapper.ts` | The one place where a transcript (from the portal or from a file) becomes an `EstimationRecord`. The source is recorded and never branched on, so the two paths cannot drift apart. The intake comes from the month of the earliest semester term (`termCode.ts`), not its S1/S2 suffix: `2024_SEP_S1` is an Aug/Sept 2024 intake. A `FEB_S2` first term is read as the previous Aug/Sept intake, with a warning. |
| `courseDetector.ts` | Works out which course an imported batch belongs to. Each student votes for the course whose planners hold most of their units. |
| `plannerCandidateResolver.ts`, `plannerCache.ts` | Turn a matching run into the candidate units that a student has not taken. Core and major-core units come from the matching result. Elective pools come from the database. `plannerCache` fetches each planner once per run. A student takes one seat per core or major-core unit: a unit listed in both categories counts once, and is left out of that student's elective pools. |
| `eligibilityEngine.ts`, `eligibilityFilter.ts` | Can this student take unit X in a future term? Reuses `canTake` from the scheduler. |
| `unitRanker.ts` | Ranks core and major-core units and keeps the top ones up to the load cap: first what the planner puts in the student's slot for the target semester (counted from their intake), then failed units to retake, then any other owed unit, earliest slot first. Elective units are not ranked. Failed units are part of the grouping key. |
| `electiveSplitter.ts` | Phase 6. Shares elective picks as fractions, because a pool of 12 does not tell which units a student picks. |
| `studentGrouping.ts` | Batching. Groups students that the estimator cannot tell apart. It is an optimisation only: grouped and ungrouped runs must give identical figures, and a test asserts it. The grouping key must cover every field that the pipeline reads. |
| `estimationPreview.ts` | A diagnostic run that shows what each step did for each student. |
| `retention.ts` | The discount for students who will not be back. One rate for everyone (the portal has no visa or graduation status). |
| `newIntakeResolver.ts`, `newIntakeSetting.ts` | New students (not in the portal): a number typed per course. They all start in Year 1, Semester 1 of the planners for the target intake: Feb/Mar planners for a Feb/Mar target, Aug/Sept planners for an Aug/Sept target. |
| `aggregationService.ts` | Totals. Keeps the free-elective share apart, so the page and the export can split seats into Needed to graduate (core, major core, prescribed electives) and Optional (free electives). |
| `runExportService.ts` | Excel export of a run, with the page's columns: Needed to graduate, Optional, New, Headcount. Runs saved before `from_free_electives` existed show Optional as "Not recorded". |
| `sources/` | Where students come from: `mockPortalSource`, `realPortalSource`, chosen by `resolvePortalSource` (`CLASS_ESTIMATION_SOURCE`). |
| `dpaImport/` | Import a degree progress audit file instead of the portal. `npm run fixtures:dpa` writes test files from the loaded planners; `--intakes=2024S2,2025S2` picks the planner intakes and `--as-of=2026S2` sets each student's progress from their intake. |
| `backtest/` | Back-test the forecast against a past term (`npm run backtest`). |

## Rules

- **Order matters in aggregation.** Sum the continuing cohort, apply retention, then add the new intake. New students are typed as the number who actually turn up, so retention must not discount them twice.
- Round once, at the end. Every stage before it stays fractional.
- The records of students are held in memory only (`estimationStore.ts`, a `globalThis` singleton, wiped by every new run). Only the aggregate run is saved (`estimationRunRepository`, tables `EstimationRun` and `EstimationRunUnit`). Never save per-student data.
- Pass inputs to the eligibility engine as a named object. A positional change once shifted every argument silently.

## Tests

`tests/unit/classEstimation` (one file per module), `tests/ui/class-estimation-memory.test.tsx`.
