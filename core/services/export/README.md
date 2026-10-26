# export: Excel report

`exportService.ts` has one function, `generateExport(input)`. It builds an `.xlsx` workbook (xlsx-js-style) from the data that the dashboard already holds.

- The first sheet is always **Report Info** (date, student id and name, data source, sections, planner, system version).
- Then one sheet for each section the user ticked, in order: Student Profile, Major & Course Match, Completed Units, Study Planner (`ExportSection` in `core/shared/types/export.ts`).
- The route is `web/app/api/export/route.ts` (POST). It returns 400 when no section is chosen and adds `APP_VERSION`. The UI is `web/components/ExportModal.tsx`.
- The service is pure. It does not read the database.

Tests: `tests/unit/export-service.test.ts` (reads the generated workbook back), `tests/ui/ExportModal.test.tsx`.
