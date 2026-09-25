import copy
import ctypes
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
from pdftext.extraction import dictionary_output
from plannerPdfEvidence import UNIT_MARKER_RE, _normalise_semester_number
from plannerPdfRequirements import extract_metadata, extract_requirements
from plannerPdfTextRules import (
    _canonical_minor_section_name,
    clean_text,
    _clean_candidate_name,
    _clean_candidate_prereq,
    _looks_like_minor_section_header,
    _looks_like_sidebar_footer_noise,
    _looks_like_wil_text,
    _name_quality_score,
    _split_prereq_and_offered,
    _strip_unit_markers,
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

# ============================================================
# STEP 1: Prepare PDFText evidence primitives
# ============================================================
# PDFText fallback recovers row and column evidence when the primary extractor leaves gaps.
# Candidate values are matched to unit codes and accepted only when they improve current data.
CODE_ROW_RE = re.compile(
    rf"^\s*(?P<code>[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?)\s+(?P<body>.+)$",
    re.IGNORECASE,
)
YEAR_RE = re.compile(r"\bYear\s+(One|Two|Three|Four|Five|\d+)\b", re.IGNORECASE)
SEMESTER_RE = re.compile(r"\bSemester\s+(\d+)\b", re.IGNORECASE)
YEAR_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
PREREQ_START_RE = re.compile(
    r"\b(?:Nil|Concurrent|Co-?req(?:uisite)?|Pre-?req(?:uisite)?|Anti-?req(?:uisite)?|"
    r"\d+(?:\.\d+)?\s*(?:CPs?|credit\s+points?)|[A-Z]{3}\d{3,5})\b",
    re.IGNORECASE,
)
OFFERED_RE = re.compile(
    r"\b(?:Feb/Mar|Aug/Sept|Semester\s+[12])(?:\s*&\s*(?:Feb/Mar|Aug/Sept|(?:Semester\s+)?[12]))?(?:\s+only)?\b",
    re.IGNORECASE,
)
SECTION_STOP_RE = re.compile(
    r"^(?:Notes?|Course Information|How to use|Recommended Elective|Year\s+"
    r"(?:One|Two|Three|Four|Five|\d+)|Semester\s+\d+|Summer(?:\s+Term)?|Winter(?:\s+Term)?)\b",
    re.IGNORECASE,
)

# Normalize text returned by PDFText.
def _normalise_source_text(text):
    text = str(text or "").replace("\ufffd", "-")
    return re.sub(r"\s+", " ", text).strip()

# Return one box covering all supplied boxes.
def _bbox_union(boxes):
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )

# Measure the intersection area of two boxes.
def _overlap_area(a, b):
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return width * height

# Measure the distance between two fill colours.
def _colour_distance(left, right):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))

# Extract filled PDFium paths for layout evidence.
def _pdfium_fills(pdf_path):
    pages = []
    document = pdfium.PdfDocument(str(pdf_path))
    try:
        for page_index in range(len(document)):
            page = document[page_index]
            page_height = float(page.get_height())
            fills = []
            for obj in page.get_objects(filter=[pdfium_raw.FPDF_PAGEOBJ_PATH]):
                channels = [ctypes.c_uint() for _ in range(4)]
                ok = pdfium_raw.FPDFPageObj_GetFillColor(
                    obj.raw, *(ctypes.byref(channel) for channel in channels)
                )
                if not ok or channels[3].value == 0:
                    continue
                left, bottom, right, top = obj.get_bounds()
                bbox = (float(left), page_height - float(top), float(right), page_height - float(bottom))
                if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
                    continue
                fills.append({
                    "bbox": bbox,
                    "fill": tuple(round(channel.value / 255.0, 4) for channel in channels[:3]),
                    "source": "pdfium_path",
                })
            pages.append(fills)
    finally:
        document.close()
    return pages

# Build the neutral page/block/line/span representation from PDFText.
def extract_intermediate(pdf_path, sort=False, keep_chars=False):
    raw_pages = dictionary_output(
        str(pdf_path), sort=sort, page_range=None, keep_chars=keep_chars
    )
    fills_by_page = _pdfium_fills(pdf_path)
    pages = []
    for page_index, raw_page in enumerate(raw_pages):
        width = float(raw_page.get("width") or raw_page["bbox"][2])
        height = float(raw_page.get("height") or raw_page["bbox"][3])
        blocks = []
        for block_id, raw_block in enumerate(raw_page.get("blocks", [])):
            lines = []
            for line_id, raw_line in enumerate(raw_block.get("lines", [])):
                spans = []
                for span_id, raw_span in enumerate(raw_line.get("spans", [])):
                    text = _normalise_source_text(raw_span.get("text"))
                    if not text:
                        continue
                    bbox = tuple(float(value) for value in raw_span.get("bbox", raw_line.get("bbox")))
                    font = raw_span.get("font") or {}
                    span = {
                        "text": text,
                        "bbox": bbox,
                        "normalized_bbox": (
                            bbox[0] / width, bbox[1] / height,
                            bbox[2] / width, bbox[3] / height,
                        ),
                        "page": page_index + 1,
                        "block_id": block_id,
                        "line_id": line_id,
                        "span_id": span_id,
                        "font_name": font.get("name"),
                        "font_size": font.get("size"),
                        "font_weight": font.get("weight"),
                        "rotation": raw_span.get("rotation", raw_page.get("rotation", 0)),
                    }
                    if keep_chars and raw_span.get("chars"):
                        span["chars"] = raw_span["chars"]
                    spans.append(span)
                if not spans:
                    continue
                bbox = _bbox_union([span["bbox"] for span in spans])
                lines.append({
                    "text": " ".join(span["text"] for span in spans),
                    "bbox": bbox,
                    "page": page_index + 1,
                    "block_id": block_id,
                    "line_id": line_id,
                    "spans": spans,
                })
            if lines:
                blocks.append({
                    "bbox": _bbox_union([line["bbox"] for line in lines]),
                    "page": page_index + 1,
                    "block_id": block_id,
                    "lines": lines,
                })
        pages.append({
            "page": page_index + 1,
            "width": width,
            "height": height,
            "rotation": raw_page.get("rotation", 0),
            "blocks": blocks,
            "fills": fills_by_page[page_index] if page_index < len(fills_by_page) else [],
        })
    return pages

# ============================================================
# STEP 2: Read layout, fills, and legend evidence
# ============================================================
# Map a legend line to its category label.
def _category_label(text):
    lowered = text.lower()
    if "work-integrated" in lowered or "work integrated" in lowered or "industry placement" in lowered:
        return "wil"
    if "first major" in lowered or "discipline unit" in lowered or re.search(r"\bmajor units?\b", lowered):
        return "major"
    if "component unit" in lowered or "elective unit" in lowered:
        return "elective"
    if re.search(r"\bcore units?\b", lowered):
        return "core"
    return None

# Find the fill with the greatest overlap with a box.
def _fill_for_bbox(bbox, fills):
    candidates = []
    for fill in fills:
        overlap = _overlap_area(bbox, fill["bbox"])
        if overlap > 0:
            candidates.append((overlap, fill["bbox"][2] - fill["bbox"][0], fill["fill"]))
    coloured = [item for item in candidates if item[2] != (1.0, 1.0, 1.0)]
    return max(coloured or candidates, default=(0, 0, None))[2]

# Learn category fills from PDFText legend lines.
def _discover_colour_legend(pages):
    legend = {}
    for page in pages:
        for block in page["blocks"]:
            for line in block["lines"]:
                category = _category_label(line["text"])
                if not category:
                    continue
                fill = _fill_for_bbox(line["bbox"], page["fills"])
                if fill is not None:
                    legend.setdefault(fill, category)
    return legend

# Match a row fill to the learned category legend.
def _category_from_fill(bbox, fills, legend):
    fill = _fill_for_bbox(bbox, fills)
    if fill is None or not legend:
        return None, fill
    known, category = min(legend.items(), key=lambda item: _colour_distance(fill, item[0]))
    distance = _colour_distance(fill, known)
    return (category if distance <= 0.14 else None), fill

# Find the boundary before a right-hand information sidebar.
def _content_right(page):
    candidates = []
    for block in page["blocks"]:
        text = " ".join(line["text"] for line in block["lines"])
        if re.search(r"\bCourse\s+Information\b", text, re.IGNORECASE):
            left = block["bbox"][0]
            if left > page["width"] * 0.45:
                candidates.append(left)
    return min(candidates) if candidates else None

# Parse a year header from a line of text.
def _parse_year(text):
    match = YEAR_RE.search(text)
    if not match:
        return None
    value = match.group(1).lower()
    return int(value) if value.isdigit() else YEAR_WORDS.get(value)

# Parse a semester or special-term header.
def _parse_semester(text):
    match = SEMESTER_RE.search(text)
    if match:
        return _normalise_semester_number(match.group(1)), int(match.group(1))
    if re.search(r"\bSummer(?:\s+Term)?\b", text, re.IGNORECASE):
        return 3, None
    if re.search(r"\bWinter(?:\s+Term)?\b", text, re.IGNORECASE):
        return 4, None
    return None, None

# Parse a PDFText row into name, prerequisite, and offered-in fields.
def _parse_row(code, body):
    body = _normalise_source_text(body)
    prescribed = bool(re.search(r"\bPrescribed\s+Elective\^?", body, re.IGNORECASE))
    body = re.sub(r"\bPrescribed\s+Elective\^?", " ", body, flags=re.IGNORECASE).strip()
    offered_match = OFFERED_RE.search(body)
    offered = offered_match.group(0) if offered_match else None
    if offered_match:
        body = (body[:offered_match.start()] + " " + body[offered_match.end():]).strip()
    prerequisite_match = PREREQ_START_RE.search(body)
    if prerequisite_match:
        name = body[:prerequisite_match.start()].strip(" -|,")
        prerequisite = body[prerequisite_match.start():].strip(" -|,")
    else:
        name, prerequisite = body, None
    if prerequisite and offered is None:
        prerequisite, offered = _split_prereq_and_offered(prerequisite)
    return (
        _clean_candidate_name(name),
        _clean_candidate_prereq(prerequisite),
        offered,
        prescribed,
    )

# Check whether a line can continue the current row.
def _is_continuation(line):
    text = line["text"].strip()
    return bool(
        text
        and not CODE_ROW_RE.match(text)
        and not SECTION_STOP_RE.search(text)
        and not _looks_like_sidebar_footer_noise(text)
    )

# Parse PDFText geometry into planner rows, headers, and category evidence.
def extract_layout(pdf_path, sort=False, keep_chars=False):
    pages = extract_intermediate(pdf_path, sort=sort, keep_chars=keep_chars)
    legend = _discover_colour_legend(pages)
    source_lines = [line["text"] for page in pages for block in page["blocks"] for line in block["lines"]]
    source_text = clean_text("\n".join(source_lines))
    units = []
    sections = {}
    debug_rows = {}
    seen = set()
    current_year = None
    current_semester = None
    planner_semester = None

    for page in pages:
        page_heading = " ".join(
            line["text"] for block in page["blocks"][:4] for line in block["lines"][:3]
        )
        listing_page = bool(re.search(r"\bElective\s+Unit\s+Listing\b", page_heading, re.IGNORECASE))
        right = _content_right(page)
        page_lines = [line for block in page["blocks"] for line in block["lines"]]
        active_section = None
        for block in page["blocks"]:
            if right is not None and block["bbox"][0] >= right:
                continue
            block_year = current_year
            block_semester = current_semester
            lines = block["lines"]
            for line_index, line in enumerate(lines):
                text = line["text"].strip()
                year = _parse_year(text)
                if year is not None:
                    current_year = block_year = year
                semester, raw_semester = _parse_semester(text)
                if semester is not None:
                    current_semester = block_semester = semester
                    planner_semester = raw_semester
                    if block_year is None and raw_semester:
                        block_year = max(1, (raw_semester + 1) // 2)
                if _looks_like_minor_section_header(text):
                    active_section = _canonical_minor_section_name(text)
                    sections.setdefault(active_section, [])
                    continue
                if active_section and SECTION_STOP_RE.search(text):
                    active_section = None

                split_mpu = re.match(r"^(MPU\d{3})\s+([23])(?:\s+(.*))?$", text, re.IGNORECASE)
                if split_mpu:
                    text = (split_mpu.group(1) + split_mpu.group(2) + " " + (split_mpu.group(3) or "")).strip()
                match = CODE_ROW_RE.match(text)
                code_only = CODE_TOKEN_RE.fullmatch(text)
                if not match and not code_only:
                    continue
                raw_code = match.group("code") if match else text
                if not CODE_TOKEN_RE.match(raw_code):
                    continue
                code = _strip_unit_markers(raw_code)
                continuation = []
                for next_line in lines[line_index + 1:line_index + 4]:
                    if not _is_continuation(next_line):
                        break
                    continuation.append(next_line)
                if code_only and not continuation:
                    same_row = [
                        candidate for candidate in page_lines
                        if candidate is not line
                        and candidate["bbox"][0] >= line["bbox"][2] - 2
                        and _overlap_area(
                            line["bbox"],
                            (line["bbox"][0], candidate["bbox"][1], candidate["bbox"][2], candidate["bbox"][3]),
                        ) > 0
                        and not CODE_ROW_RE.match(candidate["text"])
                    ]
                    if same_row:
                        continuation.append(min(same_row, key=lambda candidate: candidate["bbox"][0]))
                body = " ".join(
                    ([match.group("body")] if match else []) +
                    [item["text"] for item in continuation]
                )
                if not body:
                    continue
                name, prerequisite, offered, prescribed = _parse_row(code, body)

                if active_section:
                    sections[active_section].append({
                        "unit_code": code,
                        "unit_name": name,
                        "prerequisite": prerequisite,
                        "offered_in": offered,
                    })
                    continue
                if listing_page or code in seen:
                    continue

                category, fill = _category_from_fill(line["bbox"], page["fills"], legend)
                reason = "pdfium_fill" if category else "fallback"
                if code.startswith("MPU"):
                    category, reason = "mpu", "unit_code_prefix"
                elif _looks_like_wil_text(name + " " + (prerequisite or "")):
                    category, reason = "wil", "wil_text"
                elif prescribed:
                    category, reason = "prescribed_elective", "row_marker"
                elif category is None:
                    category = "elective"

                unit = {
                    "year_level": block_year,
                    "semester": block_semester,
                    "category": category,
                    "code": code,
                    "name": name,
                    "prerequisite": prerequisite,
                    "offered_in": offered,
                    "is_prescribed": category == "prescribed_elective",
                    "section": None,
                    "_provenance": {
                        "unit_code": {
                            "page": page["page"], "bbox": line["bbox"],
                            "block": block["block_id"], "line": line["line_id"],
                        },
                        "unit_name": {
                            "page": page["page"], "bbox": line["bbox"],
                        },
                        "category": {"source": reason, "fill": fill},
                    },
                }
                units.append(unit)
                seen.add(code)
                debug_rows[code] = {
                    "page": page["page"],
                    "block": block["block_id"],
                    "line": line["line_id"],
                    "bbox": line["bbox"],
                    "row": raw_code + " " + body,
                    "continuation": [item["text"] for item in continuation],
                    "category": category,
                    "category_reason": reason,
                    "fill": fill,
                    "year": block_year,
                    "semester": block_semester,
                    "planner_semester": planner_semester,
                }

    return {
        "pages": pages,
        "text": source_text,
        "legend": legend,
        "units": units,
        "elective_sections": sections,
        "debug_rows": debug_rows,
    }

# Return the PDFText-derived planner structure used by fallback recovery.
def extract_planner(pdf_path, sort=False):
    layout = extract_layout(pdf_path, sort=sort)
    return assemble_json(
        Path(pdf_path).stem,
        extract_metadata(layout["text"]),
        extract_requirements(layout["text"]),
        layout["units"],
        layout["elective_sections"],
    )
CATEGORY_GROUPS = {
    "core": ("core_units",),
    "major_core": ("major_units",),
    "elective": ("elective_groups", "elective"),
    "prescribed_elective": ("elective_groups", "prescribed_elective"),
    "mpu": ("mpu_group",),
    "wil": ("wil_group",),
}
NOISE_RE = re.compile(
    r"\b(?:students?|semester|course|module|electives?|exemptions?|foundation|"
    r"recommended|availability|registered|completion|period|at the end)\b",
    re.IGNORECASE,
)

# ============================================================
# STEP 3: Build planner candidates from the evidence
# ============================================================
# Yield main planner units with their category names.
# STEP 4: Check candidate quality and deficits
def _iter_unit_refs(data):
    categories = data.get("categories", {})
    for category, path in CATEGORY_GROUPS.items():
        value = categories
        for key in path:
            value = value.get(key, {}) if isinstance(value, dict) else []
        for unit in value if isinstance(value, list) else []:
            if isinstance(unit, dict):
                yield category, unit

# Index current planner units by code.
def _unit_index(data):
    return {
        str(unit.get("unit_code") or "").strip().upper(): (category, unit)
        for category, unit in _iter_unit_refs(data)
        if unit.get("unit_code")
    }

# Collect unit codes already owned by minor groups.
def _minor_codes(data):
    groups = data.get("categories", {}).get("minor_groups", [])
    return {
        str(unit.get("unit_code") or "").strip().upper()
        for group in groups if isinstance(group, dict)
        for unit in group.get("units", []) if isinstance(unit, dict) and unit.get("unit_code")
    }

# Normalize a fill colour for comparison.
def _fill_key(value):
    if not isinstance(value, (tuple, list)) or len(value) < 3:
        return None
    return tuple(round(float(channel), 3) for channel in value[:3])

# Index PDFText units and record duplicate anchors.
def _p1_units(layout):
    result = {}
    duplicates = set()
    for unit in layout.get("units", []):
        code = str(unit.get("code") or "").strip().upper()
        if not code:
            continue
        if code in result:
            duplicates.add(code)
        result[code] = unit
    return result, duplicates

# Learn category mappings from fills shared with existing units.
def _learn_fill_categories(base_index, p1_index):
    evidence = defaultdict(Counter)
    for code, (category, _) in base_index.items():
        candidate = p1_index.get(code)
        if not candidate:
            continue
        fill = _fill_key(candidate.get("_provenance", {}).get("category", {}).get("fill"))
        if fill is not None:
            evidence[fill][category] += 1
    return evidence

# Check whether a missing PDFText row is safe to consider.
def _reliable_missing_candidate(code, candidate, base_index, minor_codes, duplicates):
    name = candidate.get("name")
    return (
        code not in base_index and
        code not in minor_codes and
        CODE_TOKEN_RE.fullmatch(code) is not None and
        code not in duplicates and
        not _is_bad_unit_name(name) and
        len(str(name or "").split()) >= 2
    )

# Map an unmapped fill only when its whole cohort closes one count deficit.
def _learn_missing_fill_categories(base_index, p1_index, minor_codes, duplicates, data):
    cohorts = defaultdict(list)
    for code, candidate in p1_index.items():
        if not _reliable_missing_candidate(
            code, candidate, base_index, minor_codes, duplicates
        ):
            continue
        fill = _fill_key(candidate.get("_provenance", {}).get("category", {}).get("fill"))
        if fill is not None:
            cohorts[fill].append(code)

    inferred = {}
    for fill, codes in cohorts.items():
        if len(codes) < 2:
            continue
        matches = [
            category for category in ("core", "major_core", "elective")
            if _requirement_deficit(data, category) == len(codes)
        ]
        if len(matches) == 1:
            inferred[fill] = matches[0]
    return inferred

# Measure the remaining count deficit for one category.
def _requirement_deficit(data, category):
    requirement_key = {
        "core": "core", "major_core": "major", "elective": "elective", "wil": "wil"
    }.get(category)
    if not requirement_key:
        return 0
    requirement = data.get("course_information", {}).get("requirements", {}).get(requirement_key)
    expected = requirement.get("count") if isinstance(requirement, dict) else None
    if not isinstance(expected, int):
        return 0
    current = sum(1 for current_category, _ in _iter_unit_refs(data) if current_category == category)
    return max(0, expected - current)

# Propose a category only from fill and requirement evidence.
def _category_proposal(candidate, fill_categories, missing_fill_categories, data):
    fill = _fill_key(candidate.get("_provenance", {}).get("category", {}).get("fill"))
    votes = fill_categories.get(fill, Counter())
    if not votes:
        category = missing_fill_categories.get(fill)
        if category and _requirement_deficit(data, category) > 0:
            return category, "same_fill_cohort_exactly_matches_requirement_deficit"
        return None, "no_matching_p0_fill_evidence"
    category, count = votes.most_common(1)[0]
    if count < 2 or len(votes) != 1:
        return None, "fill_category_not_unanimous"
    if _requirement_deficit(data, category) <= 0:
        return None, "no_requirement_count_deficit"
    return category, "unanimous_fill_mapping_and_requirement_deficit"

# Validate a PDFText name replacement against the current name.
def _clean_name_candidate(old_name, new_name, candidate):
    old = re.sub(r"\s+", " ", str(old_name or "")).strip()
    new = re.sub(r"\s+", " ", str(new_name or "")).strip()
    if not old or not new or old == new or _is_bad_unit_name(new):
        return False, "candidate_name_missing_or_low_quality"
    if candidate.get("code", "").startswith("MPU") or candidate.get("category") == "wil":
        return False, "mpu_and_wil_names_locked"

    old_words = set(re.findall(r"[a-z]+", old.lower()))
    new_words = set(re.findall(r"[a-z]+", new.lower()))
    overlap = len(old_words & new_words) / max(1, len(new_words))
    suspicious = _looks_corrupted_existing_name(old) or NOISE_RE.search(old)
    prefix_boundary = old.lower().startswith(new.lower())
    suffix_words = re.findall(r"[a-z]+", old[len(new):].lower()) if prefix_boundary else []
    strong_boundary = prefix_boundary and (
        NOISE_RE.search(old[len(new):]) is not None or
        (len(new_words) >= 2 and bool(new_words & set(suffix_words)))
    )
    supported_boundary = bool(candidate.get("prerequisite")) and prefix_boundary
    if overlap < 0.8:
        return False, "candidate_does_not_match_existing_name"
    if not suspicious and not supported_boundary:
        return False, "existing_name_not_suspicious"
    if len(new) < len(old) * 0.35 and not strong_boundary:
        return False, "candidate_name_too_short"
    if _name_quality_score(new) <= 0:
        return False, "candidate_name_quality_not_improved"
    reason = (
        "same_code_block_with_strong_contamination_boundary"
        if strong_boundary else "same_code_block_and_cleaner_overlapping_name"
    )
    return True, reason

# ============================================================
# STEP 5: Apply safe fallback proposals
# ============================================================
# Append a validated missing unit to its category group.
def _append_unit(data, category, candidate):
    target = data["categories"]
    for key in CATEGORY_GROUPS[category]:
        target = target[key]
    target.append({
        "year_level": None,
        "semester": None,
        "category": category,
        "unit_code": candidate["code"],
        "unit_name": candidate.get("name") or "",
        "prerequisite": None,
        "offered_in": None,
    })

# Recover missing or suspicious fields from PDFText without replacing valid data.
def apply_pdftext_fallback(base_data, pdf_path, sort=False):
    result = copy.deepcopy(base_data)
    layout = extract_layout(pdf_path, sort=sort)
    base_index = _unit_index(result)
    minor_codes = _minor_codes(result)
    p1_index, duplicates = _p1_units(layout)
    fill_categories = _learn_fill_categories(base_index, p1_index)
    missing_fill_categories = _learn_missing_fill_categories(
        base_index, p1_index, minor_codes, duplicates, result
    )
    diagnostics = []

    for code, candidate in p1_index.items():
        if code in base_index:
            old_name = base_index[code][1].get("unit_name")
            new_name = candidate.get("name")
            if old_name == new_name:
                continue
            accepted, reason = _clean_name_candidate(old_name, new_name, candidate)
            proposal = {
                "field": "unit_name",
                "unit_code": code,
                "current_value": old_name,
                "candidate_value": new_name,
                "source": "pdftext",
                "confidence": 0.94 if accepted else 0.45,
                "reason": reason,
                **candidate.get("_provenance", {}).get("unit_code", {}),
                "status": "accepted" if accepted else "rejected",
            }
            diagnostics.append(proposal)
            if accepted:
                base_index[code][1]["unit_name"] = new_name
            continue

        if code in minor_codes:
            diagnostics.append({
                "field": "unit_code", "unit_code": code,
                "current_value": code, "candidate_value": code,
                "source": "pdftext", "confidence": 0.0,
                "reason": "existing_minor_unit_locked", "status": "rejected",
                **candidate.get("_provenance", {}).get("unit_code", {}),
            })
            continue

        if not CODE_TOKEN_RE.fullmatch(code) or code in duplicates:
            diagnostics.append({
                "field": "unit_code", "unit_code": code,
                "current_value": None, "candidate_value": code,
                "source": "pdftext", "confidence": 0.2,
                "reason": "invalid_or_non_unique_candidate", "status": "rejected",
            })
            continue
        if _is_bad_unit_name(candidate.get("name")) or len(str(candidate.get("name") or "").split()) < 2:
            diagnostics.append({
                "field": "unit_code", "unit_code": code,
                "current_value": None, "candidate_value": code,
                "source": "pdftext", "confidence": 0.35,
                "reason": "missing_unit_has_no_reliable_name", "status": "rejected",
                **candidate.get("_provenance", {}).get("unit_code", {}),
            })
            continue
        category, reason = _category_proposal(
            candidate, fill_categories, missing_fill_categories, result
        )
        accepted = category is not None
        diagnostics.append({
            "field": "unit_code", "unit_code": code,
            "current_value": None, "candidate_value": code,
            "source": "pdftext", "confidence": 0.96 if accepted else 0.4,
            "reason": reason, "status": "accepted" if accepted else "rejected",
            "category_evidence": category,
            **candidate.get("_provenance", {}).get("unit_code", {}),
        })
        if accepted:
            _append_unit(result, category, candidate)
            base_index = _unit_index(result)

    return result, diagnostics