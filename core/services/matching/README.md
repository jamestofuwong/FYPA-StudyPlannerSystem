# matching: major detection

Finds the major of a student by comparing the units that they passed with every study planner. Rule based, no machine learning, so an advisor can explain a result.

## Entry points

- `matchingService.ts`: `runMatchingPipeline(input)`. Pure. It validates the config, then runs phases 1 to 6. No database access while it runs.
- `dashboardMatch.ts`: `runDashboardMatch(rawStudent)`. The adapter that loads planners and the unit master table (database) and then calls the pipeline. `/api/match` calls this.

## The pipeline

| Step | File | Job |
|---|---|---|
| Config | `configValidator.ts` | Rejects a bad config (the five weights must add up to 1). |
| Filter (phase 1) | `plannerFilter.ts` | Three levels: intake year, then intake semester, then scoring. Throws `PlannerFilterError` when no planner applies. |
| Normalise | `unitNormalizer.ts` | Cleans unit codes. |
| Profile | `profileBuilder.ts` | Builds the student profile and checks requisites. |
| Score (phase 3) | `scoringEngine.ts` | One score record per planner. |
| Detect (phases 4 and 5) | `majorDetector.ts` | Ranks by major-core score, then picks the primary major, second major and edge cases. |
| Package (phase 6) | `outputPackager.ts` | Builds the `DisplayPayload` for the UI. |

`majorEvidence.ts` and `secondMajorThreshold.ts` support the detector. `plannerTemplateBuilder.ts` and `unitMasterTableBuilder.ts` shape database rows for the pipeline.

## Rules and invariants

- Weights are in `DEFAULT_CONFIG` (`core/shared/types/matching.ts`): core 0.40, major core 0.30, prescribed electives 0.20, free electives 0.05, work placement 0.05. They must add up to 1. `validateConfig` rejects any other sum.
- Planners are ranked by the major-core score. A second major needs a score at or above `secondMajorThreshold` (0.70).
- No major is reported when the best major score is below `noMajorThreshold` (0.30). With `requireMajorEvidence`, no major is reported when no unit that the student took belongs to only one major. All majors share the core units, so a first-year transcript says nothing about the major (`majorEvidence.ts`).
- `secondMajorThreshold` is stored as text in `system_config`. Older rows hold a percentage ("70"), the Settings page writes a fraction ("0.7"). `parseSecondMajorThreshold` reads both. Keep it.
- A unit's category, when it is in several planners, resolves by priority in `dashboardMatch.ts` (major core wins). MPU units are excluded from scoring.
- Do not add a database call inside `runMatchingPipeline`.

## How to change it

1. Change a weight or threshold: edit `DEFAULT_CONFIG`. Update `tests/unit/matching` and the weight table in the user guide (`web/app/(pages)/user-guide/GuideParts.tsx`).
2. Change a phase: edit its file and its test in `tests/unit/matching`.
3. Run `npx jest tests/unit/matching tests/ui/matching`, then `npm test`.

The 50-student scenario suite (`tests/scenarios`, needs `SCENARIO_DB_URL`) checks matching, graduation and the pathway against an oracle in `tests/scenarios/support/oracle.ts`.

## Tests

`tests/unit/matching`, `tests/ui/matching`, `tests/performance/matching.perf.test.ts` (300 planners in under 5 s).
