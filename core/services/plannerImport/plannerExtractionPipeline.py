from __future__ import annotations
import copy
import time

from plannerDoclingFallback import apply_docling_structural_fallback
from plannerExtractionQuality import plan_uses, select_fallbacks, validate_planner
from plannerLayoutRefiner import (
    apply_prerequisite_association,
    apply_requirement_association,
    apply_row_boundary_refinement,
    apply_year_semester_association,
)
from plannerPdfTextFallback import apply_pdftext_fallback

# Run quality-gated fallbacks and refinements for one planner PDF.
def apply_extraction_pipeline(p0_data, pdf_path, baseline=None):
    # ============================================================
    # STEP 1: Check deterministic extraction quality
    # ============================================================
    started = time.perf_counter()
    p0_validation = validate_planner(p0_data)
    p0_plan = select_fallbacks(p0_validation)

    # ============================================================
    # STEP 2: Apply PDFText fallback when needed
    # ============================================================
    # Use PDFText only when the initial quality plan identifies recoverable gaps.
    if plan_uses(p0_plan, "pdftext"):
        if baseline:
            p2_data = copy.deepcopy(baseline["p2_data"])
            pdftext_diagnostics = copy.deepcopy(baseline["pdftext_diagnostics"])
            pdftext_seconds = baseline["pdftext_seconds"]
        else:
            fallback_started = time.perf_counter()
            p2_data, pdftext_diagnostics = apply_pdftext_fallback(p0_data, pdf_path)
            pdftext_seconds = time.perf_counter() - fallback_started
    else:
        p2_data = copy.deepcopy(p0_data)
        pdftext_diagnostics = []
        pdftext_seconds = 0.0

    # ============================================================
    # STEP 3: Check the updated result
    # ============================================================
    p2_validation = validate_planner(p2_data)
    p2_plan = select_fallbacks(p2_validation)

    # ============================================================
    # STEP 4: Apply Docling fallback when needed
    # ============================================================
    # Use Docling only for structural problems that remain after text recovery.
    if plan_uses(p2_plan, "docling"):
        if baseline:
            final_data = copy.deepcopy(baseline["p4_data"])
            docling_proposals = copy.deepcopy(baseline["docling_proposals"])
            docling_diagnostics = copy.deepcopy(baseline["docling_diagnostics"])
            docling_seconds = baseline["docling_seconds"]
        else:
            fallback_started = time.perf_counter()
            final_data, docling_proposals, docling_diagnostics = apply_docling_structural_fallback(
                p2_data, pdf_path, pdftext_diagnostics
            )
            docling_seconds = time.perf_counter() - fallback_started
    else:
        final_data = copy.deepcopy(p2_data)
        docling_proposals = []
        docling_diagnostics = {
            "invoked": False, "triggers": [], "ocr_enabled": False, "ocr_cells": 0,
            "model_load_seconds": 0.0, "conversion_seconds": 0.0,
        }
        docling_seconds = 0.0

    # ============================================================
    # STEP 5: Run refinement stages
    # ============================================================
    # The remaining passes associate extracted values with rows, requirements, and headers.
    boundary_started = time.perf_counter()
    final_data, row_boundary_diagnostics = apply_row_boundary_refinement(final_data, pdf_path)
    row_boundary_seconds = time.perf_counter() - boundary_started

    requirement_started = time.perf_counter()
    final_data, requirement_block_diagnostics = apply_requirement_association(final_data, pdf_path)
    requirement_block_seconds = time.perf_counter() - requirement_started

    association_started = time.perf_counter()
    final_data, year_semester_association_diagnostics = apply_year_semester_association(
        final_data, pdf_path
    )
    year_semester_association_seconds = time.perf_counter() - association_started

    prerequisite_started = time.perf_counter()
    final_data, prerequisite_association_diagnostics = apply_prerequisite_association(
        final_data, pdf_path
    )
    prerequisite_association_seconds = time.perf_counter() - prerequisite_started

    # ============================================================
    # STEP 6: Perform final quality validation
    # ============================================================
    final_validation = validate_planner(final_data)

    # ============================================================
    # STEP 7: Return the planner and diagnostics
    # ============================================================
    return final_data, {
        "p0_validation": p0_validation,
        "p0_fallback_plan": p0_plan,
        "p2_validation": p2_validation,
        "p2_fallback_plan": p2_plan,
        "final_validation": final_validation,
        "pdftext_diagnostics": pdftext_diagnostics,
        "docling_proposals": docling_proposals,
        "docling_diagnostics": docling_diagnostics,
        "row_boundary_diagnostics": row_boundary_diagnostics,
        "requirement_block_diagnostics": requirement_block_diagnostics,
        "year_semester_association_diagnostics": year_semester_association_diagnostics,
        "prerequisite_association_diagnostics": prerequisite_association_diagnostics,
        "pdftext_invoked": pdftext_seconds > 0,
        "docling_invoked": bool(docling_diagnostics.get("invoked")),
        "row_boundary_invoked": True,
        "requirement_block_invoked": True,
        "year_semester_association_invoked": True,
        "pdftext_seconds": pdftext_seconds,
        "docling_seconds": docling_seconds,
        "row_boundary_seconds": row_boundary_seconds,
        "requirement_block_seconds": requirement_block_seconds,
        "year_semester_association_seconds": year_semester_association_seconds,
        "prerequisite_association_invoked": True,
        "prerequisite_association_seconds": prerequisite_association_seconds,
        "orchestration_seconds": time.perf_counter() - started,
    }

