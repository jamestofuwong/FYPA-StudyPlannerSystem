import argparse
import copy
import hashlib
import json
import os
import re
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path

from plannerPdfExtractor import (
    UNIT_MARKER_RE,
    _canonical_minor_section_name,
    _clean_candidate_name,
    _clean_candidate_prereq,
    _looks_like_minor_section_header,
    _looks_like_wil_text,
    _normalise_semester_number,
    _strip_unit_markers,
    clean_text,
    extract_metadata,
    extract_requirements,
)
from plannerStructureAssembler import (
    CATEGORY_GROUPS,
    CODE_TOKEN_RE,
    _iter_unit_refs,
    _minor_codes,
    _unit_index,
    assemble_json,
)
from plannerExtractionQuality import _is_bad_unit_name, _looks_corrupted_existing_name

# Docling helpers recover table structure after deterministic extraction and PDFText checks.
# The configured pipeline uses cached models and keeps OCR/VLM features disabled.
from plannerPdfTextFallback import print_result_table
from plannerPdfTextFallback import (
    _fill_key,
    _learn_fill_categories,
    _p1_units,
    extract_layout as extract_pdftext_layout,
)

CODE_RE = re.compile(rf"\b[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b", re.IGNORECASE)
YEAR_RE = re.compile(r"\bYear\s+(One|Two|Three|Four|Five|\d+)\b", re.IGNORECASE)
SEMESTER_RE = re.compile(r"\bSemester\s+(\d+)\b", re.IGNORECASE)
YEAR_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
HEADER_RE = re.compile(r"\bUnit\s*Code\b|\bUnit\s*(?:Name|Title)\b|\bPre-?requisites?\b", re.IGNORECASE)
MODEL_INFO = {
    "layout": "docling-project/docling-layout-heron@main",
    "table": "docling-project/docling-models@v2.3.0/tableformer/accurate",
}

_CONVERTER = None
_MODEL_LOAD_SECONDS = 0.0
_CACHE_WORKAROUND = False

def _enable_offline_model_resolution():
    """Prevent Hugging Face model resolution from contacting the network."""
    os.environ["HF_HUB_OFFLINE"] = "1"
    try:
        from huggingface_hub import constants as hf_constants
        hf_constants.HF_HUB_OFFLINE = True
    except Exception:
        # Docling will provide the relevant import or model-loading error.
        pass

def build_pipeline_options():
    """Build the installed Docling pipeline with every OCR/VLM feature disabled."""
    os.environ.setdefault("USE_TF", "0")
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode

    options = PdfPipelineOptions()
    options.do_ocr = False
    options.do_table_structure = True
    options.table_structure_options.mode = TableFormerMode.ACCURATE
    options.do_picture_classification = False
    options.do_picture_description = False
    options.do_code_enrichment = False
    options.do_formula_enrichment = False
    return options

def _get_converter():
    """Create the shared Docling converter once so model loading is not repeated."""
    global _CACHE_WORKAROUND, _CONVERTER, _MODEL_LOAD_SECONDS
    if _CONVERTER is not None:
        return _CONVERTER

    _enable_offline_model_resolution()
    os.environ.setdefault("USE_TF", "0")
    import docling.document_converter as converter_module
    from docling.datamodel.base_models import InputFormat
    from docling.document_converter import DocumentConverter, PdfFormatOption

    options = build_pipeline_options()
    try:
        converter_module.create_pipeline_options_hash(options)
    except Exception:
        # Docling 2.126.0 can recurse while serializing concrete option types.
        converter_module.create_pipeline_options_hash = lambda value: hashlib.md5(
            (type(value).__qualname__ + value.model_dump_json()).encode("utf-8"),
            usedforsecurity=False,
        ).hexdigest()
        _CACHE_WORKAROUND = True

    _CONVERTER = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}
    )
    started = time.perf_counter()
    _CONVERTER.initialize_pipeline(InputFormat.PDF)
    _MODEL_LOAD_SECONDS = time.perf_counter() - started
    return _CONVERTER

def get_model_load_seconds():
    return _MODEL_LOAD_SECONDS

def _bbox(value):
    if value is None:
        return None
    if hasattr(value, "as_tuple"):
        return tuple(float(number) for number in value.as_tuple())
    names = ("l", "t", "r", "b")
    if all(hasattr(value, name) for name in names):
        return tuple(float(getattr(value, name)) for name in names)
    names = ("r_x0", "r_y0", "r_x1", "r_y1", "r_x2", "r_y2", "r_x3", "r_y3")
    if all(hasattr(value, name) for name in names):
        xs = [float(getattr(value, name)) for name in names[0::2]]
        ys = [float(getattr(value, name)) for name in names[1::2]]
        return min(xs), min(ys), max(xs), max(ys)
    return None

def _element_record(element):
    cluster = getattr(element, "cluster", None)
    box = _bbox(getattr(cluster, "bbox", None))
    return {
        "text": str(getattr(element, "text", "") or "").strip(),
        "page": getattr(element, "page_no", None),
        "bbox": box,
        "element_type": str(getattr(getattr(element, "label", None), "value", "unknown")),
        "confidence": getattr(cluster, "confidence", None),
        "element_id": getattr(element, "id", None),
    }

def _document_table_bbox(item, page_height):
    provenance = (getattr(item, "prov", None) or [None])[0]
    box = getattr(provenance, "bbox", None)
    if box is None:
        return None
    origin = str(getattr(getattr(box, "coord_origin", None), "value", ""))
    if origin != "TOPLEFT" and hasattr(box, "to_top_left_origin"):
        box = box.to_top_left_origin(page_height)
    return _bbox(box)

def _match_assembled_table(item, assembled_tables, conversion_pages, used_ids):
    provenance = (getattr(item, "prov", None) or [None])[0]
    page = getattr(provenance, "page_no", None)
    if not page or page > len(conversion_pages):
        return None
    target = _document_table_bbox(item, float(conversion_pages[page - 1].size.height))
    candidates = [
        table for table in assembled_tables
        if getattr(table, "page_no", None) == page and id(table) not in used_ids
    ]
    if target is None or not candidates:
        return None
    table = min(candidates, key=lambda value: sum(
        abs(left - right) for left, right in zip(
            target, _bbox(getattr(getattr(value, "cluster", None), "bbox", None))
        )
    ))
    used_ids.add(id(table))
    return table

def _native_cells(table):
    cells = []
    for cell in getattr(getattr(table, "cluster", None), "cells", []) or []:
        box = _bbox(getattr(cell, "rect", None))
        text = re.sub(r"\s+", " ", str(getattr(cell, "text", "") or "")).strip()
        if not text or box is None:
            continue
        cells.append({
            "text": text,
            "bbox": box,
            "confidence": getattr(cell, "confidence", None),
            "font_name": getattr(cell, "font_name", None),
            "font_size": getattr(cell, "font_size", None),
            "from_ocr": bool(getattr(cell, "from_ocr", False)),
        })
    return cells

def _column_anchors(table):
    positions = defaultdict(list)
    for cell in getattr(table, "table_cells", []) or []:
        box = _bbox(getattr(cell, "bbox", None))
        column = getattr(cell, "start_col_offset_idx", None)
        if box is not None and isinstance(column, int):
            positions[column].append(box[0])
    return [statistics.median(positions[index]) for index in sorted(positions)]

def _visual_rows(table):
    cells = _native_cells(table)
    if not cells:
        return []
    heights = [cell["bbox"][3] - cell["bbox"][1] for cell in cells]
    tolerance = max(1.5, statistics.median(heights) * 0.55)
    groups = []
    for cell in sorted(cells, key=lambda value: ((value["bbox"][1] + value["bbox"][3]) / 2, value["bbox"][0])):
        centre = (cell["bbox"][1] + cell["bbox"][3]) / 2
        if not groups or abs(centre - groups[-1]["centre"]) > tolerance:
            groups.append({"centre": centre, "cells": [cell]})
        else:
            groups[-1]["cells"].append(cell)
            groups[-1]["centre"] = statistics.mean(
                (value["bbox"][1] + value["bbox"][3]) / 2 for value in groups[-1]["cells"]
            )

    anchors = _column_anchors(table)
    rows = []
    for row_index, group in enumerate(groups):
        columns = defaultdict(list)
        for cell in sorted(group["cells"], key=lambda value: value["bbox"][0]):
            column = min(range(len(anchors)), key=lambda index: abs(cell["bbox"][0] - anchors[index])) if anchors else 0
            columns[column].append(cell)
        row_cells = {
            column: " ".join(cell["text"] for cell in values).strip()
            for column, values in columns.items()
        }
        rows.append({
            "row_id": row_index,
            "cells": row_cells,
            "text": " ".join(row_cells[index] for index in sorted(row_cells)),
            "bbox": (
                min(cell["bbox"][0] for cell in group["cells"]),
                min(cell["bbox"][1] for cell in group["cells"]),
                max(cell["bbox"][2] for cell in group["cells"]),
                max(cell["bbox"][3] for cell in group["cells"]),
            ),
        })
    return rows

def _parse_year(text):
    match = YEAR_RE.search(text or "")
    if not match:
        return None
    value = match.group(1).lower()
    return int(value) if value.isdigit() else YEAR_WORDS.get(value)

def _parse_semester(text):
    match = SEMESTER_RE.search(text or "")
    if match:
        return _normalise_semester_number(match.group(1))
    if re.search(r"\bSummer(?:\s+Term)?\b", text or "", re.IGNORECASE):
        return 3
    if re.search(r"\bWinter(?:\s+Term)?\b", text or "", re.IGNORECASE):
        return 4
    return None

def _category(code, name, prerequisite, listing=False, prescribed=False):
    combined = " ".join(value for value in (name, prerequisite) if value)
    if code.startswith("MPU"):
        return "mpu", "unit_code_prefix"
    if _looks_like_wil_text(combined):
        return "wil", "wil_text"
    if prescribed:
        return "prescribed_elective", "row_marker"
    if listing:
        return "elective", "listing_section"
    return "elective", "unresolved_colour"

def _table_units(table, page, year, listing, units, sections, seen, debug_rows):
    semester = None
    active_minor = None
    last_unit = None
    rows = _visual_rows(table)
    for row in rows:
        text = row["text"].strip()
        parsed_semester = _parse_semester(text)
        if parsed_semester is not None and not CODE_RE.search(text):
            semester = parsed_semester
            last_unit = None
            continue
        if HEADER_RE.search(text) and not CODE_RE.search(text):
            last_unit = None
            continue
        if _looks_like_minor_section_header(text):
            active_minor = _canonical_minor_section_name(text)
            sections.setdefault(active_minor, [])
            last_unit = None
            continue

        first = row["cells"].get(0, "")
        split_mpu = re.sub(r"\b(MPU\d{3})\s+([23])\b", r"\1\2", first, flags=re.IGNORECASE)
        codes = [_strip_unit_markers(value) for value in CODE_RE.findall(split_mpu)]
        if not codes:
            if last_unit and row["cells"].get(1):
                last_unit["name"] = _clean_candidate_name(
                    (last_unit.get("name") or "") + " " + row["cells"][1]
                )
            if last_unit and row["cells"].get(2):
                last_unit["prerequisite"] = _clean_candidate_prereq(
                    " ".join(value for value in (last_unit.get("prerequisite"), row["cells"][2]) if value)
                )
            continue

        name_text = re.sub(r"^\s*Unit\s*(?:Name|Title)\s*", "", row["cells"].get(1, ""), flags=re.IGNORECASE)
        prereq_text = re.sub(r"^\s*Pre-?requisites?\s*", "", row["cells"].get(2, ""), flags=re.IGNORECASE)
        offered_text = re.sub(r"^\s*Offered\s+in\s*", "", row["cells"].get(3, ""), flags=re.IGNORECASE).strip() or None
        prescribed = bool(re.search(r"Prescribed\s+Elective", text, re.IGNORECASE))
        name_text = re.sub(r"Prescribed\s+Elective\^?", "", name_text, flags=re.IGNORECASE)

        # A merged TableFormer row is useful code evidence, but not enough to assign one combined title/prerequisite to several different codes.
        for code_index, code in enumerate(codes):
            name = _clean_candidate_name(name_text) if len(codes) == 1 else ""
            prerequisite = _clean_candidate_prereq(prereq_text) if len(codes) == 1 else None
            category, reason = _category(code, name, prerequisite, listing, prescribed)
            provenance = {
                "source": "docling",
                "page": page,
                "bbox": row["bbox"],
                "table_id": getattr(table, "id", None),
                "row_id": row["row_id"],
                "confidence": getattr(getattr(table, "cluster", None), "confidence", None),
            }
            if active_minor:
                sections[active_minor].append({
                    "unit_code": code,
                    "unit_name": name,
                    "prerequisite": prerequisite,
                    "offered_in": offered_text,
                })
                continue
            if code in seen:
                continue
            unit = {
                "year_level": year,
                "semester": semester,
                "category": category,
                "code": code,
                "name": name,
                "prerequisite": prerequisite,
                "offered_in": offered_text,
                "is_prescribed": category == "prescribed_elective",
                "section": None,
                "_provenance": {"unit_code": provenance, "unit_name": provenance, "category": {"source": reason}},
            }
            units.append(unit)
            seen.add(code)
            debug_rows[code] = {**provenance, "row": text, "category_reason": reason, "merged_codes": codes}
            last_unit = unit if code_index == len(codes) - 1 and len(codes) == 1 else None
    return rows

def extract_layout(pdf_path):
    """Convert a PDF into Docling layout data used to recover structural fields."""
    converter = _get_converter()
    started = time.perf_counter()
    conversion = converter.convert(str(pdf_path))
    conversion_seconds = time.perf_counter() - started
    document = conversion.document
    elements = [_element_record(element) for page in conversion.pages for element in page.assembled.elements]
    assembled_tables = [
        element for page in conversion.pages for element in page.assembled.elements
        if str(getattr(getattr(element, "label", None), "value", "")) == "table"
    ]

    units, sections, debug_rows, table_records = [], {}, {}, []
    seen = set()
    current_year = None
    listing = False
    used_table_ids = set()
    for item, _ in document.iterate_items(with_groups=False):
        label = str(getattr(getattr(item, "label", None), "value", ""))
        text = str(getattr(item, "text", "") or "").strip()
        if label == "section_header":
            current_year = _parse_year(text) or current_year
            listing = bool(re.search(r"Recommended\s+Elective|Elective\s+Unit\s+Listing", text, re.IGNORECASE))
            continue
        if label != "table":
            continue
        table = _match_assembled_table(item, assembled_tables, conversion.pages, used_table_ids)
        if table is None:
            continue
        rows = _table_units(
            table, getattr(table, "page_no", None), current_year, listing,
            units, sections, seen, debug_rows,
        )
        table_records.append({
            "table_id": getattr(table, "id", None),
            "page": getattr(table, "page_no", None),
            "bbox": _bbox(getattr(getattr(table, "cluster", None), "bbox", None)),
            "rows": len(rows),
            "columns": getattr(table, "num_cols", None),
            "cells": len(getattr(table, "table_cells", []) or []),
            "native_cells": len(_native_cells(table)),
        })
        listing = False

    source_text = clean_text(document.export_to_text())
    from_ocr_count = sum(
        1 for table in assembled_tables for cell in _native_cells(table) if cell["from_ocr"]
    )
    diagnostics = {
        "ocr_enabled": False,
        "ocr_cells": from_ocr_count,
        "layout_model": MODEL_INFO["layout"],
        "table_model": MODEL_INFO["table"],
        "model_load_seconds": _MODEL_LOAD_SECONDS,
        "conversion_seconds": conversion_seconds,
        "pipeline_cache_workaround": _CACHE_WORKAROUND,
        "pages": len(conversion.pages),
        "tables": len(table_records),
        "rows": sum(table["rows"] for table in table_records),
        "cells": sum(table["cells"] for table in table_records),
        "native_cells": sum(table["native_cells"] for table in table_records),
        "section_headings": sum(element["element_type"] == "section_header" for element in elements),
        "units_in_tables": len(units),
        "minor_sections": len(sections),
        "tables_detail": table_records,
    }
    return {
        "text": source_text,
        "elements": elements,
        "tables": table_records,
        "units": units,
        "elective_sections": sections,
        "debug_rows": debug_rows,
        "diagnostics": diagnostics,
    }

def extract_planner_with_diagnostics(pdf_path):
    """Return Docling planner candidates together with conversion diagnostics."""
    layout = extract_layout(pdf_path)
    result = assemble_json(
        Path(pdf_path).stem,
        extract_metadata(layout["text"]),
        extract_requirements(layout["text"]),
        layout["units"],
        layout["elective_sections"],
    )
    return result, layout["diagnostics"], layout

def extract_planner(pdf_path):
    """Return only Docling planner candidates for compatibility callers."""
    return extract_planner_with_diagnostics(pdf_path)[0]

# Targeted structural fallback application
def _valid_code(value):
    return CODE_TOKEN_RE.fullmatch(str(value or "").strip().upper()) is not None

def _valid_year(value):
    return isinstance(value, int) and 1 <= value <= 6

def _valid_semester(value):
    return isinstance(value, int) and 1 <= value <= 8

def _planned_category(category):
    return category in {"core", "major_core", "mpu", "wil"}

def _strong_docling_row(provenance):
    confidence = provenance.get("confidence")
    return (
        provenance.get("table_id") is not None and
        provenance.get("row_id") is not None and
        isinstance(confidence, (int, float)) and confidence >= 0.9
    )

def _category_count(data, category):
    return sum(current == category for current, _ in _iter_unit_refs(data))

def _deficit_categories(data):
    requirements = data.get("course_information", {}).get("requirements", {})
    deficits = set()
    for category, requirement_key in (("core", "core"), ("major_core", "major"),
                                      ("elective", "elective"), ("wil", "wil")):
        requirement = requirements.get(requirement_key)
        expected = requirement.get("count") if isinstance(requirement, dict) else None
        if isinstance(expected, int) and _category_count(data, category) < expected:
            deficits.add(category)
    return deficits

def structural_fallback_reasons(data, pdftext_diagnostics=()):
    """Identify unresolved structural gaps that justify invoking Docling."""
    """Return observable reasons for loading Docling; an empty list skips P3."""
    reasons = []
    for category, unit in _iter_unit_refs(data):
        code = str(unit.get("unit_code") or "").strip().upper()
        if not _valid_code(code) or not _planned_category(category):
            continue
        if not _valid_year(unit.get("year_level")):
            reasons.append("missing_or_invalid_year")
            break
    for category, unit in _iter_unit_refs(data):
        code = str(unit.get("unit_code") or "").strip().upper()
        if (_valid_code(code) and _planned_category(category) and
                not _valid_semester(unit.get("semester"))):
            reasons.append("missing_or_invalid_semester")
            break

    return list(dict.fromkeys(reasons))

def _docling_units(layout):
    return {
        str(unit.get("code") or "").strip().upper(): unit
        for unit in layout.get("units", [])
        if _valid_code(unit.get("code"))
    }

def _docling_provenance(unit):
    return unit.get("_provenance", {}).get("unit_code", {})

def _pdftext_category_evidence(data, pdf_path):
    """Learn category by colour cohort; never use Docling's category guess."""
    base_index = _unit_index(data)
    p1_index, duplicates = _p1_units(extract_pdftext_layout(pdf_path))
    fill_categories = _learn_fill_categories(base_index, p1_index)
    evidence = {}
    for code, candidate in p1_index.items():
        if code in duplicates:
            continue
        fill = _fill_key(candidate.get("_provenance", {}).get("category", {}).get("fill"))
        votes = fill_categories.get(fill, Counter())
        if len(votes) != 1:
            continue
        category, count = votes.most_common(1)[0]
        if count >= 2 and category in {"core", "major_core", "elective"}:
            evidence[code] = {
                "category": category,
                "reason": "unanimous_pdftext_fill_cohort",
                "support": count,
                "fill": fill,
            }
    return evidence

def _table_neighbour_count(code, layout, existing_codes):
    candidate = layout.get("debug_rows", {}).get(code, {})
    table_id = candidate.get("table_id")
    return sum(
        other_code in existing_codes and row.get("table_id") == table_id
        for other_code, row in layout.get("debug_rows", {}).items()
        if other_code != code
    )

def _proposal(field, code, current, candidate, status, confidence, reason, provenance):
    return {
        "field": field,
        "unit_code": code,
        "current_value": current,
        "candidate_value": candidate,
        "source": "docling",
        "confidence": confidence,
        "reason": reason,
        "status": status,
        **provenance,
    }

def build_docling_proposals(data, layout, category_evidence):
    """Build conservative replacements from Docling table evidence and current data."""
    """Build deterministic proposals without mutating P2."""
    base_index = _unit_index(data)
    existing_codes = set(base_index)
    minor_codes = _minor_codes(data)
    candidates = _docling_units(layout)
    proposals = []

    for code in sorted(candidates):
        candidate = candidates[code]
        provenance = _docling_provenance(candidate)
        if code in base_index:
            current_category, current = base_index[code]
            if not _planned_category(current_category):
                continue
            for field, validator in (("year_level", _valid_year), ("semester", _valid_semester)):
                old, new = current.get(field), candidate.get(field)
                if validator(old) or old == new:
                    continue
                accepted = validator(new) and _strong_docling_row(provenance)
                proposals.append(_proposal(
                    field, code, old, new,
                    "accepted" if accepted else "rejected",
                    0.96 if accepted else 0.3,
                    "same_docling_table_row_fills_invalid_value" if accepted else
                    "docling_structural_value_missing_or_invalid",
                    provenance,
                ))

            new_name = candidate.get("name")
            if (_looks_corrupted_existing_name(current.get("unit_name")) and new_name and
                    new_name != current.get("unit_name")):
                proposals.append(_proposal(
                    "unit_name", code, current.get("unit_name"), new_name, "rejected", 0.6,
                    "row_boundary_observation_only_name_locked", provenance,
                ))
            new_prerequisite = candidate.get("prerequisite")
            if new_prerequisite != current.get("prerequisite") and new_prerequisite:
                proposals.append(_proposal(
                    "prerequisite", code, current.get("prerequisite"), new_prerequisite,
                    "rejected", 0.6, "prerequisite_observation_only_field_locked", provenance,
                ))
            continue

        debug = layout.get("debug_rows", {}).get(code, {})
        evidence = category_evidence.get(code)
        name = str(candidate.get("name") or "").strip()
        reasons = []
        if code in minor_codes:
            reasons.append("existing_minor_unit_locked")
        if candidate.get("category") in {"mpu", "wil"}:
            reasons.append("mpu_and_wil_rows_locked")
        if _is_bad_unit_name(name) or len(name.split()) < 2:
            reasons.append("candidate_name_missing_or_low_quality")
        if debug.get("merged_codes") != [code]:
            reasons.append("docling_row_contains_multiple_unit_codes")
        if provenance.get("table_id") is None or provenance.get("row_id") is None:
            reasons.append("missing_docling_table_row_provenance")
        elif not _strong_docling_row(provenance):
            reasons.append("docling_row_confidence_below_threshold")
        if _table_neighbour_count(code, layout, existing_codes) < 2:
            reasons.append("insufficient_existing_neighbour_rows")
        if not evidence:
            reasons.append("no_independent_pdftext_colour_evidence")

        accepted = not reasons
        proposal = _proposal(
            "unit_code", code, None, code,
            "accepted" if accepted else "rejected",
            0.97 if accepted else 0.35,
            "docling_row_and_pdftext_colour_cohort_agree" if accepted else ";".join(reasons),
            provenance,
        )
        proposal.update({
            "action": "add_missing_unit",
            "unit_name": name,
            "year_level": candidate.get("year_level"),
            "semester": candidate.get("semester"),
            "prerequisite_candidate": candidate.get("prerequisite"),
            "category_evidence": evidence.get("category") if evidence else None,
            "category_reason": evidence.get("reason") if evidence else None,
        })
        proposals.append(proposal)
    return proposals

def _append_missing_unit(data, proposal):
    category = proposal["category_evidence"]
    target = data["categories"]
    for key in CATEGORY_GROUPS[category]:
        target = target[key]
    target.append({
        "year_level": proposal.get("year_level") if _valid_year(proposal.get("year_level")) else None,
        "semester": proposal.get("semester") if _valid_semester(proposal.get("semester")) else None,
        "category": category,
        "unit_code": proposal["unit_code"],
        "unit_name": proposal["unit_name"],
        # Prerequisites remain observations in this structural fallback.
        "prerequisite": None,
        "offered_in": None,
    })

def apply_docling_proposals(base_data, layout, category_evidence):
    """Apply accepted Docling proposals without overwriting stronger existing values."""
    """Apply only permitted structural changes and return a fresh result."""
    result = copy.deepcopy(base_data)
    original = copy.deepcopy(base_data)
    proposals = build_docling_proposals(result, layout, category_evidence)
    index = _unit_index(result)
    for proposal in proposals:
        if proposal["status"] != "accepted":
            continue
        code, field = proposal["unit_code"], proposal["field"]
        if proposal.get("action") == "add_missing_unit":
            _append_missing_unit(result, proposal)
            index = _unit_index(result)
        elif field in {"year_level", "semester"} and code in index:
            index[code][1][field] = proposal["candidate_value"]

    # Locked data must remain byte-for-byte equivalent after proposal application.
    assert result.get("course_information") == original.get("course_information")
    assert result.get("categories", {}).get("minor_groups") == original.get("categories", {}).get("minor_groups")
    original_index = _unit_index(original)
    result_index = _unit_index(result)
    for code, (category, unit) in original_index.items():
        new_category, new_unit = result_index[code]
        assert new_category == category
        for field in ("unit_code", "unit_name", "prerequisite", "offered_in", "category"):
            assert new_unit.get(field) == unit.get(field)
    return result, proposals

def apply_docling_structural_fallback(base_data, pdf_path, pdftext_diagnostics=()):
    """Run Docling for unresolved structure and return data, proposals, and diagnostics."""
    """Lazy entry point; Docling is loaded only after a structural trigger."""
    triggers = structural_fallback_reasons(base_data, pdftext_diagnostics)
    category_evidence = None
    if not triggers:
        rejected_codes = {
            str(item.get("unit_code") or "").strip().upper()
            for item in pdftext_diagnostics
            if item.get("field") == "unit_code" and item.get("current_value") is None and
            item.get("status") == "rejected" and _valid_code(item.get("unit_code"))
        }
        deficits = _deficit_categories(base_data)
        if rejected_codes and deficits:
            category_evidence = _pdftext_category_evidence(base_data, pdf_path)
            if any(category_evidence.get(code, {}).get("category") in deficits for code in rejected_codes):
                triggers.append("matching_count_deficit_and_pdftext_colour_row")
    if not triggers:
        return copy.deepcopy(base_data), [], {
            "invoked": False, "triggers": [], "model_load_seconds": 0.0,
            "conversion_seconds": 0.0, "ocr_enabled": False, "ocr_cells": 0,
        }

    try:
        layout = extract_layout(pdf_path)
    except Exception as exc:
        return copy.deepcopy(base_data), [], {
            "invoked": True,
            "available": False,
            "status": "unavailable",
            "triggers": triggers,
            "error": f"Docling fallback unavailable: {exc}",
            "model_load_seconds": get_model_load_seconds(),
            "conversion_seconds": 0.0,
            "ocr_enabled": False,
            "ocr_cells": 0,
        }
    category_evidence = category_evidence or _pdftext_category_evidence(base_data, pdf_path)
    result, proposals = apply_docling_proposals(base_data, layout, category_evidence)
    diagnostics = dict(layout["diagnostics"])
    diagnostics.update({"invoked": True, "triggers": triggers})
    return result, proposals, diagnostics
