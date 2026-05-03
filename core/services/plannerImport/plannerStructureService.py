"""
Planner structure service used by the app's PDF import API.

Pipeline:
  1. plannerPdfExtractor.py -> raw text + unit extraction
  2. Deterministic assembly into the app planner JSON schema
  3. Optional LLM cross-check patch via Ollama
  4. Validation + confidence/report packaging
"""

import argparse
import json
import os
import re
import sys
import requests
import pdfplumber

from plannerPdfExtractor import (
    extract_text_from_pdf,
    clean_text,
    extract_metadata,
    extract_requirements,
    extract_units,
    extract_elective_sections,
    detect_colour_legend,
    match_category,
    _get_row_colour,
)

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL_NAME = "deepseek-r1:1.5b"
DEFAULT_LLM_RETRIES = 2
UNIT_CODE_RE = re.compile(r"\b[A-Z]{3}\d{3,5}@?#?\b")
YEAR_RE = re.compile(r"^\s*Year\s+(One|Two|Three|Four|Five|\d+)\s*$", re.IGNORECASE)
SEM_RE = re.compile(r"^\s*Semester\s+(\d+)(?:\s*\|\s*([A-Za-z/]+)\s+(\d{4}))?.*$", re.IGNORECASE)
TERM_RE = re.compile(r"^\s*(Summer(?:\s+Term)?|Winter(?:\s+Term)?)(?:\s*\|\s*([A-Za-z/]+)\s+(\d{4}))?.*$", re.IGNORECASE)
YEAR_MAP = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
_LAST_RAW_EVIDENCE = ""

# ---------------------------
# Ollama call
# ---------------------------
def call_ollama(prompt, model_name):
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 5000},
    }
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=300)
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Cannot connect to Ollama. Run: ollama serve")
    except requests.exceptions.Timeout:
        raise RuntimeError("Ollama request timed out.")


def call_ollama_with_retries(prompt, model_name, retries=DEFAULT_LLM_RETRIES):
    last_error = None
    attempts = []
    for attempt in range(1, max(retries, 1) + 1):
        try:
            response = call_ollama(prompt, model_name)
            attempts.append({"attempt": attempt, "status": "success"})
            return response, attempts
        except Exception as exc:
            last_error = exc
            attempts.append({"attempt": attempt, "status": "error", "error": str(exc)})
    error = RuntimeError(str(last_error))
    error.attempts = attempts
    raise error


def build_json_repair_prompt(previous_response):
    return f"""Return valid JSON only.
Do not explain anything.
Do not use markdown.
Do not add prose before or after the JSON.

Your previous answer did not follow the JSON requirement.
Rewrite the same answer as valid JSON only.

Allowed outputs:
1. Exactly [] if there are no changes.
2. Exactly one valid JSON object with this structure:
{{
  "course_information": {{
    "course": string or null,
    "major": string or null,
    "intake": string or null,
    "intake_year": integer or null,
    "requirements": {{
      "core": {{"count": integer or null, "cp": integer or null}},
      "major": {{"count": integer or null, "cp": integer or null}},
      "elective": {{"count": integer or null, "cp": integer or null}},
      "wil": {{"count": integer or null, "cp": integer or null}}
    }}
  }},
  "unit_changes": [
    {{
      "action": "add" or "update",
      "unit_code": "CODE",
      "year_level": integer or null,
      "semester": integer or null,
      "category": "core" or "major_core" or "elective" or "wil" or "mpu" or "prescribed_elective" or null,
      "unit_name": string or null,
      "prerequisite": string or null,
      "offered_in": integer or null
    }}
  ]
}}

Previous response:
{previous_response}
"""


def parse_or_repair_llm_json(response, model_name):
    try:
        return extract_json(response), []
    except ValueError:
        repair_prompt = build_json_repair_prompt(response)
        repaired = call_ollama(repair_prompt, model_name)
        parsed = extract_json(repaired)
        return parsed, [
            {
                "attempt": "json_repair",
                "status": "success",
            }
        ]


# ---------------------------
# Parse WIL unit name/prereq
# ---------------------------
def parse_wil_unit(u):
    """
    WIL units have their name and prerequisites mixed in the name field.
    Split them: first bullet is the name, remaining bullets are prerequisites.
    """
    raw = u.get('unit_name', u.get('name')) or ''
    # Split on ' - ' bullets
    parts = [p.strip() for p in re.split(r'\s*-\s+', raw) if p.strip()]
    if not parts:
        return u.get('unit_name', u.get('name')), u['prerequisite']

    name    = parts[0]
    prereqs = parts[1:] if len(parts) > 1 else []

    if prereqs:
        prereq_str = '; '.join(prereqs)
    else:
        prereq_str = u['prerequisite']

    return name, prereq_str


def normalise_prereq_text(text):
    if text is None:
        return None
    text = re.sub(r"\s+", " ", str(text)).strip()
    if not text or text.lower() == "nil":
        return None
    return text


def coerce_int(value):
    if isinstance(value, int):
        return value
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    if re.fullmatch(r"\d+", text):
        return int(text)
    return None


def normalise_offered_in(value):
    if value is None:
        return None
    if isinstance(value, int):
        return value

    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text:
        return None

    mapping = {
        "semester 1": 1,
        "semester 1 only": 1,
        "feb/mar": 1,
        "feb/mar only": 1,
        "semester 2": 2,
        "semester 2 only": 2,
        "aug/sept": 2,
        "aug/sept only": 2,
        "summer": 3,
        "summer term": 3,
        "winter": 4,
        "winter term": 4,
    }

    lowered = text.lower()
    if lowered in mapping:
        return mapping[lowered]

    return None


def output_category(category):
    if category == "major":
        return "major_core"
    return category


# ---------------------------
# Deterministic assembly into target JSON schema
# ---------------------------
def unit_obj(u):
    """Build a unit dict in the target schema."""
    obj = {
        "year_level":   coerce_int(u.get("year_level")),
        "semester":     coerce_int(u.get("semester")),
        "category":     output_category(u.get("category")),
        "unit_code":    u["code"],
        "unit_name":    u["name"],
        "prerequisite": normalise_prereq_text(u.get("prerequisite")),
        "offered_in":   normalise_offered_in(u.get("offered_in")),
    }
    return obj


def assemble_json(file_name, metadata, requirements, units, elective_sections):
    # Build requirements entry with count + cp
    def req_entry(key):
        val = requirements.get(key, {})
        if isinstance(val, dict):
            return {"count": val.get("count"), "cp": val.get("cp")}
        return {"count": None, "cp": None}

    course_info = {
        "course":      metadata.get("course", ""),
        "major":       re.sub(r"\s+", " ", metadata.get("major") or "").strip(),
        "intake":      metadata.get("intake", ""),
        "intake_year": metadata.get("intakeYear"),
        "requirements": {
            "core":      req_entry("core"),
            "major": req_entry("major"),
            "elective":  req_entry("elective"),
            "wil":       req_entry("wil"),
        }
    }

    core_units  = [unit_obj(u) for u in units if u["category"] == "core"]
    major_units = [unit_obj(u) for u in units if u["category"] == "major"]
    mpu_units   = [unit_obj(u) for u in units if u["category"] == "mpu"]

    # Elective groups
    prescribed        = [u for u in units if u["category"] == "prescribed_elective"]
    regular_electives = [u for u in units if u["category"] == "elective"]

    prescribed_objs = [unit_obj(u) for u in prescribed]
    elective_objs   = [unit_obj(u) for u in regular_electives]

    elective_groups = {
        "prescribed_elective": prescribed_objs,
        "elective":            elective_objs,
    }

    # WIL units
    wil_raw = [u for u in units if u["category"] == "wil"]
    wil_list = []
    for u in wil_raw:
        name, prereq = parse_wil_unit(u)
        wil_list.append({
            "year_level":   coerce_int(u.get("year_level")),
            "semester":     coerce_int(u.get("semester")),
            "category":     output_category(u.get("category")),
            "unit_code":    u["code"],
            "unit_name":    name,
            "prerequisite": prereq,
            "offered_in":   normalise_offered_in(u.get("offered_in")),
        })

    return {
        "file_name": file_name,
        "course_information": course_info,
        "categories": {
            "core_units":      core_units,
            "major_units":     major_units,
            "mpu_group":       mpu_units,
            "elective_groups": elective_groups,
            "wil_group":       wil_list,
        },
    }


def _planner_sem_to_db_sem(planner_sem, season_label=None):
    if season_label:
        label = str(season_label).lower()
        if "summer" in label:
            return 3
        if "winter" in label:
            return 4
    sem = coerce_int(planner_sem)
    if sem is None:
        return None
    return 1 if sem % 2 == 1 else 2


def _planner_sem_to_year(planner_sem):
    sem = coerce_int(planner_sem)
    if sem is None:
        return None
    return (sem + 1) // 2


def _clean_evidence_line(line):
    line = re.sub(r"\s+", " ", str(line)).strip()
    return line.replace("â€™", "'").replace("Ã¢â‚¬â„¢", "'")


def _is_useful_evidence_line(line):
    if not line:
        return False
    if re.search(r"swinburne\.edu|last updated|degree planner|copyright", line, re.IGNORECASE):
        return False
    if UNIT_CODE_RE.search(line):
        return True
    useful_patterns = [
        r"bachelor of",
        r"\bsemester\s+\d+\b",
        r"\bsummer\b",
        r"\bwinter\b",
        r"\byear\s+(one|two|three|four|five|\d+)\b",
        r"\bcore units\b",
        r"\bmajor units\b",
        r"\belective units\b",
        r"\bwil placement\b",
        r"\bcredit points\b",
        r"\bwork integrated learning\b",
        r"\bmajor\b",
        r"\bintake\b",
        r"\b\d{4}\b",
    ]
    return any(re.search(pattern, line, re.IGNORECASE) for pattern in useful_patterns)


def _extract_page_lines(pdf_path):
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            raw_lines = [_clean_evidence_line(line) for line in text.splitlines()]
            pages.append([line for line in raw_lines if line])
    return pages


def _row_cells_text(row_cells):
    parts = []
    for cell in row_cells:
        text = _clean_evidence_line("" if cell is None else str(cell))
        if text:
            parts.append(text)
    return " | ".join(parts)


def _extract_page_line_records(page):
    words = page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False) or []
    grouped = {}
    for word in words:
        text = _clean_evidence_line(word.get("text") or "")
        if not text:
            continue
        mid_y = round(((word.get("top", 0) + word.get("bottom", 0)) / 2) / 3) * 3
        grouped.setdefault(mid_y, []).append(word)
    records = []
    for mid_y in sorted(grouped):
        line_words = sorted(grouped[mid_y], key=lambda w: w.get("x0", 0))
        text = _clean_evidence_line(" ".join((w.get("text") or "").strip() for w in line_words))
        if text:
            records.append({"y": mid_y, "text": text})
    return records


def _normalise_evidence_row_text(text):
    text = _clean_evidence_line(text).replace(" | ", " ")
    return re.sub(r"\s+", " ", text).strip()


def _looks_like_note_line(line):
    text = _clean_evidence_line(line)
    if not text:
        return False
    return bool(
        re.match(r"^[*#†]\s*", text) or
        re.search(r"\bnotes?\b", text, re.IGNORECASE) or
        re.search(r"\bhonours merit units?\b", text, re.IGNORECASE)
    )


def _extract_note_entries(page_lines):
    notes = []
    for line in page_lines:
        text = _clean_evidence_line(line)
        if not _looks_like_note_line(text):
            continue
        symbol_match = re.match(r"^([*#†])\s*(.*)$", text)
        if symbol_match:
            notes.append((symbol_match.group(1), _clean_evidence_line(symbol_match.group(2) or text)))
            continue
        for symbol in ("*", "#", "†"):
            if symbol in text:
                notes.append((symbol, text))
        if not any(symbol in text for symbol in ("*", "#", "†")):
            notes.append(("general", text))
    return notes


def _line_is_row_continuation(line):
    text = _clean_evidence_line(line)
    if not text:
        return False
    if UNIT_CODE_RE.search(text):
        return False
    if YEAR_RE.match(text) or SEM_RE.match(text) or TERM_RE.match(text):
        return False
    if re.search(r"unit code|unit name|pre-?requisites?|offered in", text, re.IGNORECASE):
        return False
    if _looks_like_note_line(text):
        return False
    return bool(
        re.search(r"\b(?:OR|AND|Co-req:|Nil|cp|cps)\b", text, re.IGNORECASE) or
        re.fullmatch(r"\d+(?:\.\d+)?\s*(?:credit points?|cp|cps)", text, re.IGNORECASE) or
        text.startswith(("(", "-", "&", "/", ",")) or
        _has_trailing_connector(text)
    )


def _collect_row_context_from_lines(line_records, row_bbox, row_code, row_text):
    if not line_records:
        return [], None
    code = str(row_code or "").rstrip("@#").upper()
    row_text_norm = _normalise_evidence_row_text(row_text)
    row_mid = None
    if row_bbox:
        row_mid = round(((row_bbox[1] + row_bbox[3]) / 2) / 3) * 3

    best_idx = None
    for idx, record in enumerate(line_records):
        text = record["text"]
        if code and code in text:
            best_idx = idx
            if row_mid is None or abs(record["y"] - row_mid) <= 6:
                break
    if best_idx is None and row_mid is not None:
        for idx, record in enumerate(line_records):
            if abs(record["y"] - row_mid) <= 6:
                best_idx = idx
                break
    if best_idx is None:
        return [], row_text_norm

    merged_text = line_records[best_idx]["text"]
    context_lines = []
    for next_record in line_records[best_idx + 1: best_idx + 4]:
        next_text = _clean_evidence_line(next_record["text"])
        if not next_text:
            continue
        if UNIT_CODE_RE.search(next_text) or YEAR_RE.match(next_text) or SEM_RE.match(next_text) or TERM_RE.match(next_text):
            break
        if _looks_like_note_line(next_text):
            break
        if _has_trailing_connector(merged_text):
            if not _line_is_row_continuation(next_text):
                break
            merged_text = _clean_evidence_line(merged_text + " " + next_text)
            context_lines.append(next_text)
            continue
        if _line_is_row_continuation(next_text) and len(next_text.split()) <= 8:
            merged_text = _clean_evidence_line(merged_text + " " + next_text)
            context_lines.append(next_text)
            continue
        break
    return context_lines, _normalise_evidence_row_text(merged_text)


def _row_category_for_evidence(page, row_bbox, legend):
    if not row_bbox:
        return None
    try:
        colour = _get_row_colour(page, row_bbox)
        return match_category(colour, legend)
    except Exception:
        return None


def _extract_useful_raw_evidence_lines_basic(pdf_path, max_lines_per_page=120):
    blocks = []
    page_text_lines = _extract_page_lines(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            page_lines = page_text_lines[page_number - 1]
            tables = page.find_tables()

            current_year = None
            current_planner_sem = None
            current_db_sem = None
            page_block = [f"PAGE {page_number}"]

            for raw_line in page_lines:
                line = _clean_evidence_line(raw_line)
                if not line:
                    continue
                if re.search(r"swinburne\.edu|last updated|degree planner|copyright", line, re.IGNORECASE):
                    continue

                year_match = YEAR_RE.match(line)
                if year_match:
                    token = year_match.group(1).lower()
                    current_year = YEAR_MAP.get(token, int(token) if token.isdigit() else None)
                    page_block.append(f"HEADER|year_level={current_year}|text={line}")
                    continue

                year_search = re.search(r"\bYear\s+(One|Two|Three|Four|Five|\d+)\b", line, re.IGNORECASE)
                if year_search and "credit point" not in line.lower():
                    token = year_search.group(1).lower()
                    current_year = YEAR_MAP.get(token, int(token) if token.isdigit() else None)
                    page_block.append(f"HEADER|year_level={current_year}|text=Year {year_search.group(1)}")
                    continue

                sem_match = SEM_RE.match(line)
                if sem_match:
                    current_planner_sem = int(sem_match.group(1))
                    current_db_sem = _planner_sem_to_db_sem(current_planner_sem)
                    season = sem_match.group(2)
                    year_text = sem_match.group(3)
                    page_block.append(
                        f"HEADER|year_level={current_year}|planner_semester={current_planner_sem}|semester={current_db_sem}|season={season}|year={year_text}|text={line}"
                    )
                    continue

                term_match = TERM_RE.match(line)
                if term_match:
                    season = term_match.group(1)
                    current_planner_sem = None
                    current_db_sem = _planner_sem_to_db_sem(None, season)
                    page_block.append(
                        f"HEADER|year_level={current_year}|planner_semester=null|semester={current_db_sem}|season={season}|year={term_match.group(3)}|text={line}"
                    )
                    continue

                if _is_useful_evidence_line(line) and not UNIT_CODE_RE.search(line):
                    page_block.append("INFO|" + line)

            for table in tables:
                extracted_rows = table.extract() or []
                last_row_idx = None
                for row_cells in extracted_rows:
                    row_text = _row_cells_text(row_cells)
                    if not row_text:
                        continue
                    if re.search(r"unit code|unit name|pre-?requisites?", row_text, re.IGNORECASE):
                        continue

                    sem_match = SEM_RE.match(row_text)
                    if sem_match:
                        current_planner_sem = int(sem_match.group(1))
                        current_db_sem = _planner_sem_to_db_sem(current_planner_sem)
                        season = sem_match.group(2)
                        year_text = sem_match.group(3)
                        page_block.append(
                            f"HEADER|year_level={current_year}|planner_semester={current_planner_sem}|semester={current_db_sem}|season={season}|year={year_text}|text={row_text}"
                        )
                        continue

                    term_match = TERM_RE.match(row_text)
                    if term_match:
                        season = term_match.group(1)
                        current_planner_sem = None
                        current_db_sem = _planner_sem_to_db_sem(None, season)
                        page_block.append(
                            f"HEADER|year_level={current_year}|planner_semester=null|semester={current_db_sem}|season={season}|year={term_match.group(3)}|text={row_text}"
                        )
                        continue

                    if re.match(r"^\s*Co-req:", row_text, re.IGNORECASE) and last_row_idx is not None:
                        page_block[last_row_idx] += " ; " + row_text
                        continue

                    code_match = UNIT_CODE_RE.search(row_text)
                    if code_match:
                        code = code_match.group(0)
                        row_year = _planner_sem_to_year(current_planner_sem) or current_year
                        page_block.append(
                            f"ROW|year_level={row_year}|planner_semester={current_planner_sem}|semester={current_db_sem}|unit_code={code}|text={row_text}"
                        )
                        last_row_idx = len(page_block) - 1

            deduped = []
            seen = set()
            for line in page_block:
                if line in seen:
                    continue
                seen.add(line)
                deduped.append(line)
            blocks.extend(deduped[:max_lines_per_page])

    return "\n".join(blocks)


def _extract_useful_raw_evidence_lines_enhanced(pdf_path, max_lines_per_page=120):
    blocks = []
    page_text_lines = _extract_page_lines(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        legend = detect_colour_legend(pdf)
        for page_number, page in enumerate(pdf.pages, start=1):
            page_lines = page_text_lines[page_number - 1]
            line_records = _extract_page_line_records(page)
            tables = page.find_tables()

            current_year = None
            current_planner_sem = None
            current_db_sem = None
            page_block = [f"PAGE {page_number}"]

            for raw_line in page_lines:
                line = _clean_evidence_line(raw_line)
                if not line:
                    continue
                if re.search(r"swinburne\.edu|last updated|degree planner|copyright", line, re.IGNORECASE):
                    continue

                year_match = YEAR_RE.match(line)
                if year_match:
                    token = year_match.group(1).lower()
                    current_year = YEAR_MAP.get(token, int(token) if token.isdigit() else None)
                    page_block.append(f"HEADER|year_level={current_year}|text={line}")
                    continue

                year_search = re.search(r"\bYear\s+(One|Two|Three|Four|Five|\d+)\b", line, re.IGNORECASE)
                if year_search and "credit point" not in line.lower():
                    token = year_search.group(1).lower()
                    current_year = YEAR_MAP.get(token, int(token) if token.isdigit() else None)
                    page_block.append(f"HEADER|year_level={current_year}|text=Year {year_search.group(1)}")
                    continue

                sem_match = SEM_RE.match(line)
                if sem_match:
                    current_planner_sem = int(sem_match.group(1))
                    current_db_sem = _planner_sem_to_db_sem(current_planner_sem)
                    season = sem_match.group(2)
                    year_text = sem_match.group(3)
                    page_block.append(
                        f"HEADER|year_level={current_year}|planner_semester={current_planner_sem}|semester={current_db_sem}|season={season}|year={year_text}|text={line}"
                    )
                    continue

                term_match = TERM_RE.match(line)
                if term_match:
                    season = term_match.group(1)
                    current_planner_sem = None
                    current_db_sem = _planner_sem_to_db_sem(None, season)
                    page_block.append(
                        f"HEADER|year_level={current_year}|planner_semester=null|semester={current_db_sem}|season={season}|year={term_match.group(3)}|text={line}"
                    )
                    continue

                if _is_useful_evidence_line(line) and not UNIT_CODE_RE.search(line):
                    info_type = "requirements" if re.search(r"\b(core units|major units|elective units|wil placement|industry training|industry placement|credit points?)\b", line, re.IGNORECASE) else "general"
                    page_block.append(f"INFO|type={info_type}|text={line}")

            for symbol, note_text in _extract_note_entries(page_lines):
                page_block.append(f"NOTE|symbol={symbol}|text={note_text}")

            for table in tables:
                extracted_rows = table.extract() or []
                last_row_idx = None
                row_idx = 0
                while row_idx < len(extracted_rows):
                    row_cells = extracted_rows[row_idx]
                    row_text = _row_cells_text(row_cells)
                    if not row_text:
                        row_idx += 1
                        continue
                    if re.search(r"unit code|unit name|pre-?requisites?", row_text, re.IGNORECASE):
                        row_idx += 1
                        continue

                    sem_match = SEM_RE.match(row_text)
                    if sem_match:
                        current_planner_sem = int(sem_match.group(1))
                        current_db_sem = _planner_sem_to_db_sem(current_planner_sem)
                        season = sem_match.group(2)
                        year_text = sem_match.group(3)
                        page_block.append(
                            f"HEADER|year_level={current_year}|planner_semester={current_planner_sem}|semester={current_db_sem}|season={season}|year={year_text}|text={row_text}"
                        )
                        row_idx += 1
                        continue

                    term_match = TERM_RE.match(row_text)
                    if term_match:
                        season = term_match.group(1)
                        current_planner_sem = None
                        current_db_sem = _planner_sem_to_db_sem(None, season)
                        page_block.append(
                            f"HEADER|year_level={current_year}|planner_semester=null|semester={current_db_sem}|season={season}|year={term_match.group(3)}|text={row_text}"
                        )
                        row_idx += 1
                        continue

                    if re.match(r"^\s*Co-req:", row_text, re.IGNORECASE) and last_row_idx is not None:
                        page_block[last_row_idx] += " ; " + row_text
                        row_idx += 1
                        continue

                    code_match = UNIT_CODE_RE.search(row_text)
                    if code_match:
                        code = code_match.group(0).rstrip("@#")
                        row_year = _planner_sem_to_year(current_planner_sem) or current_year
                        row_bbox = table.rows[row_idx].bbox if row_idx < len(table.rows) else None
                        continuation_lines = []
                        while row_idx + 1 < len(extracted_rows):
                            next_row_text = _row_cells_text(extracted_rows[row_idx + 1])
                            if not next_row_text:
                                row_idx += 1
                                continue
                            if UNIT_CODE_RE.search(next_row_text) or YEAR_RE.match(next_row_text) or SEM_RE.match(next_row_text) or TERM_RE.match(next_row_text):
                                break
                            if re.search(r"unit code|unit name|pre-?requisites?", next_row_text, re.IGNORECASE):
                                break
                            if _looks_like_note_line(next_row_text):
                                break
                            continuation_lines.append(_normalise_evidence_row_text(next_row_text))
                            row_idx += 1

                        line_context, merged_line_text = _collect_row_context_from_lines(line_records, row_bbox, code, row_text)
                        full_row_parts = [_normalise_evidence_row_text(row_text)]
                        for extra in continuation_lines:
                            if extra and extra not in full_row_parts:
                                full_row_parts.append(extra)
                        if merged_line_text and merged_line_text not in full_row_parts:
                            full_row_parts.append(merged_line_text)
                        full_row_text = _clean_evidence_line(" ".join(full_row_parts))
                        row_category = _row_category_for_evidence(page, row_bbox, legend)
                        page_block.append(
                            f"ROW|page={page_number}|year={row_year}|planner_semester={current_planner_sem}|semester={current_db_sem}|category={row_category}|unit_code={code}|text={full_row_text}"
                        )
                        row_block_idx = len(page_block) - 1
                        context_parts = []
                        if continuation_lines:
                            context_parts.extend(continuation_lines)
                        if line_context:
                            context_parts.extend(line_context)
                        if context_parts:
                            context_value = _clean_evidence_line(" ".join(context_parts))
                            page_block.append(f"CONTEXT|unit_code={code}|next_lines={context_value}")
                        last_row_idx = row_block_idx
                    row_idx += 1

            deduped = []
            seen = set()
            for line in page_block:
                if line in seen:
                    continue
                seen.add(line)
                deduped.append(line)
            blocks.extend(deduped[:max_lines_per_page])

    return "\n".join(blocks)


def extract_useful_raw_evidence_lines(pdf_path, max_lines_per_page=120, enhanced=False):
    if enhanced:
        return _extract_useful_raw_evidence_lines_enhanced(pdf_path, max_lines_per_page=max_lines_per_page)
    return _extract_useful_raw_evidence_lines_basic(pdf_path, max_lines_per_page=max_lines_per_page)


def build_improved_crosscheck_prompt(file_name, base_data, raw_lines, model_name=""):
    global _LAST_RAW_EVIDENCE
    _LAST_RAW_EVIDENCE = raw_lines or ""
    current_units = []
    cats = base_data.get("categories", {})
    unit_groups = [
        cats.get("core_units", []),
        cats.get("major_units", []),
        cats.get("elective_groups", {}).get("elective", []),
        cats.get("elective_groups", {}).get("prescribed_elective", []),
        cats.get("wil_group", []),
        cats.get("mpu_group", []),
    ]
    for group in unit_groups:
        for u in group:
            code = u.get("unit_code", u.get("code"))
            if code:
                current_units.append(str(code).strip().upper())
    current_units = sorted(set(current_units))
    current_units_str = ", ".join(current_units)
    base_json = json.dumps(base_data, ensure_ascii=False, indent=2)

    if "deepseek" in (model_name or "").lower():
        return f"""Return JSON only.
Do not explain anything.
Do not summarize the planner.
Do not give study advice.
Do not use markdown.

Task:
Compare the deterministic planner JSON against the RAW EVIDENCE.
Return only a minimal correction patch.

If no obvious correction is needed, return exactly:
[]

Otherwise return exactly one JSON array like:
[
  {{
    "action": "add" or "update",
    "unit_code": "CODE",
    "year_level": 1,
    "semester": 1,
    "category": "core" or "major_core" or "elective" or "wil" or "mpu" or "prescribed_elective" or null,
    "unit_name": "NAME",
    "prerequisite": null,
    "offered_in": null
  }}
]

Rules:
1. Return only JSON.
2. No prose before or after JSON.
3. If unsure, return [].
4. Add missing units only if ROW evidence clearly shows them.
5. Update existing units only if RAW EVIDENCE clearly proves a correction.
6. semester must only be 1, 2, 3, or 4.
7. prerequisite must be a string or null.

CURRENT UNIT CODES:
{current_units_str}

DETERMINISTIC JSON:
{base_json}

RAW EVIDENCE:
{raw_lines}
"""

    return f"""You are a university course planner extraction expert. Your task is to cross-check and correct a deterministic JSON extraction using raw PDF evidence.

CRITICAL INSTRUCTIONS:
1. The deterministic extraction may be incomplete.
2. Add missing units when ROW evidence clearly proves they exist.
3. Extract course metadata from INFO lines when clearly visible.
4. Fix year_level and semester values using HEADER context.
5. Return a JSON patch only.

CURRENT STATE:
- Units in deterministic JSON: {current_units_str}
- Total units currently in JSON: {len(current_units)}

EVIDENCE LINE TYPES:
- PAGE N: Page number marker
- HEADER|year_level=X|semester=Y|text=...: Year and semester context
- INFO|...: Course metadata, requirements, notes
- ROW|year_level=X|planner_semester=Y|semester=Z|unit_code=ABC12345|text=...: Unit row data

Return ONLY valid JSON with this EXACT structure:
{{
  "course_information": {{
    "course": string or null,
    "major": string or null,
    "intake": string or null,
    "intake_year": integer or null,
    "requirements": {{
      "core": {{"count": integer or null, "cp": integer or null}},
      "major": {{"count": integer or null, "cp": integer or null}},
      "elective": {{"count": integer or null, "cp": integer or null}},
      "wil": {{"count": integer or null, "cp": integer or null}}
    }}
  }},
  "unit_changes": [
    {{
      "action": "add" or "update",
      "unit_code": "CODE",
      "year_level": integer or null,
      "semester": integer or null,
      "category": "core" or "major_core" or "elective" or "wil" or "mpu" or "prescribed_elective" or null,
      "unit_name": string or null,
      "prerequisite": string or null,
      "offered_in": integer or null
    }}
  ]
}}

FIELD RULES:
1. category:
   - use row colour / legend evidence first
   - use requirement block labels and nearby HEADER/INFO context second
   - use row/table placement third
   - use unit-code prefix only as a last fallback
   - units mentioning Professional Experience, Industry Placement, Industry Training, Internship, Introductory Seminar or WIL wording should be "wil"
   - project/capstone units are not automatically WIL
2. semester must only be 1, 2, 3, or 4.
3. odd planner semester -> 1, even planner semester -> 2, Summer -> 3, Winter -> 4.
4. prerequisite must remain a single string, not an array.
5. If raw evidence is not enough to prove a change, keep the deterministic value.
6. Return JSON only.

DETERMINISTIC JSON:
{base_json}

RAW EVIDENCE:
{raw_lines}
"""


def apply_crosscheck_patch(base_data, patch_data, file_name):
    data = json.loads(json.dumps(base_data))
    if not isinstance(patch_data, dict):
        return data

    rejection_log = data.setdefault("_llm_rejections", [])

    def _is_missing(value):
        if value is None:
            return True
        if isinstance(value, str):
            cleaned = value.strip()
            return (
                not cleaned or
                cleaned.lower() in {
                    "string or null",
                    "integer or null",
                    "null",
                    "omitted",
                }
            )
        return False

    categories = data.setdefault("categories", {})
    containers = {
        "core": categories.setdefault("core_units", []),
        "major_core": categories.setdefault("major_units", []),
        "mpu": categories.setdefault("mpu_group", []),
        "prescribed_elective": categories.setdefault("elective_groups", {}).setdefault("prescribed_elective", []),
        "elective": categories.setdefault("elective_groups", {}).setdefault("elective", []),
        "wil": categories.setdefault("wil_group", []),
    }

    def rebuild_code_index():
        index = {}
        for category_name, items in containers.items():
            for item in items:
                code = str(item.get("unit_code", "")).strip().upper()
                if code:
                    index[code] = (category_name, item)
        return index

    code_index = rebuild_code_index()

    # Course information patch
    patch_ci = patch_data.get("course_information", {})
    if isinstance(patch_ci, dict):
        base_ci = data.setdefault("course_information", {})

        for key in ("course", "major", "intake", "intake_year"):
            value = patch_ci.get(key)

            if not _is_missing(base_ci.get(key)) and _is_missing(value):
                rejection_log.append({
                    "reason": "rejected_metadata_nulling",
                    "field": key,
                })

            if _is_missing(base_ci.get(key)) and value not in (None, ""):
                base_ci[key] = value

        patch_req = patch_ci.get("requirements", {})
        if isinstance(patch_req, dict):
            base_req = base_ci.setdefault("requirements", {})

            for req_key in ("core", "major", "elective", "wil"):
                req_value = patch_req.get(req_key)
                if not isinstance(req_value, dict):
                    continue

                target = base_req.setdefault(req_key, {"count": None, "cp": None})
                for field in ("count", "cp"):
                    if target.get(field) is not None and req_value.get(field) is None:
                        rejection_log.append({
                            "reason": "rejected_requirement_nulling",
                            "field": req_key + "." + field,
                        })

                    if target.get(field) is None and req_value.get(field) is not None:
                        target[field] = req_value.get(field)

    # Unit patch
    for change in patch_data.get("unit_changes", []):
        if not isinstance(change, dict):
            continue

        code = str(change.get("unit_code", "")).strip().upper()
        if not code:
            continue

        action = str(change.get("action", "update")).strip().lower()
        new_category = change.get("category")

        if new_category not in containers:
            new_category = None

        target_info = code_index.get(code)

        # Existing unit update
        if target_info:
            old_category, unit = target_info

            if action != "update":
                continue

            # Allow controlled category move
            if new_category and new_category != old_category:
                allowed_move = (
                    new_category == "wil"
                    or (old_category == "elective" and new_category == "prescribed_elective")
                    or (old_category == "prescribed_elective" and new_category == "elective")
                )

                if allowed_move:
                    try:
                        containers[old_category].remove(unit)
                    except ValueError:
                        pass

                    unit["category"] = new_category
                    containers[new_category].append(unit)
                    code_index[code] = (new_category, unit)

                    rejection_log.append({
                        "reason": "accepted_category_change",
                        "unit_code": code,
                        "from": old_category,
                        "to": new_category,
                    })
                else:
                    rejection_log.append({
                        "reason": "rejected_category_change",
                        "unit_code": code,
                        "from": old_category,
                        "to": new_category,
                    })

            # Keep deterministic extraction as the base for existing units.
            # Existing row details are cleaned later by generic post-processing,
            # so raw LLM patches only fill fields that are currently empty.
            for field in ("year_level", "semester", "unit_name", "prerequisite", "offered_in"):
                value = change.get(field)
                if _is_missing(unit.get(field)) and not _is_missing(value):
                    unit[field] = value

            prereq_value = change.get("prerequisite")
            if (
                not _is_missing(unit.get("prerequisite")) and
                not _is_missing(prereq_value) and
                _is_safe_existing_prereq_upgrade(unit.get("prerequisite"), prereq_value, code, _LAST_RAW_EVIDENCE)
            ):
                unit["prerequisite"] = normalize_prerequisite(
                    prereq_value,
                    unit.get("unit_name"),
                    code,
                    _LAST_RAW_EVIDENCE,
                )
                rejection_log.append({
                    "reason": "accepted_existing_prereq_upgrade",
                    "unit_code": code,
                })

            continue

        # New unit add
        if action != "add":
            continue

        category = new_category or "elective"

        new_unit = {
            "year_level": change.get("year_level"),
            "semester": change.get("semester"),
            "category": category,
            "unit_code": code,
            "unit_name": change.get("unit_name") or "",
            "prerequisite": change.get("prerequisite"),
            "offered_in": change.get("offered_in"),
        }

        containers[category].append(new_unit)
        code_index[code] = (category, new_unit)

    return normalise_llm_output(data, file_name)


def clean_unit_name(name):
    if not name:
        return name
    name = re.sub(r'\s+[A-Z]{3}\d{3,5}[@#]?\s*', ' ', str(name))
    name = name.replace('@', '').replace('#', '').replace('†', '').replace('*', '')
    if name.endswith(' Nil'):
        name = name[:-4]
    name = re.sub(r'\b(\w+)(?:\s+\1)+\b', r'\1', name)
    name = re.sub(r'(\([^()]+\))(?:\s+\1)+', r'\1', name)
    name = re.sub(
        r'^([A-Za-z&/()]+)\s+Professional Experience in$',
        r'Professional Experience in \1',
        name
    )
    return re.sub(r'\s+', ' ', name).strip()


def _name_compare_key(text):
    value = clean_unit_name(text or "")
    value = re.sub(r"\s+", " ", str(value)).strip()
    return value.lower()


def _symbol_cleanup_only(old_name, new_name):
    old_clean = re.sub(r"[@#*†]", "", str(old_name or ""))
    new_clean = re.sub(r"[@#*†]", "", str(new_name or ""))
    return re.sub(r"\s+", " ", old_clean).strip().lower() == re.sub(r"\s+", " ", new_clean).strip().lower()


def _duplicate_phrase_cleanup_only(old_name, new_name):
    old = re.sub(r"\s+", " ", str(old_name or "")).strip()
    new = re.sub(r"\s+", " ", str(new_name or "")).strip()
    if not old or not new:
        return False
    old_deduped = re.sub(r'(\([^()]+\))(?:\s+\1)+', r'\1', old)
    old_deduped = re.sub(r'\b(\w+)(?:\s+\1)+\b', r'\1', old_deduped)
    old_deduped = re.sub(r"\s+", " ", old_deduped).strip()
    return old_deduped.lower() == new.lower()


def _strip_name_bleed_from_prereq(prereq, unit_name):
    if not prereq or not unit_name:
        return prereq
    cleaned = str(prereq)
    code_mentions = re.findall(r'\b[A-Z]{3}\d{3,5}\b', cleaned)
    if len(code_mentions) < 2:
        return re.sub(r"\s+", " ", cleaned).strip()
    name_tokens = [
        token for token in re.findall(r"[A-Za-z][A-Za-z*#@-]+", str(unit_name))
        if len(token.strip("*#@-")) >= 5
    ]
    for token in sorted(set(name_tokens), key=len, reverse=True):
        cleaned = re.sub(rf"\b{re.escape(token)}\b", " ", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _dedupe_repeated_prereq_segments(prereq):
    text = re.sub(r"\s+", " ", str(prereq)).strip()
    exact_dup = re.match(r"^(.+?)\s+\1$", text, flags=re.IGNORECASE)
    if exact_dup:
        return exact_dup.group(1).strip()

    tokens = text.split()
    for size in range(len(tokens) // 2, 1, -1):
        if tokens[:size] == tokens[-size:]:
            return " ".join(tokens[:size]).strip()
    return text


def _prereq_codes(text):
    return [match.rstrip("@#") for match in re.findall(r"\b[A-Z]{3}\d{3,5}@?#?\b", str(text or ""))]


def _unique_preserve_order(items):
    output = []
    seen = set()
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


def _has_trailing_connector(text):
    return bool(re.search(r"(?:\bOR\b|\bAND\b|&|/|,)\s*$", str(text or "").strip(), re.IGNORECASE))


def _strip_trailing_offered_marker(text):
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    value = re.sub(
        r"\s+(?:Semester\s+[12](?:\s+only)?|Feb/Mar(?:\s+\w{0,4})?|Aug/Sept(?:\s+\w{0,4})?)\s*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", value).strip()


def _is_code_connector_only_prereq(text):
    cleaned = str(text or "").replace("*", " ")
    cleaned = re.sub(r"\b(?:OR|AND|Co-req:)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[,&/;()]", " ", cleaned)
    cleaned = re.sub(r"\b[A-Z]{3}\d{3,5}@?#?\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned == ""


def _choose_code_connector(codes, text):
    sample = str(text or "")
    if re.search(r"(?:\bOR\b|/)", sample, re.IGNORECASE):
        return " OR "
    if "&" in sample and not re.search(r"\bOR\b", sample, re.IGNORECASE):
        return " & "
    if re.search(r"\bAND\b", sample, re.IGNORECASE) and not re.search(r"\bOR\b", sample, re.IGNORECASE):
        return " AND "
    return " OR " if len(codes) > 1 else " "


def _rebuild_code_connector_prereq(text):
    original = re.sub(r"\s+", " ", str(text or "")).strip()
    if not original:
        return None
    cleaned = original.replace("*", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    codes = _prereq_codes(cleaned)
    if not codes:
        cleaned = re.sub(r'\s+(OR|AND|&|/|,|;)\s*$', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^\s*(OR|AND|&|/|,|;)\s+', '', cleaned, flags=re.IGNORECASE)
        return re.sub(r"\s+", " ", cleaned).strip() or None
    if _is_code_connector_only_prereq(cleaned):
        unique_codes = _unique_preserve_order(codes)
        connector = _choose_code_connector(unique_codes, cleaned)
        return connector.join(unique_codes)
    return re.sub(r"\s+", " ", cleaned).strip()


def _should_rebuild_code_connector_prereq(text):
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if not value:
        return False
    codes = _prereq_codes(value)
    if len(codes) < 2:
        return False
    if "*" in value:
        return True
    if _has_trailing_connector(value):
        return True
    if len(codes) != len(_unique_preserve_order(codes)):
        return True
    return False


def _parse_row_evidence(raw_evidence):
    rows = []
    for idx, line in enumerate((raw_evidence or "").splitlines()):
        if not line.startswith("ROW|"):
            continue
        prefix, sep, text_value = line.partition("|text=")
        parts = prefix.split("|")
        row = {"_index": idx}
        for part in parts[1:]:
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            row[key] = value
        row["text"] = text_value if sep else row.get("text", "")
        row["unit_code"] = str(row.get("unit_code", "")).rstrip("@#").upper()
        rows.append(row)
    return rows


def _extract_prereq_candidate_from_row_evidence(code, raw_evidence):
    rows = _parse_row_evidence(raw_evidence)
    code = str(code or "").rstrip("@#").upper()
    for idx, row in enumerate(rows):
        if row.get("unit_code") != code:
            continue
        text = row.get("text", "")
        parts = [part.strip() for part in text.split(" | ") if part.strip()]
        prereq_parts = []
        if len(parts) >= 3:
            prereq_parts.append(parts[-1])
        elif len(parts) == 2 and re.search(r"\b(?:OR|AND|Co-req:|credit points?|CPs?)\b|[&/]", parts[-1], re.IGNORECASE):
            prereq_parts.append(parts[-1])

        if prereq_parts and _has_trailing_connector(prereq_parts[-1]):
            base_year = row.get("year_level")
            base_plan_sem = row.get("planner_semester")
            base_db_sem = row.get("semester")
            for next_row in rows[idx + 1:]:
                if (
                    next_row.get("year_level") != base_year or
                    next_row.get("planner_semester") != base_plan_sem or
                    next_row.get("semester") != base_db_sem
                ):
                    break
                next_text = re.sub(r"\s+", " ", next_row.get("text", "")).strip()
                if re.fullmatch(r"[A-Z]{3}\d{3,5}(?:[@#]?\s*(?:OR|AND|&|/))?", next_text, re.IGNORECASE):
                    prereq_parts.append(next_text)
                    if not _has_trailing_connector(next_text):
                        break
                    continue
                break

        candidate = _rebuild_code_connector_prereq(" ".join(prereq_parts))
        candidate = _strip_trailing_offered_marker(candidate)
        if candidate:
            return candidate
    return None


def _is_safe_existing_prereq_upgrade(old_prereq, new_prereq, unit_code, raw_evidence=None):
    if not old_prereq or not new_prereq:
        return False
    old_metrics = _prereq_quality_metrics(old_prereq)
    new_metrics = _prereq_quality_metrics(new_prereq)
    evidence_candidate = _extract_prereq_candidate_from_row_evidence(unit_code, raw_evidence or _LAST_RAW_EVIDENCE)
    evidence_metrics = _prereq_quality_metrics(evidence_candidate) if evidence_candidate else None

    if not new_metrics["valid"] or not evidence_candidate or not evidence_metrics["valid"]:
        return False

    old_set = set(old_metrics["unique_codes"])
    new_set = set(new_metrics["unique_codes"])
    evidence_set = set(evidence_metrics["unique_codes"])

    if old_set and not new_set.issuperset(old_set):
        return False
    if old_set and not evidence_set.issuperset(old_set):
        return False

    old_text = old_metrics["text"]
    new_text = new_metrics["text"]
    evidence_text = evidence_metrics["text"]

    if clean_unit_name(new_text).lower() != clean_unit_name(evidence_text).lower():
        return False

    if new_text == old_text:
        return False

    if (
        old_set == new_set == evidence_set and
        len(new_text) > len(old_text) and
        evidence_text.lower().startswith(old_text.lower())
    ):
        return True

    if (
        old_set == new_set == evidence_set and
        (
            old_metrics["duplicates"] > new_metrics["duplicates"] or
            old_metrics["has_trailing_connector"] or
            old_metrics["has_honours_noise"]
        )
    ):
        return True

    return False


def _prereq_quality_metrics(text):
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    codes = _prereq_codes(value)
    unique_codes = _unique_preserve_order(codes)
    return {
        "text": value,
        "codes": codes,
        "unique_codes": unique_codes,
        "duplicates": max(len(codes) - len(unique_codes), 0),
        "has_trailing_connector": _has_trailing_connector(value),
        "has_honours_noise": "*" in value,
        "has_credit_points": bool(re.search(r"\b(?:credit points?|cp|cps)\b", value, re.IGNORECASE)),
        "has_coreq": "co-req" in value.lower(),
        "valid": bool(codes) or bool(re.search(r"\b(?:credit points?|cp|cps|nil|co-req)\b", value, re.IGNORECASE)),
    }


def _prefer_cleaner_prerequisite(current_prereq, candidate_prereq):
    if not candidate_prereq:
        return current_prereq
    current = _prereq_quality_metrics(current_prereq)
    candidate = _prereq_quality_metrics(candidate_prereq)
    if not candidate["valid"]:
        return current_prereq
    if not current["valid"]:
        return candidate["text"]
    if not candidate["codes"] and current["codes"]:
        return current_prereq
    if current["codes"] and candidate["codes"]:
        current_set = set(current["unique_codes"])
        candidate_set = set(candidate["unique_codes"])
        if candidate_set and not candidate_set.issuperset(current_set) and not current_set.issuperset(candidate_set):
            return current_prereq
        if (
            current_set == candidate_set and
            len(candidate["text"]) > len(current["text"]) and
            candidate["text"].lower().startswith(current["text"].lower())
        ):
            return candidate["text"]
        if current["duplicates"] > candidate["duplicates"]:
            return candidate["text"]
        if current["has_trailing_connector"] and not candidate["has_trailing_connector"]:
            return candidate["text"]
        if current["has_honours_noise"] and not candidate["has_honours_noise"]:
            return candidate["text"]
        if current_set == candidate_set and current["codes"] != candidate["codes"]:
            return candidate["text"]
    if len(candidate["text"]) < len(current["text"]) and _looks_like_truncated_prereq(current["text"], candidate["text"]):
        return current_prereq
    if candidate["text"] != current["text"] and len(candidate["text"]) <= len(current["text"]):
        if current["has_trailing_connector"] or current["has_honours_noise"]:
            return candidate["text"]
    return candidate["text"] if candidate["text"] == current["text"] else current_prereq


def _is_bad_unit_name(text):
    if not text:
        return False
    name = re.sub(r"\s+", " ", str(text)).strip()
    lowered = name.lower()
    if lowered.endswith((" or", " and", " &")):
        return True
    if ", ," in name or name.count(",") >= 4:
        return True
    if lowered.count("or other elective") > 0:
        return True
    if re.search(r"\b(credit points?|please refer to elective list|nil)\b", name, re.IGNORECASE):
        return True
    if re.match(r"^[A-Z]{3}\d{3,5}\b", name):
        return True
    return False


def _is_worse_unit_name(old_name, new_name):
    if not old_name or not new_name:
        return False
    old = re.sub(r"\s+", " ", str(old_name)).strip()
    new = re.sub(r"\s+", " ", str(new_name)).strip()
    if old == new:
        return False
    if _name_compare_key(old) == _name_compare_key(new):
        return False
    if _symbol_cleanup_only(old, new):
        return False
    if _duplicate_phrase_cleanup_only(old, new):
        return False
    if _is_bad_unit_name(new):
        return True
    old_words = set(re.findall(r"[A-Za-z][A-Za-z'-]*", old.lower()))
    new_words = set(re.findall(r"[A-Za-z][A-Za-z'-]*", new.lower()))
    shared_words = old_words & new_words
    if (
        shared_words and
        len(new) >= int(len(old) * 0.7) and
        len(shared_words) >= max(1, min(len(old_words), len(new_words)) // 2) and
        not _is_bad_unit_name(old)
    ):
        return False
    if len(new) < len(old) and old.lower().startswith(new.lower()):
        tail = old[len(new):].strip(" ,;:-")
        if tail and re.fullmatch(r'(?:[A-Z]{3}\d{3,5}[@#]?\s*)+', tail):
            return False
        return True
    return False


def _looks_like_truncated_prereq(old_prereq, new_prereq):
    if not old_prereq or not new_prereq:
        return False
    old = re.sub(r"\s+", " ", str(old_prereq)).strip()
    new = re.sub(r"\s+", " ", str(new_prereq)).strip()
    if old == new:
        return False
    old_metrics = _prereq_quality_metrics(old)
    new_metrics = _prereq_quality_metrics(new)
    if (
        old_metrics["unique_codes"] and
        old_metrics["unique_codes"] == new_metrics["unique_codes"] and
        (
            old_metrics["duplicates"] > new_metrics["duplicates"] or
            old_metrics["has_honours_noise"] or
            old_metrics["has_trailing_connector"]
        )
    ):
        return False
    if len(new) < len(old) and old.lower().startswith(new.lower()):
        return True
    if len(new) <= len(old) * 0.75 and all(token.lower() in old.lower() for token in new.split()):
        return True
    return False


def normalize_prerequisite(prereq, unit_name=None, unit_code=None, raw_evidence=None):
    if not prereq:
        return prereq
    prereq = _strip_name_bleed_from_prereq(prereq, unit_name)
    prereq = re.sub(r'\s+Co-req:', '; Co-req:', str(prereq))
    if _should_rebuild_code_connector_prereq(prereq):
        prereq = _rebuild_code_connector_prereq(prereq)
    prereq = _dedupe_repeated_prereq_segments(prereq)
    evidence_candidate = _extract_prereq_candidate_from_row_evidence(unit_code, raw_evidence or _LAST_RAW_EVIDENCE)
    prereq = _prefer_cleaner_prerequisite(prereq, evidence_candidate)
    prereq = re.sub(r'\s+(OR|AND|&|;)\s*$', '', prereq, flags=re.IGNORECASE)
    prereq = re.sub(r'^\s*(OR|AND|&|;)\s+', '', prereq, flags=re.IGNORECASE)
    prereq = re.sub(r'\s+', ' ', prereq).strip()
    return prereq or None


def _looks_like_double_degree(course_information):
    course = str(course_information.get("course") or "")
    major = str(course_information.get("major") or "")
    return course.count("Bachelor of") >= 2 or " / " in course or major.lower().count("major") >= 2


def _is_project_like_core_candidate(unit):
    name = str(unit.get("unit_name", "") or "")
    lowered = name.lower()
    return any(
        phrase in lowered
        for phrase in (
            "project a",
            "project b",
            "technology project",
            "research project",
            "final year project",
            "capstone",
        )
    )


def apply_enhanced_crosscheck_patch(base_data, patch_data, file_name):
    data = apply_crosscheck_patch(base_data, patch_data, file_name)
    rejection_log = data.setdefault("_llm_rejections", [])
    existing_codes = {
        str(u.get("unit_code", "")).strip().upper()
        for group_name in ("core_units", "major_units", "mpu_group", "prescribed_elective", "elective", "wil_group")
        for u in _group_units(base_data, group_name)
        if str(u.get("unit_code", "")).strip()
    }

    def process_unit(unit):
        code = str(unit.get('unit_code', '')).strip().upper()
        is_existing = code in existing_codes
        if not is_existing and 'semester' in unit:
            original_sem = unit['semester']
            unit['semester'] = _planner_sem_to_db_sem(unit['semester']) if coerce_int(unit['semester']) and coerce_int(unit['semester']) > 4 else coerce_int(unit['semester'])
            if unit.get('year_level') is None and original_sem is not None:
                unit['year_level'] = _planner_sem_to_year(original_sem)
        original_name = unit.get('unit_name')
        if 'unit_name' in unit:
            unit['unit_name'] = clean_unit_name(unit['unit_name'])
            if _is_worse_unit_name(original_name, unit.get('unit_name')):
                unit['unit_name'] = original_name
                rejection_log.append({
                    "reason": "rejected_name_quality",
                    "unit_code": code or None,
                })
        original_prereq = unit.get('prerequisite')
        if 'prerequisite' in unit and unit['prerequisite']:
            unit['prerequisite'] = normalize_prerequisite(
                unit['prerequisite'],
                unit.get('unit_name'),
                code,
                _LAST_RAW_EVIDENCE,
            )
            if _looks_like_truncated_prereq(original_prereq, unit.get('prerequisite')):
                unit['prerequisite'] = original_prereq
                rejection_log.append({
                    "reason": "rejected_prereq_truncation",
                    "unit_code": code or None,
                })
        return unit

    cats = data.get('categories', {})
    for key in ('core_units', 'major_units', 'mpu_group', 'wil_group'):
        cats[key] = [process_unit(u) for u in cats.get(key, [])]
    eg = cats.get('elective_groups', {})
    eg['elective'] = [process_unit(u) for u in eg.get('elective', [])]
    eg['prescribed_elective'] = [process_unit(u) for u in eg.get('prescribed_elective', [])]

    ci = data.get('course_information', {})
    reqs = ci.get('requirements', {}) if isinstance(ci, dict) else {}
    core_target = coerce_int(((reqs.get('core') or {}).get('count')) if isinstance(reqs, dict) else None)
    major_target = coerce_int(((reqs.get('major') or {}).get('count')) if isinstance(reqs, dict) else None)
    core_units = cats.get('core_units', [])
    major_units = cats.get('major_units', [])
    core_shortfall = max((core_target - len(core_units)) if core_target is not None else 0, 0)
    major_overflow = max((len(major_units) - major_target) if major_target is not None else 0, 0)

    promoted_core = []
    kept_major = []
    for unit in major_units:
        if core_shortfall > 0 and major_overflow > 0 and _is_project_like_core_candidate(unit):
            unit['category'] = 'core'
            promoted_core.append(unit)
            core_shortfall -= 1
            major_overflow -= 1
        else:
            kept_major.append(unit)
    if promoted_core:
        cats['major_units'] = kept_major
        cats.setdefault('core_units', []).extend(promoted_core)
    return data


def _normalise_unit(u):
    if not isinstance(u, dict):
        return None

    raw_code = str(u.get("unit_code", u.get("code", ""))).strip()
    raw_name = u.get("unit_name", u.get("name"))
    raw_category = u.get("category")
    if raw_category is None:
        raw_category = u.get("type")
    raw_category = output_category(raw_category)

    if raw_code.upper() == "NONE":
        return None

    if re.fullmatch(r"(?i)elective\s+\d+", raw_code):
        code = "-"
        if not raw_name:
            raw_name = raw_code.title()
    else:
        code = raw_code.upper()
        if not code:
            code = "-"

    prerequisite = u.get("prerequisite", u.get("prereq"))
    if prerequisite in ("Nil", "None", "null", ""):
        prerequisite = None
    else:
        prerequisite = normalise_prereq_text(prerequisite)

    offered_in = u.get("offered_in", u.get("offered"))
    if offered_in in ("None", "null", ""):
        offered_in = None
    else:
        offered_in = normalise_offered_in(offered_in)

    name = raw_name
    if isinstance(name, str):
        name = re.sub(r"\s+", " ", name).strip()
        if name.endswith(" Nil") and prerequisite is None:
            name = name[:-4].rstrip()

    return {
        "year_level": coerce_int(u.get("year_level", u.get("year"))),
        "semester": coerce_int(u.get("semester")),
        "category": raw_category,
        "unit_code": code,
        "unit_name": name,
        "prerequisite": prerequisite,
        "offered_in": offered_in,
    }


def normalise_llm_output(data, file_name):
    if not isinstance(data, dict):
        data = {}

    data["file_name"] = file_name
    course_information = data.get("course_information")
    if not isinstance(course_information, dict):
        course_information = {}
    requirements = course_information.get("requirements")
    if not isinstance(requirements, dict):
        requirements = {}
    for key in ("core", "major", "elective", "wil"):
        value = requirements.get(key)
        if not isinstance(value, dict):
            value = {}
        requirements[key] = {
            "count": coerce_int(value.get("count")),
            "cp": coerce_int(value.get("cp")),
        }
    course_information["requirements"] = requirements
    course_information["intake_year"] = coerce_int(course_information.get("intake_year", course_information.get("intakeYear")))
    if "intakeYear" in course_information:
        course_information.pop("intakeYear", None)
    data["course_information"] = course_information

    categories = data.get("categories")
    if not isinstance(categories, dict):
        categories = {}

    flat_units = data.get("units")
    if isinstance(flat_units, list) and not any(
        isinstance(categories.get(key), list) and categories.get(key)
        for key in ("coreUnits", "majorUnits", "mpuGroup", "wilGroup", "core_units", "major_units", "mpu_group", "wil_group")
    ):
        rebuilt = {
            "core_units": [],
            "major_units": [],
            "mpu_group": [],
            "elective_groups": {"prescribed_elective": [], "elective": []},
            "wil_group": [],
        }
        for item in flat_units:
            unit = _normalise_unit(item)
            if not unit:
                continue
            category = unit.get("category")
            if category == "core":
                rebuilt["core_units"].append(unit)
            elif category in ("major_core", "major"):
                rebuilt["major_units"].append(unit)
            elif category == "mpu":
                rebuilt["mpu_group"].append(unit)
            elif category == "wil":
                rebuilt["wil_group"].append(unit)
            elif category == "prescribed_elective":
                rebuilt["elective_groups"]["prescribed_elective"].append(unit)
            else:
                unit["category"] = "elective"
                rebuilt["elective_groups"]["elective"].append(unit)
        categories = rebuilt

    if "coreUnits" in categories and "core_units" not in categories:
        categories["core_units"] = categories.pop("coreUnits")
    if "majorUnits" in categories and "major_units" not in categories:
        categories["major_units"] = categories.pop("majorUnits")
    if "mpuGroup" in categories and "mpu_group" not in categories:
        categories["mpu_group"] = categories.pop("mpuGroup")
    if "wilGroup" in categories and "wil_group" not in categories:
        categories["wil_group"] = categories.pop("wilGroup")
    if "electiveGroups" in categories and "elective_groups" not in categories:
        categories["elective_groups"] = categories.pop("electiveGroups")

    elective_groups = categories.get("elective_groups")
    if not isinstance(elective_groups, dict):
        elective_groups = {}

    misplaced_elective = categories.pop("elective", None)
    if isinstance(misplaced_elective, list) and not elective_groups.get("elective"):
        elective_groups["elective"] = misplaced_elective

    misplaced_prescribed = categories.pop("prescribedElective", None)
    if isinstance(misplaced_prescribed, list) and not elective_groups.get("prescribed_elective"):
        elective_groups["prescribed_elective"] = misplaced_prescribed
    if "prescribedElective" in elective_groups and "prescribed_elective" not in elective_groups:
        elective_groups["prescribed_elective"] = elective_groups.pop("prescribedElective")

    misplaced_wil = categories.pop("wil", None)
    if isinstance(misplaced_wil, list) and not categories.get("wil_group"):
        categories["wil_group"] = misplaced_wil

    def normalise_unit_list(lst):
        output = []
        for item in lst if isinstance(lst, list) else []:
            unit = _normalise_unit(item)
            if unit:
                output.append(unit)
        return output

    categories["core_units"] = normalise_unit_list(categories.get("core_units", []))
    categories["major_units"] = normalise_unit_list(categories.get("major_units", []))
    categories["mpu_group"] = normalise_unit_list(categories.get("mpu_group", []))
    categories["wil_group"] = normalise_unit_list(categories.get("wil_group", []))

    elective_groups["prescribed_elective"] = normalise_unit_list(elective_groups.get("prescribed_elective", []))
    elective_groups["elective"] = normalise_unit_list(elective_groups.get("elective", []))
    categories["elective_groups"] = elective_groups

    # Repair obvious group placement mistakes from the LLM.
    promoted_mpu = []
    for group_name in ("core_units", "major_units"):
        kept = []
        for unit in categories.get(group_name, []):
            if (unit.get("unit_code") or "").startswith("MPU"):
                unit["category"] = "mpu"
                promoted_mpu.append(unit)
            else:
                kept.append(unit)
        categories[group_name] = kept
    if promoted_mpu:
        categories["mpu_group"].extend(promoted_mpu)

    for unit in categories["mpu_group"]:
        unit["category"] = "mpu"
    for unit in categories["core_units"]:
        unit["category"] = "core"
    for unit in categories["major_units"]:
        unit["category"] = "major_core"
    for unit in categories["wil_group"]:
        unit["category"] = "wil"
    for unit in categories["elective_groups"]["prescribed_elective"]:
        unit["category"] = "prescribed_elective"
    for unit in categories["elective_groups"]["elective"]:
        unit["category"] = "elective"

    data["categories"] = {
        "core_units": categories["core_units"],
        "major_units": categories["major_units"],
        "mpu_group": categories["mpu_group"],
        "elective_groups": categories["elective_groups"],
        "wil_group": categories["wil_group"],
    }
    return data


def unit_count_snapshot(data):
    categories = data.get("categories", {})
    elective_groups = categories.get("elective_groups", {})
    return {
        "core_units": len(categories.get("core_units", [])),
        "major_units": len(categories.get("major_units", [])),
        "mpu_group": len(categories.get("mpu_group", [])),
        "prescribed_elective": len(elective_groups.get("prescribed_elective", [])),
        "elective": len(elective_groups.get("elective", [])),
        "wil_group": len(categories.get("wil_group", [])),
    }


def _group_units(data, group_name):
    categories = data.get("categories", {})
    if group_name == "prescribed_elective":
        return categories.get("elective_groups", {}).get("prescribed_elective", [])
    if group_name == "elective":
        return categories.get("elective_groups", {}).get("elective", [])
    return categories.get(group_name, [])


def _unit_index(units):
    index = {}
    for unit in units if isinstance(units, list) else []:
        code = str(unit.get("unit_code", unit.get("code", ""))).strip().upper()
        name = str(unit.get("unit_name", unit.get("name", ""))).strip()
        key = (code, name)
        index[key] = unit
    return index


def _unit_index_by_code(units):
    index = {}
    for unit in units if isinstance(units, list) else []:
        code = str(unit.get("unit_code", unit.get("code", ""))).strip().upper()
        if code:
            index[code] = unit
    return index


def _normalised_text(value):
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _value_loss(base_value, llm_value):
    base_norm = _normalised_text(base_value)
    llm_norm = _normalised_text(llm_value)
    return base_norm is not None and llm_norm is None


def _allowed_existing_semester_change(base_unit, llm_unit, course_information):
    return False


def should_accept_llm_output(base_data, llm_data):
    def allowed_project_promotions():
        base_core = _unit_index_by_code(_group_units(base_data, "core_units"))
        base_major = _unit_index_by_code(_group_units(base_data, "major_units"))
        llm_core = _unit_index_by_code(_group_units(llm_data, "core_units"))
        llm_major = _unit_index_by_code(_group_units(llm_data, "major_units"))

        ci = llm_data.get('course_information', {})
        reqs = ci.get('requirements', {}) if isinstance(ci, dict) else {}
        core_target = coerce_int(((reqs.get('core') or {}).get('count')) if isinstance(reqs, dict) else None)
        major_target = coerce_int(((reqs.get('major') or {}).get('count')) if isinstance(reqs, dict) else None)
        base_core_count = len(base_core)
        base_major_count = len(base_major)
        core_shortfall = max((core_target - base_core_count) if core_target is not None else 0, 0)
        major_overflow = max((base_major_count - major_target) if major_target is not None else 0, 0)

        promoted = set()
        for key, unit in llm_core.items():
            if key in base_core:
                continue
            if key in base_major and _is_project_like_core_candidate(unit) and core_shortfall > 0 and major_overflow > 0:
                promoted.add(key)
                core_shortfall -= 1
                major_overflow -= 1
        return promoted

    allowed_promotions = allowed_project_promotions()
    base_counts = unit_count_snapshot(base_data)
    llm_counts = unit_count_snapshot(llm_data)

    if llm_counts["core_units"] < base_counts["core_units"]:
        return False, "LLM reduced core_units count"
    if llm_counts["major_units"] < base_counts["major_units"] - len(allowed_promotions):
        return False, "LLM reduced major_units count"
    if llm_counts["elective"] < base_counts["elective"]:
        return False, "LLM reduced elective count"
    if llm_counts["prescribed_elective"] < base_counts["prescribed_elective"]:
        return False, "LLM reduced prescribed_elective count"
    if llm_counts["mpu_group"] < base_counts["mpu_group"]:
        return False, "LLM reduced mpu_group count"
    if llm_counts["wil_group"] < base_counts["wil_group"]:
        return False, "LLM reduced wil_group count"

    for group_name in ("core_units", "major_units", "mpu_group", "prescribed_elective", "elective", "wil_group"):
        base_units = _group_units(base_data, group_name)
        llm_units = _group_units(llm_data, group_name)
        base_index = _unit_index_by_code(base_units)
        llm_index = _unit_index_by_code(llm_units)

        base_keys = set(base_index.keys())
        llm_keys = set(llm_index.keys())
        if group_name == "core_units":
            if llm_keys != (base_keys | allowed_promotions):
                return False, "LLM changed unit membership in " + group_name
        elif group_name == "major_units":
            if llm_keys != (base_keys - allowed_promotions):
                return False, "LLM changed unit membership in " + group_name
        elif base_keys != llm_keys:
            return False, "LLM changed unit membership in " + group_name

        for key, base_unit in base_index.items():
            if group_name == "major_units" and key in allowed_promotions:
                continue
            llm_unit = llm_index[key]
            if llm_unit.get("category") != base_unit.get("category"):
                base_cat = base_unit.get("category")
                llm_cat = llm_unit.get("category")
                code = base_unit.get("unit_code") or "-"

                allowed_category_change = (
                    llm_cat == "wil"
                    or (base_cat == "elective" and llm_cat == "prescribed_elective")
                    or (base_cat == "prescribed_elective" and llm_cat == "elective")
                )

                if not allowed_category_change:
                    return False, "LLM changed category for " + code
            if llm_unit.get("year_level") != base_unit.get("year_level"):
                return False, "LLM changed year_level for " + (base_unit.get("unit_code") or "-")
            if (
                llm_unit.get("semester") != base_unit.get("semester") and
                not _allowed_existing_semester_change(
                    base_unit,
                    llm_unit,
                    llm_data.get("course_information", {}),
                )
            ):
                return False, "LLM changed semester for " + (base_unit.get("unit_code") or "-")
            if _is_worse_unit_name(base_unit.get("unit_name"), llm_unit.get("unit_name")):
                return False, "LLM worsened unit_name for " + (base_unit.get("unit_code") or "-")
            if _looks_like_truncated_prereq(base_unit.get("prerequisite"), llm_unit.get("prerequisite")):
                return False, "LLM truncated prerequisite for " + (base_unit.get("unit_code") or "-")
            if _value_loss(base_unit.get("prerequisite"), llm_unit.get("prerequisite")):
                return False, "LLM removed prerequisite for " + (base_unit.get("unit_code") or "-")
            if _value_loss(base_unit.get("offered_in"), llm_unit.get("offered_in")):
                return False, "LLM removed offered_in for " + (base_unit.get("unit_code") or "-")

    base_ci = base_data.get("course_information", {})
    llm_ci = llm_data.get("course_information", {})
    for key in ("course", "major", "intake", "intake_year"):
        if _value_loss(base_ci.get(key), llm_ci.get(key)):
            return False, "LLM removed course_information." + key

    return True, None


# ---------------------------
# Parse JSON from LLM response
# ---------------------------
def extract_json(text):
    cleaned = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    if cleaned == "[]":
        return {"course_information": {}, "unit_changes": []}
    decoder = json.JSONDecoder()
    for idx, ch in enumerate(cleaned):
        if ch not in "{[":
            continue
        try:
            obj, _ = decoder.raw_decode(cleaned[idx:])
            if obj == []:
                return {"course_information": {}, "unit_changes": []}
            return obj
        except json.JSONDecodeError:
            continue
    raise ValueError("No valid JSON object found in LLM response")


# ---------------------------
# Validate and normalise
# ---------------------------
def validate_and_normalise(data, silent=False):
    errors = []

    ci = data.get("course_information", {})
    if not ci.get("course"):
        errors.append("Missing course_information.course")
    if not ci.get("major"):
        errors.append("Missing course_information.major")
    if not ci.get("intake"):
        errors.append("Missing course_information.intake")
    if not ci.get("intake_year"):
        errors.append("Missing course_information.intake_year")

    cats = data.get("categories", {})
    if not isinstance(cats.get("elective_groups"), dict):
        errors.append("categories.elective_groups is missing or invalid")
        cats["elective_groups"] = {"prescribed_elective": [], "elective": []}

    eg = cats.get("elective_groups", {})

    if not cats.get("core_units"):
        errors.append("core_units is empty")
    if not cats.get("major_units"):
        errors.append("major_units is empty")
    if "prescribed_elective" not in eg:
        errors.append("elective_groups.prescribed_elective is missing")
    if "elective" not in eg:
        errors.append("elective_groups.elective is missing")

    if silent:
        return data

    if errors:
        print("  WARNINGS:")
        for e in errors:
            print("    - " + e)
    else:
        print("  Validation passed.")

    return data


def collect_validation_issues(data):
    issues = []
    ci = data.get("course_information", {})
    if not ci.get("course"):
        issues.append("Missing course_information.course")
    if not ci.get("major"):
        issues.append("Missing course_information.major")
    if not ci.get("intake"):
        issues.append("Missing course_information.intake")
    if not ci.get("intake_year"):
        issues.append("Missing course_information.intake_year")

    cats = data.get("categories", {})
    eg = cats.get("elective_groups", {})
    if not cats.get("core_units"):
        issues.append("core_units is empty")
    if not cats.get("major_units"):
        issues.append("major_units is empty")
    if not isinstance(eg, dict):
        issues.append("elective_groups is missing or invalid")
    else:
        if "prescribed_elective" not in eg:
            issues.append("elective_groups.prescribed_elective is missing")
        if "elective" not in eg:
            issues.append("elective_groups.elective is missing")
    return issues


def _clamp_score(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, value))


def _normalise_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _major_expected(data):
    ci = data.get("course_information", {})
    req_major = ci.get("requirements", {}).get("major", {})
    major_units = data.get("categories", {}).get("major_units", [])
    return bool(
        major_units or
        req_major.get("count") is not None or
        req_major.get("cp") is not None or
        _normalise_text(ci.get("major"))
    )


def _wil_expected(raw_evidence, data):
    text = _normalise_text(raw_evidence).lower()
    if re.search(
        r"work-?integrated learning|industry placement|industry training|professional experience|\bwil\b|internship",
        text,
        re.IGNORECASE,
    ):
        return True
    ci = data.get("course_information", {})
    req_wil = ci.get("requirements", {}).get("wil", {})
    return bool(
        data.get("categories", {}).get("wil_group") or
        req_wil.get("count") is not None or
        req_wil.get("cp") is not None
    )


def _requirement_expected(req_entry, unit_count, raw_evidence, label_patterns):
    if not isinstance(req_entry, dict):
        req_entry = {}
    if req_entry.get("count") is not None or req_entry.get("cp") is not None:
        return True
    if unit_count:
        return True
    text = _normalise_text(raw_evidence)
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in label_patterns)


def _iter_all_units(data):
    categories = data.get("categories", {})
    elective_groups = categories.get("elective_groups", {})
    return (
        categories.get("core_units", []) +
        categories.get("major_units", []) +
        categories.get("mpu_group", []) +
        elective_groups.get("prescribed_elective", []) +
        elective_groups.get("elective", []) +
        categories.get("wil_group", [])
    )


def _count_mismatch_score(expected, actual, tolerance=0):
    if expected is None:
        return None
    expected = max(int(expected), 0)
    actual = max(int(actual), 0)
    diff = abs(expected - actual)
    effective_diff = max(0, diff - tolerance)
    if expected == 0:
        return 1.0 if actual == 0 else max(0.0, 1.0 - effective_diff)
    return _clamp_score(1.0 - (effective_diff / max(expected, 1)))


def _issue_severity(issue):
    text = _normalise_text(issue).lower()
    if not text:
        return "info"
    if text.startswith("missing course_information.course"):
        return "critical"
    if text.startswith("missing course_information.intake"):
        return "critical"
    if text.startswith("missing course_information.intake_year"):
        return "critical"
    if "count mismatch" in text:
        return "warning"
    if text.startswith("missing requirements."):
        return "warning"
    if text.startswith("low-quality unit_name"):
        return "warning"
    if text.startswith("duplicate prerequisite codes"):
        return "warning"
    if text.startswith("trailing prerequisite connector"):
        return "warning"
    if text == "major_units is empty":
        return "info"
    if text == "elective_groups.elective is missing":
        return "warning"
    if text == "elective_groups.prescribed_elective is missing":
        return "warning"
    if text == "core_units is empty":
        return "critical"
    return "info"


def _has_optional_elective_pool(data, raw_evidence):
    text = _normalise_text(raw_evidence)
    if re.search(r"\banother elective\b|\belective list\b|\brecommended\b|\boptional\b", text, re.IGNORECASE):
        return True
    elective_units = data.get("categories", {}).get("elective_groups", {}).get("elective", [])
    for unit in elective_units:
        name = _normalise_text(unit.get("unit_name"))
        prereq = _normalise_text(unit.get("prerequisite"))
        if re.search(r"\banother elective\b|\brecommended\b|\boptional\b", name, re.IGNORECASE):
            return True
        if re.search(r"please refer to elective list", prereq, re.IGNORECASE):
            return True
    return False


def _looks_like_low_quality_name(name):
    text = _normalise_text(name)
    if not text:
        return True
    if re.fullmatch(r"[*#†\s]+", text):
        return True
    if re.search(r"\b(?:Nil|credit points?|Please refer to Elective List)\b", text, re.IGNORECASE):
        return True
    if re.search(r"(?:\bOR\b|\bAND\b|&|/)", text) and len(_prereq_codes(text)) >= 1:
        return True
    if text.endswith((" or", " and", " &")):
        return True
    if text.count(",") >= 3:
        return True
    return False


def _field_quality_penalties(unit):
    penalties = []
    name = unit.get("unit_name")
    prereq = unit.get("prerequisite")

    if _looks_like_low_quality_name(name):
        penalties.append("low_quality_name")

    prereq_text = _normalise_text(prereq)
    if prereq_text:
        codes = _prereq_codes(prereq_text)
        if len(codes) != len(_unique_preserve_order(codes)):
            penalties.append("duplicate_prereq_codes")
        if _has_trailing_connector(prereq_text):
            penalties.append("trailing_prereq_connector")
        if prereq_text.count("(") >= 2 and prereq_text.count("(Malaysian Students Only)") > 1:
            penalties.append("repeated_bracket_phrase")
        if unit.get("category") == "wil" and re.search(r"\bYear\s+\w+\b|Semester\s+\d+", prereq_text, re.IGNORECASE):
            penalties.append("wil_prereq_contains_row_noise")

    return penalties


def calculate_confidence(structured_json, raw_evidence=None, validation_issues=None):
    data = structured_json or {}
    ci = data.get("course_information", {})
    req = ci.get("requirements", {})
    categories = data.get("categories", {})
    elective_groups = categories.get("elective_groups", {})
    raw_evidence = raw_evidence or ""
    validation_issues = list(validation_issues or [])
    issues = []

    # Metadata
    metadata_checks = []
    for key in ("course", "intake", "intake_year"):
        metadata_checks.append(1.0 if ci.get(key) not in (None, "") else 0.0)
        if ci.get(key) in (None, ""):
            issues.append(f"Missing course_information.{key}")
    if _major_expected(data):
        major_present = ci.get("major") not in (None, "")
        metadata_checks.append(1.0 if major_present else 0.0)
        if not major_present:
            issues.append("Missing course_information.major")
    metadata_score = _clamp_score(sum(metadata_checks) / max(len(metadata_checks), 1))

    # Requirements
    requirement_checks = []
    core_expected = _requirement_expected(req.get("core", {}), len(categories.get("core_units", [])), raw_evidence, [r"\bcore units?\b"])
    major_expected = _requirement_expected(req.get("major", {}), len(categories.get("major_units", [])), raw_evidence, [r"\bmajor units?\b"])
    elective_expected = _requirement_expected(
        req.get("elective", {}),
        len(elective_groups.get("elective", [])) + len(elective_groups.get("prescribed_elective", [])),
        raw_evidence,
        [r"\belective units?\b", r"\belective list\b"],
    )
    wil_expected = _wil_expected(raw_evidence, data)

    requirement_expectations = [
        ("core", core_expected),
        ("major", major_expected),
        ("elective", elective_expected),
        ("wil", wil_expected),
    ]
    for req_key, expected in requirement_expectations:
        if not expected:
            continue
        entry = req.get(req_key, {}) if isinstance(req.get(req_key), dict) else {}
        requirement_checks.append(1.0 if entry.get("count") is not None else 0.0)
        requirement_checks.append(1.0 if entry.get("cp") is not None else 0.0)
        if entry.get("count") is None:
            issues.append(f"Missing requirements.{req_key}.count")
        if entry.get("cp") is None:
            issues.append(f"Missing requirements.{req_key}.cp")
    requirements_score = _clamp_score(sum(requirement_checks) / max(len(requirement_checks), 1)) if requirement_checks else 1.0

    # Unit count score
    unit_count_checks = []
    unit_count_map = [
        ("core", req.get("core", {}), len(categories.get("core_units", [])), 0),
        ("major", req.get("major", {}), len(categories.get("major_units", [])), 0),
        (
            "elective",
            req.get("elective", {}),
            len(elective_groups.get("elective", [])) + len(elective_groups.get("prescribed_elective", [])),
            1,
        ),
        ("wil", req.get("wil", {}), len(categories.get("wil_group", [])), 0),
    ]
    optional_elective_pool = _has_optional_elective_pool(data, raw_evidence)
    for label, req_entry, actual_count, tolerance in unit_count_map:
        expected_count = req_entry.get("count") if isinstance(req_entry, dict) else None
        score = _count_mismatch_score(expected_count, actual_count, tolerance=tolerance)
        if (
            label == "elective" and
            expected_count is not None and
            actual_count >= expected_count and
            optional_elective_pool
        ):
            score = max(score or 0.0, 0.97)
        if score is None:
            continue
        unit_count_checks.append(score)
        if score < 0.75 and not (label == "elective" and optional_elective_pool):
            issues.append(f"{label}_units count mismatch: expected {expected_count}, got {actual_count}")
    unit_count_score = _clamp_score(sum(unit_count_checks) / max(len(unit_count_checks), 1)) if unit_count_checks else 1.0

    # Category confidence
    row_evidence = {row.get("unit_code"): row for row in _parse_row_evidence(raw_evidence)}
    accepted_moves = {
        str(item.get("unit_code", "")).strip().upper()
        for item in data.get("_llm_rejections", [])
        if item.get("reason") == "accepted_category_change"
    }
    category_checks = []
    for unit in _iter_all_units(data):
        code = str(unit.get("unit_code", "")).strip().upper()
        category = unit.get("category")
        row = row_evidence.get(code, {})
        row_category = row.get("category")
        combined_text = " ".join([
            _normalise_text(unit.get("unit_name")),
            _normalise_text(unit.get("prerequisite")),
            _normalise_text(row.get("text")),
        ]).lower()

        if not category:
            category_checks.append(0.2)
            issues.append(f"Missing category for {code or 'unknown unit'}")
            continue
        if row_category and row_category == category:
            score = 1.0
        elif row_category and row_category != category:
            score = 0.4
            issues.append(f"Category differs from row evidence for {code}")
        elif category == "wil" and re.search(r"work-?integrated learning|industry placement|industry training|professional experience|\bwil\b|internship", combined_text, re.IGNORECASE):
            score = 0.95
        elif category == "mpu" and code.startswith("MPU"):
            score = 0.95
        elif code in accepted_moves:
            score = 0.7
        else:
            score = 0.95
        category_checks.append(score)
    category_score = _clamp_score(sum(category_checks) / max(len(category_checks), 1)) if category_checks else 1.0

    # Field quality
    quality_scores = []
    low_quality_names = 0
    for unit in _iter_all_units(data):
        penalties = _field_quality_penalties(unit)
        score = 1.0 - (0.18 * len(penalties))
        quality_scores.append(_clamp_score(score))
        if "low_quality_name" in penalties:
            low_quality_names += 1
            issues.append(f"Low-quality unit_name for {unit.get('unit_code') or 'unknown unit'}")
        if "duplicate_prereq_codes" in penalties:
            issues.append(f"Duplicate prerequisite codes for {unit.get('unit_code') or 'unknown unit'}")
        if "trailing_prereq_connector" in penalties:
            issues.append(f"Trailing prerequisite connector for {unit.get('unit_code') or 'unknown unit'}")
    field_quality_score = _clamp_score(sum(quality_scores) / max(len(quality_scores), 1)) if quality_scores else 1.0

    overall_score = _clamp_score(
        metadata_score * 0.24 +
        requirements_score * 0.20 +
        unit_count_score * 0.22 +
        category_score * 0.16 +
        field_quality_score * 0.18
    )

    critical_metadata_missing = any(ci.get(key) in (None, "") for key in ("course", "intake", "intake_year"))
    large_count_mismatch = any(score < 0.5 for score in unit_count_checks)
    wil_missing = wil_expected and not categories.get("wil_group")
    many_low_quality_names = low_quality_names >= max(2, len(_iter_all_units(data)) // 8 if _iter_all_units(data) else 2)

    for issue in validation_issues:
        if issue not in issues:
            issues.append(issue)
    seen_issues = []
    for issue in issues:
        if issue not in seen_issues:
            seen_issues.append(issue)

    critical_issue_count = sum(1 for issue in seen_issues if _issue_severity(issue) == "critical")
    warning_issue_count = sum(1 for issue in seen_issues if _issue_severity(issue) == "warning")

    no_critical_issues = (
        critical_issue_count == 0 and
        not critical_metadata_missing and
        not large_count_mismatch and
        not wil_missing
    )
    counts_match_well = unit_count_score >= 0.95
    strong_quality = min(metadata_score, requirements_score, category_score, field_quality_score) >= 0.95

    if no_critical_issues and counts_match_well and strong_quality:
        overall_score = max(overall_score, 0.97)
    elif no_critical_issues and warning_issue_count == 0:
        overall_score = max(overall_score, 0.95)
    elif no_critical_issues and warning_issue_count <= 2:
        overall_score = max(overall_score, 0.90)

    if critical_issue_count >= 1:
        overall_score = min(overall_score, 0.74)
    elif warning_issue_count >= 4:
        overall_score = min(overall_score, 0.84)
    elif warning_issue_count >= 2:
        overall_score = min(overall_score, 0.94)
    elif warning_issue_count == 1:
        overall_score = min(overall_score, 0.95)

    manual_review_required = bool(
        overall_score < 0.85 or
        critical_metadata_missing or
        large_count_mismatch or
        wil_missing or
        many_low_quality_names
    )
    if wil_missing and "WIL expected but wil_group is empty" not in seen_issues:
        seen_issues.append("WIL expected but wil_group is empty")

    if overall_score >= 0.95:
        level = "high"
    elif overall_score >= 0.8:
        level = "medium"
    else:
        level = "low"

    return {
        "overall_score": round(overall_score, 2),
        "level": level,
        "manual_review_required": manual_review_required,
        "signals": {
            "metadata_score": round(metadata_score, 2),
            "requirements_score": round(requirements_score, 2),
            "unit_count_score": round(unit_count_score, 2),
            "category_score": round(category_score, 2),
            "field_quality_score": round(field_quality_score, 2),
        },
        "issues": seen_issues,
    }


def determine_processing_outcome(categories, llm_used, llm_applied, llm_error, validation_issues):
    core_count = len(categories.get("core_units", []))
    major_count = len(categories.get("major_units", []))
    if validation_issues:
        return {
            "status": "manual_review_required",
            "confidence": "low",
            "reason": "; ".join(validation_issues),
        }
    if llm_error and not llm_applied:
        return {
            "status": "deterministic_ok",
            "confidence": "high" if core_count and major_count else "medium",
            "reason": "Deterministic output passed validation; LLM unavailable or rejected",
        }
    if llm_used and llm_applied:
        return {
            "status": "llm_fallback_used",
            "confidence": "high",
            "reason": "LLM corrections were applied and validated",
        }
    return {
        "status": "deterministic_ok",
        "confidence": "high" if core_count and major_count else "medium",
        "reason": "Deterministic output passed validation",
    }

def apply_wil_text_override(data):
    categories = data.setdefault("categories", {})
    elective_groups = categories.setdefault("elective_groups", {})

    containers = {
        "core": categories.setdefault("core_units", []),
        "major_core": categories.setdefault("major_units", []),
        "mpu": categories.setdefault("mpu_group", []),
        "prescribed_elective": elective_groups.setdefault("prescribed_elective", []),
        "elective": elective_groups.setdefault("elective", []),
        "wil": categories.setdefault("wil_group", []),
    }

    wil_patterns = [
        r"professional experience in engineering",
        r"professional experience",
        r"industry placement unit",
        r"industry placement",
        r"industry training",
        r"work-integrated learning",
        r"work integrated learning",
        r"\bwil placement\b",
        r"\bwil\b",
        r"\binternship\b",
    ]

    def is_wil_unit(unit):
        text = " ".join([
            str(unit.get("unit_code", "")),
            str(unit.get("unit_name", "")),
            str(unit.get("prerequisite", "")),
        ]).lower()

        if any(re.search(pattern, text, re.IGNORECASE) for pattern in wil_patterns):
            return True

        # Special case: Introductory Seminar only counts when attached to Professional Experience / EAT row
        has_intro = re.search(r"introductory seminar", text, re.IGNORECASE)
        has_prof_exp_or_eat = (
            re.search(r"professional experience", text, re.IGNORECASE)
            or str(unit.get("unit_code", "")).upper().startswith("EAT")
        )

        return bool(has_intro and has_prof_exp_or_eat)

    moved = []
    seen_wil_codes = {
        str(u.get("unit_code", "")).strip().upper()
        for u in containers["wil"]
    }

    for category_name, unit_list in list(containers.items()):
        if category_name == "wil":
            continue

        kept = []

        for unit in unit_list:
            code = str(unit.get("unit_code", "")).strip().upper()

            if is_wil_unit(unit):
                unit["category"] = "wil"

                # Fix common mixed name/prerequisite case
                name = str(unit.get("unit_name", "") or "")
                prereq = unit.get("prerequisite")

                if "introductory seminar" in name.lower():
                    unit["unit_name"] = re.sub(
                        r"\s*#?\s*Introductory Seminar\s*$",
                        "",
                        name,
                        flags=re.IGNORECASE
                    ).strip()
                    unit["prerequisite"] = "Introductory Seminar"

                if code not in seen_wil_codes:
                    containers["wil"].append(unit)
                    seen_wil_codes.add(code)

                moved.append(code)
            else:
                kept.append(unit)

        containers[category_name][:] = kept

    if moved:
        data.setdefault("_deterministic_fixes", []).append({
            "reason": "wil_text_override",
            "moved_units": moved,
        })

    return data

def process_planner_pdf(
    pdf_path,
    model_name=DEFAULT_MODEL_NAME,
    use_llm=True,
    llm_retries=DEFAULT_LLM_RETRIES,
    enhanced_evidence=False,
):
    if not os.path.exists(pdf_path):
        raise FileNotFoundError("file not found: " + pdf_path)

    base_name = os.path.splitext(os.path.basename(pdf_path))[0]

    raw_text = extract_text_from_pdf(pdf_path)
    cleaned_text = clean_text(raw_text)
    metadata = extract_metadata(cleaned_text)
    requirements = extract_requirements(cleaned_text)
    units = extract_units(pdf_path)
    elective_sections = extract_elective_sections(pdf_path)
    structured = assemble_json(base_name, metadata, requirements, units, elective_sections)

    llm_used = False
    llm_applied = False
    llm_error = None
    llm_attempts = []
    llm_mode = "disabled" if not use_llm else "enabled"
    raw_evidence = ""

    if use_llm:
        llm_used = True
        try:
            raw_evidence = extract_useful_raw_evidence_lines(
                pdf_path,
                max_lines_per_page=200,
                enhanced=enhanced_evidence,
            )
            cleanup_prompt = build_improved_crosscheck_prompt(
                base_name,
                structured,
                raw_evidence,
                model_name=model_name,
            )
            response, llm_attempts = call_ollama_with_retries(
                cleanup_prompt,
                model_name,
                retries=llm_retries,
            )
            llm_structured, repair_attempts = parse_or_repair_llm_json(response, model_name)
            llm_attempts.extend(repair_attempts)
            llm_structured = apply_enhanced_crosscheck_patch(structured, llm_structured, base_name)
            llm_structured = normalise_llm_output(llm_structured, base_name)
            accepted, reason = should_accept_llm_output(structured, llm_structured)
            if accepted:
                structured = llm_structured
                llm_applied = True
            else:
                llm_error = reason
        except Exception as exc:
            llm_error = str(exc)
            llm_attempts = getattr(exc, "attempts", llm_attempts)

    structured = normalise_llm_output(structured, base_name)
    structured = apply_wil_text_override(structured)
    structured = validate_and_normalise(structured, silent=True)
    validation_issues = collect_validation_issues(structured)
    if not raw_evidence:
        raw_evidence = extract_useful_raw_evidence_lines(
            pdf_path,
            max_lines_per_page=200,
            enhanced=False,
        )
    confidence = calculate_confidence(
        structured,
        raw_evidence=raw_evidence,
        validation_issues=validation_issues,
    )
    outcome = determine_processing_outcome(
        structured.get("categories", {}),
        llm_used=llm_used,
        llm_applied=llm_applied,
        llm_error=llm_error,
        validation_issues=validation_issues,
    )

    report = {
        "file_name": base_name,
        "pdf_path": pdf_path,
        "model": model_name,
        "llm_mode": llm_mode,
        "llm_strategy": "crosscheck",
        "enhanced_evidence": enhanced_evidence,
        "llm_retries": llm_retries,
        "llm_used": llm_used,
        "llm_applied": llm_applied,
        "llm_error": llm_error,
        "llm_attempts": llm_attempts,
        "validation_issues": validation_issues,
        "outcome": outcome,
        "unit_counts": unit_count_snapshot(structured),
        "confidence": confidence,
    }

    return structured, report


# ---------------------------
# App subprocess entrypoint
# ---------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract a planner PDF into structured JSON.")
    parser.add_argument("pdf", help="Path to planner PDF")
    parser.add_argument("--model", default=DEFAULT_MODEL_NAME, help="Ollama model for optional LLM cleanup")
    parser.add_argument("--no-llm", action="store_true", help="Skip the LLM cleanup step")
    parser.add_argument("--llm-retries", type=int, default=DEFAULT_LLM_RETRIES, help="Number of LLM retry attempts")
    parser.add_argument("--enhanced-evidence", action="store_true", help="Use broader raw evidence for LLM crosscheck")
    parser.add_argument("--planner-only", action="store_true", help="Print only the structured planner JSON")
    args = parser.parse_args()

    try:
        structured, report = process_planner_pdf(
            args.pdf,
            model_name=args.model,
            use_llm=not args.no_llm,
            llm_retries=args.llm_retries,
            enhanced_evidence=args.enhanced_evidence,
        )
        payload = structured if args.planner_only else {"planner": structured, "report": report}
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
