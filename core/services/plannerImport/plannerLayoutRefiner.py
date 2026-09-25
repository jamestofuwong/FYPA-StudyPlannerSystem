import copy
import re
import statistics
import pdfplumber
from collections import Counter, defaultdict
from plannerStructureAssembler import iter_units
from plannerPdfEvidence import (
    _colour_dist,
    _extract_line_headers,
    _normalise_rgb,
    _normalise_semester_number,
)
from plannerPdfTextRules import (
    _clean_candidate_name,
    _clean_candidate_prereq,
    _looks_like_sidebar_footer_noise,
)
from plannerExtractionQuality import validate_planner

# ============================================================
# STEP 1: Prepare shared layout evidence
# ============================================================
# Geometry-based refinements reconnect extracted text with planner rows, headers, and columns.
# Candidates are accepted only when their structural quality is no worse than current data.

CODE_RE = re.compile(r"^[A-Z]{3}\d{3,5}[*#\u2020]*$", re.IGNORECASE)
TRAILING_CONNECTOR_RE = re.compile(r"(?:\b(?:and|or)\b|[&,/])\s*$", re.IGNORECASE)
PREREQ_BOUNDARY_NOISE_RE = re.compile(
    r"\b(?:Semester\s+\d+|Pre-?requisites?|Program Planner|Course Information|"
    r"Unit Name|Unit Code)\b|\b(?:equivalent\s+Nil|of\s+Semester)\b",
    re.IGNORECASE,
)

# Normalize a unit-code anchor for layout matching.
def _normalise_code(text):
    return re.sub(r"[*#\u2020]+$", "", str(text or "").strip().upper())

# Group words using a tolerance derived from the page's median glyph height.
def _lines(words):
    if not words:
        return []
    tolerance = max(1.5, statistics.median(w["bottom"] - w["top"] for w in words) * 0.35)
    grouped = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        middle = (word["top"] + word["bottom"]) / 2
        if not grouped or abs(middle - grouped[-1][0]) > tolerance:
            grouped.append([middle, [word]])
        else:
            grouped[-1][1].append(word)
            grouped[-1][0] = sum(
                (item["top"] + item["bottom"]) / 2 for item in grouped[-1][1]
            ) / len(grouped[-1][1])
    return grouped

# Find the visible header column boundaries.
def _header_columns(line_words):
    ordered = sorted(line_words, key=lambda item: item["x0"])
    texts = [word["text"].lower().strip(" :") for word in ordered]
    code_at = next((i for i, text in enumerate(texts) if text == "code"), None)
    name_at = next((i for i, text in enumerate(texts) if text in {"name", "title"}), None)
    prereq_at = next((i for i, text in enumerate(texts) if re.match(r"pre-?req", text)), None)
    if code_at is None or name_at is None or prereq_at is None:
        return None
    return ordered[code_at]["x0"], ordered[name_at]["x0"], ordered[prereq_at]["x0"]

# Check whether a word lies inside a bounding box.
def _inside(word, bbox):
    middle_x = (word["x0"] + word["x1"]) / 2
    middle_y = (word["top"] + word["bottom"]) / 2
    return bbox[0] <= middle_x <= bbox[2] and bbox[1] <= middle_y <= bbox[3]

# Collect separator evidence from cells, vector edges, lines, and rect edges.
def _separator_positions(page, table):
    left, top, right, bottom = table.bbox
    support = Counter()
    for row in table.rows:
        for cell in row.cells:
            if cell:
                support[round(cell[0], 2)] += 2
                support[round(cell[2], 2)] += 2
    for edge in page.edges:
        if edge.get("orientation") != "v":
            continue
        x = float(edge["x0"])
        if left <= x <= right and edge["bottom"] >= top and edge["top"] <= bottom:
            support[round(x, 2)] += 1
    for line in page.lines:
        if abs(line["x1"] - line["x0"]) <= 1 and left <= line["x0"] <= right:
            support[round(float(line["x0"]), 2)] += 1
    for rect in page.rects:
        if rect["bottom"] < top or rect["top"] > bottom:
            continue
        support[round(float(rect["x0"]), 2)] += 1
        support[round(float(rect["x1"]), 2)] += 1
    return support

# Choose the separator best supported by the table geometry.
def _choose_separator(support, lower, upper):
    choices = [(count, -abs(x - (lower + upper) / 2), x)
               for x, count in support.items() if lower < x < upper]
    return max(choices)[2] if choices else None

# Build row, column, fill, and separator context for a table.
def _table_context(page, table, words):
    table_words = [word for word in words if _inside(word, table.bbox)]
    header = next(
        ((middle, columns) for middle, line_words in _lines(table_words)
         if (columns := _header_columns(line_words)) is not None),
        None,
    )
    if not header:
        return None
    header_y, (code_x, name_x, prereq_x) = header
    support = _separator_positions(page, table)
    code_name = _choose_separator(support, code_x, name_x)
    name_prereq = _choose_separator(support, name_x, prereq_x)
    if code_name is None or name_prereq is None or code_name >= name_prereq:
        return None
    return header_y, code_name, name_prereq

# Find the table row containing a unit-code anchor.
def _row_for_anchor(table, anchor):
    middle_y = (anchor["top"] + anchor["bottom"]) / 2
    for row in table.rows:
        if row.bbox[1] <= middle_y <= row.bbox[3] and len([cell for cell in row.cells if cell]) >= 3:
            return row
    return None

# Read the background fill covering a bounding box.
def _background_fill(page, bbox):
    middle_x = (bbox[0] + bbox[2]) / 2
    middle_y = (bbox[1] + bbox[3]) / 2
    matches = [
        rect for rect in page.rects
        if rect.get("non_stroking_color") is not None
        and rect["x0"] <= middle_x <= rect["x1"]
        and rect["top"] <= middle_y <= rect["bottom"]
        and rect["width"] > 2 and rect["height"] > 2
    ]
    if not matches:
        return None
    rect = min(matches, key=lambda item: item["width"] * item["height"])
    return _normalise_rgb(rect.get("non_stroking_color"))

# Check whether two words share compatible row fill evidence.
def _compatible_fill(page, anchor, word):
    anchor_fill = _background_fill(page, (anchor["x0"], anchor["top"], anchor["x1"], anchor["bottom"]))
    word_fill = _background_fill(page, (word["x0"], word["top"], word["x1"], word["bottom"]))
    return anchor_fill is None or word_fill is None or _colour_dist(anchor_fill, word_fill) <= 0.08

# Convert fill evidence into a stable comparison key.
def _fill_key(fill):
    return tuple(round(value, 3) for value in fill) if fill else None

# Find a matching structural header above a row.
def _header_above(headers, header_type, row_bbox, max_gap=180):
    values = [
        header for header in headers
        if header["type"] == header_type
        and 0 <= row_bbox[1] - header["top"] <= max_gap
        and min(row_bbox[2], header["x1"]) >= max(row_bbox[0], header["x0"])
    ]
    return max(values, key=lambda header: header["top"])["value"] if values else None

# Map a legend label to the canonical category name.
def _category_from_label(text):
    text = str(text or "")
    if re.search(r"General Studies|Mata Pelajaran|\bMPU\b", text, re.IGNORECASE):
        return "mpu"
    if re.search(r"Work-?Integrated|\bWIL\b|Industry (?:Training|Placement)|Professional Experience", text, re.IGNORECASE):
        return "wil"
    if re.search(r"\b(?:Major|Discipline)\s+Units?\b", text, re.IGNORECASE):
        return "major_core"
    if re.search(r"\b(?:Elective|Component)\s+Units?\b", text, re.IGNORECASE):
        return "elective"
    if re.search(r"\bCore\s+Units?\b", text, re.IGNORECASE):
        return "core"
    return None

# Learn category fills from the planner legend.
def _legend_fill_categories(page, words, tables):
    votes = defaultdict(Counter)
    for rect in page.rects:
        fill = _fill_key(_normalise_rgb(rect.get("non_stroking_color")))
        if not fill or rect["width"] < page.width * 0.08 or rect["height"] < 6:
            continue
        if any(
            max(0, min(rect["x1"], table.bbox[2]) - max(rect["x0"], table.bbox[0]))
            * max(0, min(rect["bottom"], table.bbox[3]) - max(rect["top"], table.bbox[1]))
            > rect["width"] * rect["height"] * 0.5
            for table in tables
        ):
            continue
        label = " ".join(word["text"] for word in words if _inside(word, (
            rect["x0"], rect["top"], rect["x1"], rect["bottom"]
        )))
        category = _category_from_label(label)
        if category:
            votes[fill][category] += 1
    return {
        fill: counts.most_common(1)[0][0]
        for fill, counts in votes.items()
        if len(counts) == 1
    }

# Apply the layout refiner's name cleanup to a candidate.
def _clean_name(text):
    text = re.sub(r"\s*[\[(][^\])]*[\])]", "", str(text or ""))
    return _clean_candidate_name(text)

# Collect unit-row candidates with geometric evidence.
def _row_candidates(pdf_path):
    candidates = defaultdict(list)
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(x_tolerance=1, y_tolerance=1)
            tables = page.find_tables()
            headers = _extract_line_headers(words)
            legend_categories = _legend_fill_categories(page, words, tables)
            for table_number, table in enumerate(tables):
                context = _table_context(page, table, words)
                if not context:
                    continue
                header_y, code_name_x, name_prereq_x = context
                anchors = [
                    word for word in words
                    if _inside(word, table.bbox)
                    and (word["top"] + word["bottom"]) / 2 > header_y
                    and (word["x0"] + word["x1"]) / 2 < code_name_x
                    and CODE_RE.fullmatch(str(word.get("text") or "").strip())
                ]
                for anchor in anchors:
                    code = _normalise_code(anchor["text"])
                    row = _row_for_anchor(table, anchor)
                    if not row:
                        continue
                    middle = (anchor["top"] + anchor["bottom"]) / 2
                    owned = [word for word in words if _inside(word, row.bbox)]
                    if any(
                        word is not anchor
                        and (word["x0"] + word["x1"]) / 2 < code_name_x
                        and CODE_RE.fullmatch(str(word.get("text") or "").strip())
                        for word in owned
                    ):
                        continue
                    name_words = [
                        word for word in owned
                        if code_name_x < (word["x0"] + word["x1"]) / 2 < name_prereq_x
                        and _compatible_fill(page, anchor, word)
                    ]
                    prereq_words = [
                        word for word in owned
                        if (word["top"] + word["bottom"]) / 2 >= middle - 2
                        if name_prereq_x < (word["x0"] + word["x1"]) / 2 < table.bbox[2]
                        and _compatible_fill(page, anchor, word)
                    ]
                    name = _clean_name(" ".join(
                        word["text"] for word in sorted(name_words, key=lambda item: (item["top"], item["x0"]))
                    ))
                    prerequisite = _clean_candidate_prereq(" ".join(
                        word["text"] for word in sorted(prereq_words, key=lambda item: (item["top"], item["x0"]))
                    ))
                    if name and not _looks_like_sidebar_footer_noise(name):
                        fill = _fill_key(_background_fill(
                            page, (anchor["x0"], anchor["top"], anchor["x1"], anchor["bottom"])
                        ))
                        candidates[code].append({
                            "name": name,
                            "prerequisite": prerequisite,
                            "year_level": _header_above(headers, "year", row.bbox),
                            "semester": _header_above(headers, "semester", row.bbox),
                            "fill": fill,
                            "category_hint": legend_categories.get(fill),
                            "page": page_number,
                            "table_id": f"p{page_number}-t{table_number}",
                            "separators": [code_name_x, name_prereq_x],
                            "bbox": [table.bbox[0], row.bbox[1], table.bbox[2], row.bbox[3]],
                        })
    return candidates

# Index validation issues by unit and field.
def _issue_keys(validation):
    return {(item["code"], item.get("unit_code"), item.get("section")) for item in validation["issues"]}

# Check whether a proposed name is supported by the old value.
def _name_supported(old, new):
    old_words = re.findall(r"[a-z0-9]+", str(old or "").lower())
    new_words = re.findall(r"[a-z0-9]+", str(new or "").lower())
    if not old_words or len(new_words) < 2:
        return False
    overlap = len(set(old_words) & set(new_words)) / len(set(new_words))
    return overlap >= 0.8 and (str(old).lower().startswith(str(new).lower()) or len(new) >= len(old) * 0.45)

# Check whether a proposed prerequisite preserves useful content.
def _prerequisite_supported(old, new):
    if not new or re.fullmatch(r"nil", new, re.IGNORECASE):
        return False
    if re.search(r"\bNil\b", new, re.IGNORECASE) or PREREQ_BOUNDARY_NOISE_RE.search(new):
        return False
    if TRAILING_CONNECTOR_RE.search(new) or re.search(r"\b(?:and|or|of|to)\s*$", new, re.IGNORECASE):
        return False
    if len(new.split()) < 2 and not re.search(r"[A-Z]{3}\d{3,5}|\d+(?:\.\d+)?\s*(?:cp|credits?)", new, re.IGNORECASE):
        return False
    if not old:
        return bool(
            re.search(r"[A-Z]{3}\d{3,5}|\d+(?:\.\d+)?\s*(?:cp|credits?|credit points?)", new, re.IGNORECASE)
            or re.search(r"Please refer to Elective List|\bVCE\b.*\bequivalent\b|\bWIL\b.*\bYear\b", new, re.IGNORECASE)
        )
    old_codes = set(re.findall(r"\b[A-Z]{3}\d{3,5}\b", old.upper()))
    new_codes = set(re.findall(r"\b[A-Z]{3}\d{3,5}\b", new.upper()))
    if not old_codes.issubset(new_codes):
        return False
    old_normal = re.sub(r"\s+", " ", old).strip().lower()
    new_normal = re.sub(r"\s+", " ", new).strip().lower()
    if new_normal.startswith(old_normal):
        return True
    if old_normal.startswith(new_normal):
        removed = old_normal[len(new_normal):]
        return bool(
            new_normal in old_normal[len(new_normal):]
            or re.search(r"\b(?:course|module|elective|semester|students?|program|recommended)\b", removed)
        )
    first_old_code = re.search(r"\b[A-Z]{3}\d{3,5}\b", old.upper())
    return bool(
        old_codes and old_codes < new_codes and first_old_code
        and new.upper().startswith(first_old_code.group(0))
    )

# Rank validation results for conservative proposal acceptance.
def _validation_rank(validation):
    severity = {"high": 4, "medium": 1, "low": 0}
    return sum(severity.get(issue.get("severity"), 0) for issue in validation["issues"])

# Append a missing unit without changing existing units.
def _append_missing_unit(data, category, candidate):
    categories = data["categories"]
    target = {
        "core": categories["core_units"],
        "major_core": categories["major_units"],
        "mpu": categories["mpu_group"],
        "wil": categories["wil_group"],
        "elective": categories["elective_groups"]["elective"],
        "prescribed_elective": categories["elective_groups"]["prescribed_elective"],
    }[category]
    target.append({
        "year_level": candidate.get("year_level"),
        "semester": candidate.get("semester"),
        "category": category,
        "unit_code": candidate["code"],
        "unit_name": candidate["name"],
        "prerequisite": candidate.get("prerequisite"),
        "offered_in": None,
    })

# ============================================================
# STEP 2: Refine row boundaries
# ============================================================
# Apply conservative name/requisite proposals without mutating the baseline.
def apply_row_boundary_refinement(base_data, pdf_path):
    result = copy.deepcopy(base_data)
    candidates = _row_candidates(pdf_path)
    diagnostics = []
    units = {
        str(unit.get("unit_code") or "").strip().upper(): (section, unit)
        for section, unit in iter_units(result) if unit.get("unit_code")
    }

    for code, (section, unit) in units.items():
        for field in ("unit_name", "prerequisite"):
            current_validation = validate_planner(result)
            issues = _issue_keys(current_validation)
            for candidate in candidates.get(code, []):
                candidate_value = candidate["name" if field == "unit_name" else "prerequisite"]
                supported = (
                    _name_supported(unit.get(field), candidate_value)
                    if field == "unit_name"
                    else _prerequisite_supported(unit.get(field), candidate_value)
                )
                old_value = unit.get(field)
                if candidate_value == old_value or not supported:
                    continue
                if field == "unit_name" and ("E05", code, section) not in issues:
                    continue
                if (
                    field == "prerequisite" and old_value
                    and len(str(candidate_value)) < len(str(old_value))
                    and ("E16", code, section) not in issues
                ):
                    continue
                trial = copy.deepcopy(result)
                trial_unit = next(
                    item for trial_section, item in iter_units(trial)
                    if trial_section == section and str(item.get("unit_code") or "").strip().upper() == code
                )
                trial_unit[field] = candidate_value
                trial_validation = validate_planner(trial)
                # Avoid overwriting a valid value when the candidate does not improve quality.
                accepted = _validation_rank(trial_validation) <= _validation_rank(current_validation)
                diagnostics.append({
                    "unit_code": code,
                    "field": field,
                    "current_value": old_value,
                    "candidate_value": candidate_value,
                    "status": "accepted" if accepted else "rejected",
                    "reason": "same_row_header_columns_and_unit_anchor" if accepted else "validation_quality_decreased",
                    "source": "pdfplumber_row_boundary_experiment",
                    "page": candidate["page"],
                    "bbox": candidate["bbox"],
                })
                if accepted:
                    result = trial
                    unit = next(
                        item for trial_section, item in iter_units(result)
                        if trial_section == section and str(item.get("unit_code") or "").strip().upper() == code
                    )
                    current_validation = trial_validation
                    break

    minor_codes = {
        str(item.get("unit_code") or "").strip().upper()
        for group in result.get("categories", {}).get("minor_groups", []) or []
        if isinstance(group, dict)
        for item in group.get("units", []) or [] if isinstance(item, dict)
    }
    known_fills = {
        candidate.get("fill")
        for code in units for candidate in candidates.get(code, [])
        if candidate.get("fill")
    }
    missing_by_fill = defaultdict(list)
    for code, code_candidates in candidates.items():
        if code in units or code in minor_codes or len(code_candidates) != 1:
            continue
        candidate = code_candidates[0]
        fill = candidate.get("fill")
        if fill and fill not in known_fills and candidate.get("category_hint"):
            missing_by_fill[fill].append((code, candidate))

    for fill, cohort in missing_by_fill.items():
        if len(cohort) < 2:
            continue
        categories = {candidate["category_hint"] for _, candidate in cohort}
        if len(categories) != 1:
            continue
        category = categories.pop()
        for code, candidate in cohort:
            candidate = {**candidate, "code": code}
            _append_missing_unit(result, category, candidate)
            diagnostics.append({
                "unit_code": code,
                "field": "unit_code",
                "current_value": None,
                "candidate_value": code,
                "status": "accepted",
                "reason": "table_row_with_dynamic_legend_fill_cohort",
                "source": "pdfplumber_row_boundary_experiment",
                "page": candidate["page"],
                "bbox": candidate["bbox"],
                "fill": fill,
                "category": category,
                "separators": candidate["separators"],
            })
    return result, diagnostics

# ============================================================
# STEP 3: Match requirement blocks
# ============================================================
COUNT_RE = re.compile(r"^\d+$")
REQUIREMENT_CP_RE = re.compile(r"^(\d+(?:\.\d+)?)\s+(?:credit\s+points?|cps?)\b", re.IGNORECASE)

# Map a requirement label to its canonical category key.
def _requirement_category(label):
    text = re.sub(r"\s+", " ", str(label or "")).strip()
    compact = re.sub(r"[\s-]+", "", text).lower()
    if re.search(r"coreunits?$", compact):
        return "core"
    if re.search(r"(?:minor/elective|secondmajor/elective|recommendedelective|elective)units?$", compact):
        return "elective"
    if re.search(r"(?:major|discipline)units?$", compact):
        return "major"
    if re.search(r"(?:wilplacement|industry(?:training|placement))units?$", compact):
        return "wil"
    return None

# Find the local geometry containing requirement text.
def _requirement_bbox(words):
    return [
        min(word["x0"] for word in words),
        min(word["top"] for word in words),
        max(word["x1"] for word in words),
        max(word["bottom"] for word in words),
    ]

# Reconstruct a requirement label from one visual line.
def _label_in_line(line_words):
    words = sorted(line_words, key=lambda word: word["x0"])
    for start, word in enumerate(words):
        if not COUNT_RE.fullmatch(str(word.get("text") or "")):
            continue
        if start and re.fullmatch(r"(?:and|or|[+/])", str(words[start - 1].get("text") or ""), re.IGNORECASE):
            previous_gap = word["x0"] - words[start - 1]["x1"]
            if previous_gap <= (word["bottom"] - word["top"]) * 2:
                continue
        for end in range(start + 2, min(len(words), start + 18)):
            phrase_words = words[start:end + 1]
            if any(
                right["x0"] - left["x1"] > (word["bottom"] - word["top"]) * 3
                for left, right in zip(phrase_words, phrase_words[1:])
            ):
                break
            phrase = " ".join(item["text"] for item in phrase_words)
            category = _requirement_category(phrase)
            if category:
                compact = re.sub(r"[\s-]+", "", phrase).lower()
                compound = re.fullmatch(r"(\d+)fixedunits[+&](\d+)minor/electiveunits?", compact)
                return {
                    "category": category,
                    "count": sum(map(int, compound.groups())) if compound else int(word["text"]),
                    "text": phrase,
                    "bbox": _requirement_bbox(phrase_words),
                }
    return None

# Find a credit-point value in the local requirement line.
def _cp_in_line(line_words, label_x, page_width):
    words = sorted(line_words, key=lambda word: word["x0"])
    x_tolerance = page_width * 0.05
    for start, word in enumerate(words):
        if abs(word["x0"] - label_x) > x_tolerance:
            continue
        baseline_tolerance = max(0.4, (word["bottom"] - word["top"]) * 0.1)
        phrase_words = [
            item for item in words[start:]
            if item["x0"] >= word["x0"] and abs(item["top"] - word["top"]) <= baseline_tolerance
        ][:4]
        phrase = " ".join(item["text"] for item in phrase_words)
        match = REQUIREMENT_CP_RE.match(phrase)
        if not match:
            continue
        value = float(match.group(1))
        return (int(value) if value.is_integer() else value), _requirement_bbox(phrase_words), match.group(0)
    return None

# Extract requirement labels and credit-point regions from page geometry.
def extract_geometric_requirements(pdf_path):
    found = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(x_tolerance=1, y_tolerance=1)
            if not words:
                continue
            median_height = statistics.median(word["bottom"] - word["top"] for word in words)
            visual_lines = []
            for middle, line_words in _lines(words):
                label = _label_in_line(line_words)
                visual_lines.append({"middle": middle, "words": line_words, "label": label})

            for index, line in enumerate(visual_lines):
                label = line["label"]
                if not label:
                    continue
                next_label_y = next(
                    (later["middle"] for later in visual_lines[index + 1:] if later["label"]),
                    float("inf"),
                )
                max_y = min(next_label_y, label["bbox"][3] + median_height * 6)
                cp = None
                for later in visual_lines[index:index + 7]:
                    if later["middle"] < label["bbox"][1] or later["middle"] >= max_y:
                        continue
                    cp = _cp_in_line(later["words"], label["bbox"][0], page.width)
                    if cp:
                        break
                if not cp:
                    continue
                value, cp_bbox, cp_text = cp
                evidence = {
                    "count": label["count"],
                    "cp": value,
                    "label_text": label["text"],
                    "cp_text": cp_text,
                    "page": page_number,
                    "label_bbox": label["bbox"],
                    "cp_bbox": cp_bbox,
                    "layout": "right_sidebar" if label["bbox"][0] > page.width / 2 else "local_visual_block",
                    "source": "local_geometric_sidebar_association",
                }
                found.setdefault(label["category"], []).append(evidence)

    result = {}
    for category, evidence in found.items():
        values = {(item["count"], item["cp"]) for item in evidence}
        if len(values) == 1:
            result[category] = evidence[0]
    return result

# Associate requirement counts and credit points with planner sections.
def apply_requirement_association(base_data, pdf_path):
    result = copy.deepcopy(base_data)
    requirements = result.setdefault("course_information", {}).setdefault("requirements", {})
    diagnostics = []
    for category, evidence in extract_geometric_requirements(pdf_path).items():
        current = requirements.get(category) if isinstance(requirements.get(category), dict) else {}
        proposed = {"count": evidence["count"], "cp": evidence["cp"]}
        if current.get("count") == proposed["count"] and current.get("cp") == proposed["cp"]:
            continue
        requirements[category] = proposed
        diagnostics.append({
            "category": category,
            "before": {"count": current.get("count"), "cp": current.get("cp")},
            "after": proposed,
            **evidence,
        })
    return result, diagnostics

# ============================================================
# STEP 4: Recover year and semester context
# ============================================================
CODE_RE = re.compile(r"^[A-Z]{3}\d{3,5}[*#\u2020]*$", re.IGNORECASE)
YEAR_RE = re.compile(r"^Year\s+(One|Two|Three|Four|Five|\d+)\b", re.IGNORECASE)
SEMESTER_RE = re.compile(r"^Semester\s+(\d+)\b", re.IGNORECASE)
TERM_RE = re.compile(r"^(Summer|Winter)\s+Term\b", re.IGNORECASE)
YEAR_VALUES = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}

# Find the bounding box of a year header.
def _year_bbox(words):
    return (
        min(word["x0"] for word in words), min(word["top"] for word in words),
        max(word["x1"] for word in words), max(word["bottom"] for word in words),
    )

# Normalize a year-header fill for structural matching.
def _year_fill_key(fill):
    return tuple(round(value, 3) for value in fill) if fill else None

# Keep only the widest, aligned timetable tables; sidebars are narrower.
def _main_tables(page):
    tables = page.find_tables()
    if not tables:
        return []
    widest = max(table.bbox[2] - table.bbox[0] for table in tables)
    return [
        table for table in tables
        if table.bbox[2] - table.bbox[0] >= widest * 0.7
        and (table.bbox[0] + table.bbox[2]) / 2 < page.width * 0.6
    ]

# Convert a visual line into a structural header record.
def _header_line(line_words):
    ordered = sorted(line_words, key=lambda word: word["x0"])
    text = " ".join(word["text"] for word in ordered).strip()
    year = YEAR_RE.match(text)
    if year:
        token = year.group(1).lower()
        value = int(token) if token.isdigit() else YEAR_VALUES[token]
        return {"type": "year", "value": value, "text": text, "bbox": _year_bbox(ordered)}
    semester = SEMESTER_RE.match(text)
    if semester:
        return {
            "type": "semester",
            "value": _normalise_semester_number(semester.group(1)),
            "text": text,
            "bbox": _year_bbox(ordered),
        }
    term = TERM_RE.match(text)
    if term:
        return {
            "type": "semester",
            "value": 3 if term.group(1).lower() == "summer" else 4,
            "text": text,
            "bbox": _year_bbox(ordered),
        }
    return None

# Check whether a header belongs to the same table region.
def _aligned_to_table(header, table):
    left, _, right, _ = table.bbox
    header_left = header["bbox"][0]
    return left - 4 <= header_left <= left + (right - left) * 0.25

# Find the table containing a unit-code anchor.
def _table_for_anchor(tables, anchor):
    return next((table for table in tables if _inside(anchor, table.bbox)), None)

# Return table-contained code anchors with preceding structural headers.
def _header_candidates(pdf_path):
    candidates = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(x_tolerance=1, y_tolerance=1)
            header_words = page.extract_words(x_tolerance=3, y_tolerance=2)
            tables = _main_tables(page)
            if not words or not tables:
                continue

            region = (
                min(table.bbox[0] for table in tables), min(table.bbox[1] for table in tables),
                max(table.bbox[2] for table in tables), max(table.bbox[3] for table in tables),
            )
            headers = []
            # Header text can be emitted as adjacent glyph fragments; merge it
            # only for header recognition, not for unit-row anchoring.
            for _, line_words in _lines(header_words):
                header = _header_line(line_words)
                if not header:
                    continue
                header["fill"] = _year_fill_key(_background_fill(page, header["bbox"]))
                header["tables"] = [table for table in tables if _aligned_to_table(header, table)]
                if header["tables"]:
                    headers.append(header)

            # Header fills are learned from genuine left-timetable semester rows.
            semester_fills = Counter(
                header["fill"] for header in headers
                if header["type"] == "semester" and header["fill"] is not None
                and any(table.bbox[1] - 2 <= header["bbox"][1] <= table.bbox[3] for table in header["tables"])
            )
            structural_fills = set(semester_fills)
            if not structural_fills:
                continue

            median_height = statistics.median(word["bottom"] - word["top"] for word in words)
            year_limit = max(120.0, median_height * 28)
            for anchor in words:
                if not CODE_RE.fullmatch(str(anchor.get("text") or "").strip()):
                    continue
                table = _table_for_anchor(tables, anchor)
                if not table:
                    continue
                code = _normalise_code(anchor["text"])
                anchor_y = anchor["top"]
                semester_headers = [
                    header for header in headers
                    if header["type"] == "semester"
                    and table in header["tables"]
                    and header["fill"] in structural_fills
                    and table.bbox[1] - 2 <= header["bbox"][1] < anchor_y
                ]
                if not semester_headers:
                    continue
                semester_header = max(semester_headers, key=lambda header: header["bbox"][1])
                year_headers = [
                    header for header in headers
                    if header["type"] == "year"
                    and header["bbox"][1] < anchor_y
                    and region[0] - 4 <= header["bbox"][0] <= region[0] + (region[2] - region[0]) * 0.25
                    and anchor_y - header["bbox"][3] <= year_limit
                ]
                year_header = max(year_headers, key=lambda header: header["bbox"][1]) if year_headers else None
                candidate = {
                    "year_level": year_header["value"] if year_header else None,
                    "semester": semester_header["value"],
                    "page": page_number,
                    "table_bbox": [round(value, 2) for value in table.bbox],
                    "anchor_bbox": [round(anchor[key], 2) for key in ("x0", "top", "x1", "bottom")],
                    "header_above": semester_header["text"],
                    "year_header_above": year_header["text"] if year_header else None,
                    "header_fill": semester_header["fill"],
                    "discovered_header_fills": sorted(structural_fills),
                    "reason": "preceding_structural_header_in_same_timetable_table",
                }
                existing = candidates.get(code)
                if existing is None or (candidate["page"], candidate["anchor_bbox"][1]) < (
                    existing["page"], existing["anchor_bbox"][1]
                ):
                    candidates[code] = candidate
    return candidates


# Attach year and semester headers to units using table alignment evidence.
def apply_year_semester_association(base_data, pdf_path):
    result = copy.deepcopy(base_data)
    candidates = _header_candidates(pdf_path)
    diagnostics = []
    for section, unit in iter_units(result):
        code = str(unit.get("unit_code") or "").strip().upper()
        candidate = candidates.get(code)
        if not candidate:
            continue
        before = {"year_level": unit.get("year_level"), "semester": unit.get("semester")}
        proposed = {
            "year_level": candidate["year_level"] if candidate["year_level"] is not None else before["year_level"],
            "semester": candidate["semester"],
        }
        accepted = proposed != before
        special_term = bool(TERM_RE.match(candidate["header_above"]))
        # Optional WIL rows can sit beside several valid term windows. A special
        # term header is useful evidence for a missing value, not for replacing
        # an existing WIL placement.
        if section == "wil" and special_term and before["semester"] is not None:
            accepted = False
        diagnostics.append({
            "unit_code": code,
            "section": section,
            "existing": before,
            "candidate": proposed,
            "status": "accepted" if accepted else "rejected",
            **candidate,
            "reason": (
                candidate["reason"] if accepted else
                "preserve_existing_wil_special_term" if section == "wil" and special_term else
                "same_as_existing"
            ),
        })
        if accepted:
            unit.update(proposed)
    return result, diagnostics

# ============================================================
# STEP 5: Recover prerequisite cells
# ============================================================
UNIT_CODE_RE = re.compile(r"\b[A-Z]{3}\d{3,5}\b", re.IGNORECASE)
CP_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:cp|cps|credits?|credit\s+points?)\b", re.IGNORECASE)
CONNECTOR_NAME_RE = re.compile(r"^(?:or|and|[&/,])$", re.IGNORECASE)
NOISE_RE = re.compile(
    r"\b(?:course information|recommended elective|foundation studies|ministry of education|"
    r"online module|quiz comprised|students? (?:need|required|are)|semester\s+\d+|"
    r"(?:core|major|component)\s+units?|w(?:ork)?[- ]?integrated|"
    r"wil placement|internship placement|complete at least)\b",
    re.IGNORECASE,
)

# Return the horizontal midpoint of a word.
def _middle_x(word):
    return (word["x0"] + word["x1"]) / 2

# Check whether a word lies inside a cell or row box.
def _contains(box, word):
    return box[0] <= _middle_x(word) <= box[2] and box[1] <= (word["top"] + word["bottom"]) / 2 <= box[3]

# Return the substantive rightmost cell instead of a thin grid gutter.
def _prerequisite_cell(row, separator, table_width):
    cells = [
        cell for cell in row.cells if cell
        and cell[0] >= separator - 2
        and cell[2] - cell[0] >= table_width * 0.12
    ]
    return max(cells, key=lambda cell: cell[2] - cell[0]) if cells else None

# Check whether a row has an independent unit-code anchor.
def _row_has_code_anchor(words, row, code_separator):
    return any(
        _contains(row.bbox, word)
        and _middle_x(word) < code_separator
        and CODE_RE.fullmatch(str(word.get("text") or "").strip())
        for word in words
    )

# Check whether two cells share the prerequisite column.
def _same_prerequisite_column(cell, base_cell):
    if not cell:
        return False
    overlap = max(0, min(cell[2], base_cell[2]) - max(cell[0], base_cell[0]))
    return overlap >= min(cell[2] - cell[0], base_cell[2] - base_cell[0]) * 0.8

# Join words belonging to a cell in reading order.
def _cell_text(words, cells):
    selected = [word for cell in cells for word in words if _contains(cell, word)]
    return " ".join(word["text"] for word in sorted(selected, key=lambda item: (item["top"], item["x0"])))

# pdfplumber recreates Row objects, so use their stable geometry.
def _row_index(rows, row):
    return next((index for index, item in enumerate(rows) if item.bbox == row.bbox), None)

# Return prerequisite text constrained to a real table cell and its continuations.
def _cell_candidates(pdf_path):
    candidates = defaultdict(list)
    code_column, prerequisite_column = set(), set()
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(x_tolerance=1, y_tolerance=1)
            for table_number, table in enumerate(page.find_tables()):
                context = _table_context(page, table, words)
                if not context:
                    continue
                header_y, code_separator, prereq_separator = context
                rows = list(table.rows)
                anchors = [
                    word for word in words
                    if _inside(word, table.bbox)
                    and (word["top"] + word["bottom"]) / 2 > header_y
                    and _middle_x(word) < code_separator
                    and CODE_RE.fullmatch(str(word.get("text") or "").strip())
                ]
                for word in words:
                    if not _inside(word, table.bbox) or not CODE_RE.fullmatch(str(word.get("text") or "").strip()):
                        continue
                    code = _normalise_code(word["text"])
                    if _middle_x(word) < code_separator:
                        code_column.add(code)
                    elif _middle_x(word) > prereq_separator:
                        prerequisite_column.add(code)

                for anchor in anchors:
                    row = _row_for_anchor(table, anchor)
                    if not row:
                        continue
                    row_index = _row_index(rows, row)
                    if row_index is None:
                        continue
                    base_cell = _prerequisite_cell(row, prereq_separator, table.bbox[2] - table.bbox[0])
                    if not base_cell:
                        continue
                    cells = [base_cell]
                    for later in rows[row_index + 1:]:
                        if _row_has_code_anchor(words, later, code_separator):
                            break
                        continuation = _prerequisite_cell(later, prereq_separator, table.bbox[2] - table.bbox[0])
                        if not _same_prerequisite_column(continuation, base_cell):
                            break
                        cells.append(continuation)
                    raw = _cell_text(words, cells)
                    prerequisite = _clean_candidate_prereq(raw)
                    if prerequisite:
                        candidates[_normalise_code(anchor["text"])].append({
                            "prerequisite": prerequisite,
                            "page": page_number,
                            "table_id": f"p{page_number}-t{table_number}",
                            "cell_bbox": [round(value, 2) for value in (
                                base_cell[0], base_cell[1], base_cell[2], cells[-1][3]
                            )],
                            "continuation_cells": len(cells),
                        })
    return candidates, code_column, prerequisite_column

# Check whether prerequisite evidence supports a replacement.
def _is_supported_prerequisite(old, candidate):
    if not candidate or NOISE_RE.search(candidate):
        return False
    if not (UNIT_CODE_RE.search(candidate) or CP_RE.search(candidate) or
            re.search(r"please refer to elective list", candidate, re.IGNORECASE)):
        return False
    old = str(old or "").strip()
    if not old:
        return True
    old_codes = UNIT_CODE_RE.findall(old.upper())
    new_codes = UNIT_CODE_RE.findall(candidate.upper())
    # Text-only prerequisite instructions cannot gain evidence by repeating the
    # current phrase; require a code or credit-point change before extending it.
    if not old_codes and not new_codes and not CP_RE.search(candidate):
        return False
    if set(old_codes).issubset(set(new_codes)):
        return True
    # A duplicated/noisy current value may safely be replaced only by a strictly
    # cell-contained candidate with fewer duplicate codes.
    return len(old_codes) != len(set(old_codes)) and len(new_codes) == len(set(new_codes))

# Remove connector-only rows whose code has evidence solely in prerequisite cells.
def _remove_prerequisite_only_ghosts(result, code_column, prerequisite_column, diagnostics):
    categories = result.get("categories", {})
    groups = [
        categories.get("core_units", []), categories.get("major_units", []), categories.get("mpu_group", []),
        categories.get("wil_group", []), categories.get("elective_groups", {}).get("prescribed_elective", []),
        categories.get("elective_groups", {}).get("elective", []),
    ]
    for group in groups:
        if not isinstance(group, list):
            continue
        for unit in list(group):
            code = _normalise_code(unit.get("unit_code"))
            name = str(unit.get("unit_name") or "").strip()
            if code in prerequisite_column and code not in code_column and (not name or CONNECTOR_NAME_RE.fullmatch(name)):
                group.remove(unit)
                diagnostics.append({
                    "unit_code": code,
                    "field": "unit_code",
                    "current_value": code,
                    "candidate_value": None,
                    "status": "accepted",
                    "reason": "code_evidence_only_in_prerequisite_column_connector_row",
                })

# Recover prerequisite text from the prerequisite column without changing its meaning.
def apply_prerequisite_association(base_data, pdf_path):
    result = copy.deepcopy(base_data)
    candidates, code_column, prerequisite_column = _cell_candidates(pdf_path)
    diagnostics = []

    for section, unit in iter_units(result):
        code = _normalise_code(unit.get("unit_code"))
        old = unit.get("prerequisite")
        for candidate in candidates.get(code, []):
            value = candidate["prerequisite"]
            if value == old or not _is_supported_prerequisite(old, value):
                continue
            unit["prerequisite"] = value
            diagnostics.append({
                "unit_code": code,
                "section": section,
                "field": "prerequisite",
                "current_value": old,
                "candidate_value": value,
                "status": "accepted",
                "reason": "same_table_prerequisite_cell_with_continuations",
                **candidate,
            })
            break

    _remove_prerequisite_only_ghosts(result, code_column, prerequisite_column, diagnostics)
    return result, diagnostics