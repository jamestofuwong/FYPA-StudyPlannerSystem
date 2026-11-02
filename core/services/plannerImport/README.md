# plannerImport: study planner PDF to data

Turns a study planner PDF into a structured planner. A TypeScript wrapper spawns Python. The result has a `report` with `findings` (severity and category `structural` or `text_quality`) so the advisor can correct the planner before saving.

## Entry points

- `plannerImportService.ts`: `extractPlannerFromPdf(...)`. Writes the PDF to a temp folder, spawns the Python command and parses JSON from stdout.
- `plannerStructureService.py`: the Python entry point.
- `plannerExtractionPipeline.py`: `apply_extraction_pipeline`. Quality-gated: the cheap deterministic extraction runs first. `plannerExtractionQuality.py` validates it and picks fallbacks. The fallbacks are `plannerPdfTextFallback.py` (pdftext), `plannerDoclingFallback.py` (Docling) and the refiners in `plannerLayoutRefiner.py` (year and semester, requirements, prerequisites, row boundaries).
- Caller: `POST /api/planners` (`web/app/api/planners/route.ts`) receives the PDF as form data. The saved planner goes through `POST /api/planners/save`.

## Rules

- Use the cheap method first. Use a heavy fallback only when the quality check fails.
- The Python command is `PYTHON_EXECUTABLE` in development (default `python3`, `python` on Windows). A release uses a PyInstaller binary built by `npm run build:python` into `resources/python/`.
- Python needs `pdftext`, `docling`, `pdfplumber` and `pypdfium2` (`requirements.txt`). Create the environment: `python3 -m venv core/services/plannerImport/.venv` then `pip install -r requirements.txt`. The first Docling run can download models.
- The folder `.venv/` and `__pycache__/` are not in Git.

## Tests

Python: `tests/unit/plannerImport/test_*.py` and `tests/integration/plannerImport` (a real PDF fixture). TypeScript: `tests/unit/plannerImport/*.test.ts`, `tests/api/planner-save.test.ts`, `tests/api/planners.test.ts`.
