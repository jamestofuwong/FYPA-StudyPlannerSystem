"""
PDF Parser sidecar service for the FYPA cloud app.

Wraps core/services/plannerImport/plannerStructureService.py as a FastAPI HTTP
service so that:
  - pdfplumber and all heavy imports are loaded ONCE at uvicorn startup
  - Every subsequent parse request hits warm in-process code (no cold start)
  - The Next.js container needs no Python runtime at all

API
---
POST /parse          multipart/form-data: pdf (file), use_llm (bool, default false)
GET  /health         liveness probe
"""

import asyncio
import os
import sys
import tempfile

# ---------------------------------------------------------------------------
# Bootstrap: add the plannerImport directory to sys.path so Python can find
# plannerStructureService.py and plannerPdfExtractor.py without any source
# modifications.
# ---------------------------------------------------------------------------
_PLANNER_IMPORT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "core", "services", "plannerImport",
)
sys.path.insert(0, _PLANNER_IMPORT_DIR)

# ---------------------------------------------------------------------------
# Module-level import — this is the key to eliminating cold starts.
# pdfplumber, plannerPdfExtractor, and all regex/constants are initialised
# ONCE when uvicorn starts, not on every request.
# ---------------------------------------------------------------------------
from plannerStructureService import process_planner_pdf  # noqa: E402

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

app = FastAPI(title="FYPA PDF Parser", version="1.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse")
async def parse(
    pdf: UploadFile = File(..., description="PDF file to parse"),
    use_llm: bool = Form(False, description="Enable Ollama LLM review pass"),
) -> JSONResponse:
    """
    Parse a study planner PDF and return structured JSON.

    Runs process_planner_pdf() in a thread-pool executor so the async event
    loop stays free for concurrent requests while the synchronous pdfplumber
    work executes on a worker thread.
    """
    contents = await pdf.read()
    filename = pdf.filename or "planner.pdf"

    def _parse() -> tuple:
        with tempfile.NamedTemporaryFile(
            suffix=".pdf", prefix="fypa-parse-", delete=False
        ) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        try:
            return process_planner_pdf(tmp_path, use_llm=use_llm)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    try:
        structured, report = await asyncio.to_thread(_parse)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return JSONResponse({"planner": structured, "report": report})
