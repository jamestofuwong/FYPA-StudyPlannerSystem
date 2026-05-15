# =============================================================================
# PDF Parser sidecar — Python-only image
# Build context: repo root (FYPA-StudyPlannerSystem/)
# Build command: docker build -f runtime/pdf-parser/Dockerfile .
# =============================================================================

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies required by pdfplumber
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpoppler-cpp-dev \
 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching)
COPY runtime/pdf-parser/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the FastAPI application
COPY runtime/pdf-parser/main.py ./

# Copy the planner parsing scripts from core (read-only; never modified here)
COPY core/services/plannerImport/plannerStructureService.py ./core/services/plannerImport/
COPY core/services/plannerImport/plannerPdfExtractor.py     ./core/services/plannerImport/

EXPOSE 8001

# Single worker is intentional: process_planner_pdf uses pdfplumber which is
# not multiprocess-safe across forked workers. Concurrency is handled via
# asyncio.to_thread() (thread-pool) within the single process.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
