# core/shared: pure shared code

Types, constants and pure functions that any layer, and the student app, can import. **No file here may read files, call the network, use the database or import `electron`, `web/` or `core/db`.** The student app imports from here, so a violation breaks it.

| Folder | Content |
|---|---|
| `types/` | `student.ts`, `matching.ts` (also `DEFAULT_CONFIG`), `plannerImport.ts`, `export.ts`, `classEstimation.ts`, `scraping.ts`, `ping.ts`, and `global.d.ts` (the `Window` types for the bridge and the `<webview>` tag). |
| `constants/grades.ts` | Grade sets (`PASS_GRADES`, `CONCEDED_PASS_GRADES`, `FAIL_GRADES`), `MAX_CONCEDED_PASSES`, and helpers such as `normaliseUnitCode` and `resolveUnitStates`. Use these. Do not write your own grade lists. |
| `scheduling/` | `electiveSlots`, `planEdits`, `planTerms`, `planValidator`, `planWarnings`, `schedulableUnit`. Shared with the student app. |
| `planFile/` | Export and import of a plan as a file (`pdfPayload.ts`, `restore.ts`). |

Aliases: `@shared/*` points to this folder (`@core/shared/*` also works). `student/` uses `@core/shared/...`.

Tests: `tests/unit/grades`, `tests/unit/planFile`, `tests/unit/pathway`, `tests/unit/scheduling`.
