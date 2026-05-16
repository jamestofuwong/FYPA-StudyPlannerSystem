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

DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL_NAME = "deepseek-r1:1.5b"
DEFAULT_LLM_RETRIES = 2
UNIT_CODE_RE = re.compile(r"\b[A-Z]{3}\d{3,5}(?:[@#†*]+)?\b")
YEAR_RE = re.compile(r"^\s*Year\s+(One|Two|Three|Four|Five|\d+)\s*$", re.IGNORECASE)
SEM_RE = re.compile(r"^\s*Semester\s+(\d+)(?:\s*\|\s*([A-Za-z/]+)\s+(\d{4}))?.*$", re.IGNORECASE)
TERM_RE = re.compile(r"^\s*(Summer(?:\s+Term)?|Winter(?:\s+Term)?)(?:\s*\|\s*([A-Za-z/]+)\s+(\d{4}))?.*$", re.IGNORECASE)
YEAR_MAP = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
_LAST_RAW_EVIDENCE = ""

# ---------------------------
# Ollama call
# ---------------------------
# This takes environment configuration and returns Ollama generate URL because the app must use local runtime settings when available.
def get_ollama_generate_url():
    configured_url = (
        os.environ.get("STUDY_PLANNER_OLLAMA_URL")
        or os.environ.get("OLLAMA_BASE_URL")
        or DEFAULT_OLLAMA_BASE_URL
    ).strip().rstrip("/")
    if configured_url.endswith("/api/generate"):
        return configured_url
    return configured_url + "/api/generate"


# This takes prompt and model name and returns model response text because optional AI review is isolated behind one local Ollama call.
def call_ollama(prompt, model_name):
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 5000},
    }
    try:
        resp = requests.post(get_ollama_generate_url(), json=payload, timeout=300)
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Cannot connect to the local Ollama runtime.")
    except requests.exceptions.Timeout:
        raise RuntimeError("Ollama request timed out.")


# This takes prompt, model, retry count and returns response and attempt log because transient local-runtime failures should be visible in the report.
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


# This takes invalid LLM response and returns strict repair prompt because a second pass can salvage useful output without accepting prose.
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


# This takes LLM response and model and returns parsed patch and repair attempts because the pipeline accepts only valid JSON patches.
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
# This takes a raw WIL unit dict and returns a cleaned name and prerequisite because WIL rows often combine the title and conditions in one field.
def parse_wil_unit(u):
    raw = u.get('unit_name', u.get('name')) or ''
    if re.search(r'exemption to \d+ electives', raw, re.IGNORECASE):
        return raw, None
    split_match = re.search(r'\s-\s+(Students need to complete at least \d+ units|WIL placement can be taken in Year|WIL internship placement can be taken in Year)', raw, re.IGNORECASE)
    if split_match:
        name = raw[:split_match.start()].strip()
        tail = raw[split_match.start() + 3:].strip()
        if re.search(r'equivalent to \d+ elective units?', name, re.IGNORECASE):
            prereq_str = normalise_prereq_text(u.get('prerequisite')) or tail
            return clean_unit_name(name), prereq_str
    # Split on ' - ' bullets
    parts = [p.strip() for p in re.split(r'\s*-\s+', raw) if p.strip()]
    if not parts:
        return clean_unit_name(u.get('unit_name', u.get('name'))), u['prerequisite']

    name    = clean_unit_name(parts[0])
    prereqs = parts[1:] if len(parts) > 1 else []

    if prereqs:
        prereq_str = '; '.join(prereqs)
    else:
        prereq_str = u['prerequisite']

    return clean_unit_name(name), prereq_str


# This takes raw prerequisite and returns nullable cleaned text because app JSON should represent Nil/blank prerequisites as None.
def normalise_prereq_text(text):
    if text is None:
        return None
    text = re.sub(r"\s+", " ", str(text)).strip()
    if not text or text.lower() == "nil":
        return None
    return text


# This takes course title and returns template course_type because planner templates now store canonical course type values for persistence.
def infer_template_course_type(course_name):
    text = re.sub(r"\s+", " ", str(course_name or "")).strip()
    if re.search(r"^Bachelor\b", text, re.IGNORECASE):
        return "bachelor"
    if re.search(r"^Diploma\b", text, re.IGNORECASE):
        return "diploma"
    if re.search(r"Foundation\b", text, re.IGNORECASE):
        return "foundation"
    return "bachelor"


# This takes structured planner JSON and returns duration_semesters because planner template persistence needs schema-aligned duration metadata.
def infer_template_duration_semesters(data):
    ci = data.get("course_information", {}) if isinstance(data, dict) else {}
    course_name = re.sub(r"\s+", " ", str(ci.get("course") or "")).strip()
    if re.search(r"Bachelor of Engineering\s*\(Honours\)", course_name, re.IGNORECASE):
        return 8

    max_year = None
    max_semester = None
    categories = data.get("categories", {}) if isinstance(data, dict) else {}
    elective_groups = categories.get("elective_groups", {}) if isinstance(categories, dict) else {}
    minor_units = []
    for group in categories.get("minor_groups", []) if isinstance(categories.get("minor_groups"), list) else []:
        if isinstance(group, dict):
            minor_units.extend(group.get("units", []))
    all_units = (
        categories.get("core_units", []) +
        categories.get("major_units", []) +
        categories.get("mpu_group", []) +
        elective_groups.get("prescribed_elective", []) +
        elective_groups.get("elective", []) +
        minor_units +
        categories.get("wil_group", [])
    )
    for unit in all_units:
        year_value = coerce_int(unit.get("year_level"))
        sem_value = coerce_int(unit.get("semester"))
        if year_value is not None:
            max_year = year_value if max_year is None else max(max_year, year_value)
        if sem_value is not None:
            max_semester = sem_value if max_semester is None else max(max_semester, sem_value)

    if max_year is not None:
        return max(2, max_year * 2)
    if max_semester is not None:
        return max(2, max_semester if max_semester > 4 else 6)
    return 6






# This takes structured planner JSON and returns planner-template persistence metadata because requisite groups are intentionally deferred until the database save layer runs after user review.
def build_planner_template_db_payload(data):
    ci = data.get("course_information", {}) if isinstance(data, dict) else {}
    requirements = ci.get("requirements", {}) if isinstance(ci, dict) else {}
    payload = {
        "planner_template": {
            "course": ci.get("course"),
            "major": ci.get("major"),
            "intake": ci.get("intake"),
            "intake_year": coerce_int(ci.get("intake_year")),
            "course_type": infer_template_course_type(ci.get("course")),
            "duration_semesters": infer_template_duration_semesters(data),
            "core_count": coerce_int((requirements.get("core") or {}).get("count")) if isinstance(requirements, dict) else None,
            "core_cp": (requirements.get("core") or {}).get("cp") if isinstance(requirements, dict) else None,
            "major_count": coerce_int((requirements.get("major") or {}).get("count")) if isinstance(requirements, dict) else None,
            "major_cp": (requirements.get("major") or {}).get("cp") if isinstance(requirements, dict) else None,
            "elective_count": coerce_int((requirements.get("elective") or {}).get("count")) if isinstance(requirements, dict) else None,
            "elective_cp": (requirements.get("elective") or {}).get("cp") if isinstance(requirements, dict) else None,
            "wil_count": coerce_int((requirements.get("wil") or {}).get("count")) if isinstance(requirements, dict) else None,
            "wil_cp": (requirements.get("wil") or {}).get("cp") if isinstance(requirements, dict) else None,
        },
        "unit_requisite_groups": [],
    }
    return payload


# This takes numeric-like value and returns int or None because extracted values can arrive as strings, blanks, or placeholders.
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


# This takes offered-in label and returns app semester code because labels like Feb/Mar need database-compatible numeric values.
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


# This takes internal category and returns app category because major units are stored as major_core in the app contract.
def output_category(category):
    if category == "major":
        return "major_core"
    return category


# ---------------------------
# Deterministic assembly into target JSON schema
# ---------------------------
# This takes deterministic unit and returns app-schema unit dict because all groups need consistent field names and normalised values.
def unit_obj(u):
    obj = {
        "year_level":   coerce_int(u.get("year_level")),
        "semester":     coerce_int(u.get("semester")),
        "category":     output_category(u.get("category")),
        "unit_code":    u["code"],
        "unit_name":    clean_unit_name(u["name"]),
        "prerequisite": normalise_prereq_text(u.get("prerequisite")),
        "offered_in":   normalise_offered_in(u.get("offered_in")),
    }
    return obj


# This takes minor/elective unit-like dict and returns compact minor unit dict because minor groups are stored separately from the main planner timeline.
def minor_unit_obj(unit_like):
    unit = {
        "unit_code": str(unit_like.get("unit_code") or unit_like.get("code") or "").strip().upper(),
        "unit_name": clean_unit_name(unit_like.get("unit_name") or unit_like.get("name") or ""),
        "prerequisite": None,
        "offered_in": normalise_offered_in(unit_like.get("offered_in")),
    }
    prereq = normalise_prereq_text(unit_like.get("prerequisite"))
    if isinstance(prereq, str):
        prereq = re.sub(r'\)\s*\(Only offered in semester \d+\s*$', '', prereq, flags=re.IGNORECASE).strip()
        prereq = re.sub(r'\bSemester\s+\d+\s*&\s*\d+\b.*$', '', prereq, flags=re.IGNORECASE).strip()
        prereq = re.sub(r'\bSemester\s+\d+\s+only\b.*$', '', prereq, flags=re.IGNORECASE).strip()
        if re.match(r'^N[Ii][Ll]$', prereq):
            prereq = None
    unit["prerequisite"] = prereq
    return unit


# This takes section name and returns display minor name because minor headings vary but UI labels should be stable.
def format_minor_name(section_name):
    name = re.sub(r"\s+", " ", str(section_name or "")).strip()
    if not name:
        return ""
    if re.search(r'co-major', name, re.IGNORECASE):
        return ""
    if re.match(r'^Minor\s+.+$', name, re.IGNORECASE):
        return re.sub(r'^Minor\s+', '', name, flags=re.IGNORECASE).strip() + " Minor"
    if re.search(r"\bAdvanced\s+Minor\b", name, re.IGNORECASE):
        return name
    if re.search(r"\bMinor/Elective\b", name, re.IGNORECASE):
        return name
    if re.search(r"\bMinor\b", name, re.IGNORECASE):
        return name
    return (name + " Minor").strip()


# This takes extracted units and section groups and returns app minor_groups list because minor sections must preserve unit names/prereqs from best available evidence.
def build_minor_groups(units, section_groups):
    if not isinstance(section_groups, dict):
        return []

    unit_lookup = {}
    for u in units:
        code = str(u.get("code", "")).strip().upper()
        if code and code not in unit_lookup:
            unit_lookup[code] = u

    minor_groups = []
    for section_name, entries in section_groups.items():
        if not re.search(r"\bminor\b", str(section_name or ""), re.IGNORECASE):
            continue

        seen_codes = set()
        group_units = []
        for entry in entries if isinstance(entries, list) else []:
            code = ""
            if isinstance(entry, dict):
                code = str(entry.get("unit_code") or entry.get("code") or "").strip().upper()
            elif isinstance(entry, str):
                code = entry.strip().upper()
                entry = {"unit_code": code}
            if not code or code in seen_codes:
                continue
            seen_codes.add(code)

            source = unit_lookup.get(code, {})
            merged = {
                "unit_code": code,
                "code": code,
                "unit_name": (
                    entry.get("unit_name")
                    if isinstance(entry, dict) and entry.get("unit_name")
                    else source.get("name")
                ),
                "name": (
                    entry.get("name")
                    if isinstance(entry, dict) and entry.get("name")
                    else source.get("name")
                ),
                "prerequisite": (
                    entry.get("prerequisite")
                    if isinstance(entry, dict) and entry.get("prerequisite") is not None
                    else source.get("prerequisite")
                ),
                "offered_in": (
                    entry.get("offered_in")
                    if isinstance(entry, dict) and entry.get("offered_in") is not None
                    else source.get("offered_in")
                ),
                "year_level": (
                    entry.get("year_level")
                    if isinstance(entry, dict)
                    else None
                ),
                "semester": (
                    entry.get("semester")
                    if isinstance(entry, dict)
                    else None
                ),
            }
            unit = minor_unit_obj(merged)
            if unit.get("unit_code") and unit.get("unit_name"):
                group_units.append(unit)

        minor_name = format_minor_name(section_name)
        if minor_name and group_units:
            minor_groups.append({
                "minor_name": minor_name,
                "units": group_units,
            })

    return minor_groups


# This takes file name, metadata, requirements, units, elective sections and returns complete planner JSON because this is the deterministic baseline before LLM review.
def assemble_json(file_name, metadata, requirements, units, elective_sections):
    # Build requirements entry with count + cp
    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
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

    minor_groups = build_minor_groups(units, elective_sections)
    minor_codes = set()
    for group in minor_groups:
        if not isinstance(group, dict):
            continue
        for minor_unit in group.get("units", []):
            if isinstance(minor_unit, dict) and minor_unit.get("unit_code"):
                minor_codes.add(str(minor_unit.get("unit_code", "")).strip().upper())
    regular_electives = [u for u in regular_electives if str(u.get("code", "")).strip().upper() not in minor_codes]

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
            "minor_groups":    minor_groups,
            "wil_group":       wil_list,
        },
    }


# This takes planner semester and optional season and returns app semester code because planner numbering and database terms differ.
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


# This takes planner semester and returns year level because evidence rows may carry semester but not explicit year.
def _planner_sem_to_year(planner_sem):
    sem = coerce_int(planner_sem)
    if sem is None:
        return None
    return (sem + 1) // 2


# This takes raw evidence line and returns cleaned text because LLM prompts need compact lines without encoding noise.
def _clean_evidence_line(line):
    line = re.sub(r"\s+", " ", str(line)).strip()
    return line.replace("â€™", "'").replace("Ã¢â‚¬â„¢", "'")


# This takes cleaned line and returns boolean because prompts should include planner evidence, not boilerplate.
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


# This takes PDF path and returns cleaned lines per page because evidence extraction needs page boundaries for context.
def _extract_page_lines(pdf_path):
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            raw_lines = [_clean_evidence_line(line) for line in text.splitlines()]
            pages.append([line for line in raw_lines if line])
    return pages


# This takes pdfplumber row cells and returns pipe-separated row text because row evidence should show original column order.
def _row_cells_text(row_cells):
    parts = []
    for cell in row_cells:
        text = _clean_evidence_line("" if cell is None else str(cell))
        if text:
            parts.append(text)
    return " | ".join(parts)


# This takes pdfplumber page and returns y-positioned text lines because row context matching depends on visual proximity.
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


# This takes row evidence text and returns normalised text because category and prerequisite comparison should ignore formatting noise.
def _normalise_evidence_row_text(text):
    text = _clean_evidence_line(text).replace(" | ", " ")
    return re.sub(r"\s+", " ", text).strip()


# This takes line text and returns boolean because notes carry symbol meanings and WIL conditions that table cells can omit.
def _looks_like_note_line(line):
    text = _clean_evidence_line(line)
    if not text:
        return False
    return bool(
        re.match(r"^[*#†]\s*", text) or
        re.search(r"\bnotes?\b", text, re.IGNORECASE) or
        re.search(r"\bhonours merit units?\b", text, re.IGNORECASE)
    )


# This takes page lines and returns note symbol/text pairs because markers such as * and # explain unit status.
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


# This takes line text and returns boolean because continuation lines should be merged with the preceding row evidence.
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


# This takes page line records and row location and returns context lines and merged row text because visual row matching recovers wrapped prerequisites.
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


# This takes page, row bbox, and legend and returns category label because evidence prompts include deterministic row category support.
def _row_category_for_evidence(page, row_bbox, legend):
    if not row_bbox:
        return None
    try:
        colour = _get_row_colour(page, row_bbox)
        return match_category(colour, legend)
    except Exception:
        return None


# This takes PDF path and line limit and returns compact evidence text because LLM review needs enough context without full PDF noise.
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


# This takes PDF path and line limit and returns richer row evidence because complex planners need row/category/context evidence for safer LLM patches.
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


# This takes PDF path and enhanced flag and returns selected evidence text because callers can choose speed or richer review context.
def extract_useful_raw_evidence_lines(pdf_path, max_lines_per_page=120, enhanced=False):
    if enhanced:
        return _extract_useful_raw_evidence_lines_enhanced(pdf_path, max_lines_per_page=max_lines_per_page)
    return _extract_useful_raw_evidence_lines_basic(pdf_path, max_lines_per_page=max_lines_per_page)


# This takes file name, baseline JSON, evidence, model and returns LLM prompt because the LLM must patch only evidence-backed issues.
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
    suspicious_lines = []
    reqs = ((base_data.get("course_information") or {}).get("requirements") or {})
    for req_key, label in (("core", "core"), ("major", "major"), ("elective", "elective"), ("wil", "wil")):
        req_value = reqs.get(req_key) or {}
        count_value = req_value.get("count")
        cp_value = req_value.get("cp")
        if count_value is None or (isinstance(count_value, int) and count_value > 64):
            suspicious_lines.append(f"- suspicious requirement: {label}.count = {count_value}")
        if cp_value is None and req_key in ("elective", "wil"):
            suspicious_lines.append(f"- missing requirement: {label}.cp")

    for group_name in ("core_units", "major_units", "elective", "prescribed_elective", "wil_group"):
        for unit in _group_units(base_data, group_name):
            code = str(unit.get("unit_code", "")).strip().upper()
            name = unit.get("unit_name")
            if code and _looks_corrupted_existing_name(name):
                suspicious_lines.append(f"- suspicious unit_name: {code} = {name}")

    suspicious_block = "\n".join(suspicious_lines[:20]) if suspicious_lines else "- none detected"

    if "deepseek" in (model_name or "").lower():
        return f"""Return JSON only.
Do not explain anything.
Do not summarize the planner.
Do not give study advice.
Do not use markdown.

Task:
Compare the deterministic planner JSON against the RAW EVIDENCE.
Return only a minimal correction patch.

Return exactly one JSON object with this structure:
{{
  "course_information": {{
    "course": null,
    "major": null,
    "intake": null,
    "intake_year": null,
    "requirements": {{
      "core": {{"count": null, "cp": null}},
      "major": {{"count": null, "cp": null}},
      "elective": {{"count": null, "cp": null}},
      "wil": {{"count": null, "cp": null}}
    }}
  }},
  "unit_changes": [
    {{
      "action": "add" or "update",
      "unit_code": "CODE",
      "year_level": null,
      "semester": null,
      "category": null,
      "unit_name": null,
      "prerequisite": null,
      "offered_in": null
    }}
  ]
}}

If no correction is needed, return the same object shape with all metadata fields null and:
"unit_changes": []

Rules:
1. Return only JSON.
2. No prose before or after JSON.
3. Add missing units only if ROW evidence clearly shows them.
4. Update existing units only if RAW EVIDENCE clearly proves a correction, or the current deterministic value is clearly suspicious/corrupted.
5. Use "course_information.requirements" for requirement fixes.
6. semester must only be 1, 2, 3, or 4.
7. prerequisite must be a string or null.
8. Do not remove valid metadata or units.

CURRENT UNIT CODES:
{current_units_str}

SUSPICIOUS FIELDS TO CHECK FIRST:
{suspicious_block}

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


# This takes a shared rejection log plus details and appends a rejection record because skipped LLM changes should remain auditable in the report.
def _record_patch_rejection(rejection_log, reason, **details):
    entry = {"reason": reason}
    entry.update(details)
    rejection_log.append(entry)


# This takes baseline JSON and LLM patch and returns patched JSON because LLM output is treated as constrained edits, not trusted replacement.
def apply_crosscheck_patch(base_data, patch_data, file_name):
    data = json.loads(json.dumps(base_data))
    if isinstance(patch_data, list):
        patch_data = {"course_information": {}, "unit_changes": patch_data}
    if not isinstance(patch_data, dict):
        return data

    rejection_log = data.setdefault("_llm_rejections", [])

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
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

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
    def rebuild_code_index():
        index = {}
        for category_name, items in containers.items():
            for item in items:
                code = str(item.get("unit_code", "")).strip().upper()
                if code:
                    index[code] = (category_name, item)
        return index

    code_index = rebuild_code_index()

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
    def _is_suspicious_requirement_value(req_key, field, current_value):
        if current_value is None:
            return True
        if field == "count":
            count = coerce_int(current_value)
            return count is None or count < 0 or count > 64
        if field == "cp":
            cp = coerce_int(current_value)
            return cp is None or cp < 0 or cp > 500
        return False

    # Course information patch
    patch_ci = patch_data.get("course_information", {})
    if isinstance(patch_ci, dict):
        base_ci = data.setdefault("course_information", {})

        for key in ("course", "major", "intake", "intake_year"):
            value = patch_ci.get(key)

            if not _is_missing(base_ci.get(key)) and _is_missing(value):
                _record_patch_rejection(rejection_log, "rejected_metadata_nulling", field=key)

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
                requirement_slot_open = (
                    target.get("count") is not None or
                    target.get("cp") is not None or
                    _is_suspicious_requirement_value(req_key, "count", target.get("count")) or
                    _is_suspicious_requirement_value(req_key, "cp", target.get("cp"))
                )
                for field in ("count", "cp"):
                    if target.get(field) is not None and req_value.get(field) is None:
                        _record_patch_rejection(
                            rejection_log,
                            "rejected_requirement_nulling",
                            field=req_key + "." + field,
                        )

                    if target.get(field) is None and req_value.get(field) is not None:
                        if not requirement_slot_open:
                            _record_patch_rejection(
                                rejection_log,
                                "rejected_requirement_fill_without_base_evidence",
                                field=req_key + "." + field,
                            )
                            continue
                        target[field] = req_value.get(field)
                    elif (
                        req_value.get(field) is not None and
                        _is_suspicious_requirement_value(req_key, field, target.get(field)) and
                        not _is_suspicious_requirement_value(req_key, field, req_value.get(field))
                    ):
                        target[field] = req_value.get(field)
                        _record_patch_rejection(
                            rejection_log,
                            "accepted_requirement_replacement",
                            field=req_key + "." + field,
                        )

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

                    _record_patch_rejection(
                        rejection_log,
                        "accepted_category_change",
                        unit_code=code,
                        **{"from": old_category, "to": new_category},
                    )
                else:
                    _record_patch_rejection(
                        rejection_log,
                        "rejected_category_change",
                        unit_code=code,
                        **{"from": old_category, "to": new_category},
                    )

            # Keep deterministic extraction as the base for existing units.
            # Existing row details are cleaned later by generic post-processing,
            # so raw LLM patches only fill fields that are currently empty.
            for field in ("year_level", "semester", "unit_name", "prerequisite", "offered_in"):
                value = change.get(field)
                if _is_missing(unit.get(field)) and not _is_missing(value):
                    unit[field] = value

            old_name = unit.get("unit_name")
            new_name = change.get("unit_name")
            if not _is_missing(new_name):
                cleaned_new_name = clean_unit_name(new_name)
                if (
                    _name_compare_key(old_name) == _name_compare_key(cleaned_new_name) or
                    _symbol_cleanup_only(old_name, cleaned_new_name) or
                    _duplicate_phrase_cleanup_only(old_name, cleaned_new_name)
                ):
                    unit["unit_name"] = cleaned_new_name
                elif (
                    _looks_corrupted_existing_name(old_name) and
                    cleaned_new_name and
                    not _is_bad_unit_name(cleaned_new_name) and
                    not _is_worse_unit_name(old_name, cleaned_new_name)
                ):
                    unit["unit_name"] = cleaned_new_name
                    _record_patch_rejection(
                        rejection_log,
                        "accepted_suspicious_name_replacement",
                        unit_code=code,
                    )

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
                _record_patch_rejection(
                    rejection_log,
                    "accepted_existing_prereq_upgrade",
                    unit_code=code,
                )

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


# This takes raw unit name and returns cleaned name because app display should not include symbols or extraction artefacts.
def clean_unit_name(name):
    if not name:
        return name
    name = re.sub(r'\s+[A-Z]{3}\d{3,5}[@#]?\s*', ' ', str(name))
    name = name.replace('@', '').replace('#', '').replace('†', '').replace('*', '')
    name = re.sub(r'\s*\([^()]*\)', '', name)
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


# This takes name text and returns comparison key because name comparisons should ignore case and punctuation noise.
def _name_compare_key(text):
    value = clean_unit_name(text or "")
    value = re.sub(r"\s+", " ", str(value)).strip()
    return value.lower()


# This takes old and new names and returns boolean because harmless symbol cleanup can be accepted more safely than semantic rewrites.
def _symbol_cleanup_only(old_name, new_name):
    old_clean = re.sub(r"[@#*†]", "", str(old_name or ""))
    new_clean = re.sub(r"[@#*†]", "", str(new_name or ""))
    return re.sub(r"\s+", " ", old_clean).strip().lower() == re.sub(r"\s+", " ", new_clean).strip().lower()


# This takes old and new names and returns boolean because removing duplicated text is safe when meaning is unchanged.
def _duplicate_phrase_cleanup_only(old_name, new_name):
    old = re.sub(r"\s+", " ", str(old_name or "")).strip()
    new = re.sub(r"\s+", " ", str(new_name or "")).strip()
    if not old or not new:
        return False
    old_deduped = re.sub(r'(\([^()]+\))(?:\s+\1)+', r'\1', old)
    old_deduped = re.sub(r'\b(\w+)(?:\s+\1)+\b', r'\1', old_deduped)
    old_deduped = re.sub(r"\s+", " ", old_deduped).strip()
    return old_deduped.lower() == new.lower()


# This takes prereq and unit name and returns prereq without copied name prefix because row merging can leak unit titles into prerequisite text.
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


# This takes prerequisite text and returns deduped text because extraction can repeat the same prerequisite phrase.
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


# This takes prerequisite text and returns unit code list because code-level comparison detects loss and duplication.
def _prereq_codes(text):
    return [match.rstrip("@#") for match in re.findall(r"\b[A-Z]{3}\d{3,5}@?#?\b", str(text or ""))]


# This takes sequence and returns deduped sequence because prerequisite code order should stay readable.
def _unique_preserve_order(items):
    output = []
    seen = set()
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


# This takes text and returns boolean because dangling AND/OR means extraction likely truncated the prereq.
def _has_trailing_connector(text):
    return bool(re.search(r"(?:\bOR\b|\bAND\b|&|/|,)\s*$", str(text or "").strip(), re.IGNORECASE))


# This takes text and returns prerequisite without offered-in suffix because offered markers belong in a separate field.
def _strip_trailing_offered_marker(text):
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    value = re.sub(
        r"\s+(?:Semester\s+[12](?:\s+only)?|Feb/Mar(?:\s+\w{0,4})?|Aug/Sept(?:\s+\w{0,4})?)\s*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", value).strip()


# This takes text and returns boolean because code-only prereqs can be rebuilt more safely than prose.
def _is_code_connector_only_prereq(text):
    cleaned = str(text or "").replace("*", " ")
    cleaned = re.sub(r"\b(?:OR|AND|Co-req:)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[,&/;()]", " ", cleaned)
    cleaned = re.sub(r"\b[A-Z]{3}\d{3,5}@?#?\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned == ""


# This takes codes and original text and returns connector because rebuilt prereqs should preserve AND/OR intent when possible.
def _choose_code_connector(codes, text):
    sample = str(text or "")
    if re.search(r"(?:\bOR\b|/)", sample, re.IGNORECASE):
        return " OR "
    if "&" in sample and not re.search(r"\bOR\b", sample, re.IGNORECASE):
        return " & "
    if re.search(r"\bAND\b", sample, re.IGNORECASE) and not re.search(r"\bOR\b", sample, re.IGNORECASE):
        return " AND "
    return " OR " if len(codes) > 1 else " "


# This takes prerequisite text and returns normalised code connector prereq because repeated connectors and punctuation confuse matching.
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


# This takes prerequisite text and returns boolean because only obviously code-style prereqs should be rebuilt.
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


# This takes raw evidence text and returns structured row evidence records because confidence scoring compares final units to source rows.
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


# This takes code and raw evidence and returns prerequisite candidate because source rows can repair LLM or deterministic prereq loss.
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


# This takes old/new prereqs and evidence and returns boolean because prerequisite upgrades should add evidence-backed detail, not lose meaning.
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


# This takes prerequisite text and returns quality metrics because metrics guide safe preference between competing prereq values.
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


# This takes current and candidate prereq and returns safer prereq because repair should improve completeness without accepting noisy text.
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


# This takes name text and returns boolean because badly extracted names should not block better evidence-backed values.
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


# This takes name text and returns boolean because corrupted existing names are allowed to be replaced more aggressively.
def _looks_corrupted_existing_name(text):
    if not text:
        return False
    name = re.sub(r"\s+", " ", str(text)).strip()
    if _is_bad_unit_name(name):
        return True
    tokens = re.findall(r"[A-Za-z][A-Za-z'-]*", name)
    for token in tokens:
        if len(token) < 6:
            continue
        if re.search(r"[a-z][A-Z]|[A-Z]{2}[a-z]{2,}|[A-Z][a-z]{0,2}[A-Z][a-z]{2,}", token):
            return True
    return False


# This takes old and new names and returns boolean because LLM changes that degrade names should be rejected.
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


# This takes old and new prereqs and returns boolean because LLM patches must not replace complete prereqs with truncated ones.
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


# This takes prereq plus unit context and returns cleaned prereq because final schema should remove row bleed, duplicates, and dangling connectors.
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


# This takes unit dict and returns boolean because project units may be safely promoted when counts show core shortfall.
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


# This takes baseline JSON and LLM patch and returns safely patched JSON because extra guards prevent LLM output from degrading deterministic extraction.
def apply_enhanced_crosscheck_patch(base_data, patch_data, file_name):
    data = apply_crosscheck_patch(base_data, patch_data, file_name)
    rejection_log = data.setdefault("_llm_rejections", [])
    is_engineering_course = bool(re.search(
        r'Bachelor of Engineering\b',
        str(base_data.get("course_information", {}).get("course") or ""),
        re.IGNORECASE,
    ))
    existing_codes = {
        str(u.get("unit_code", "")).strip().upper()
        for group_name in ("core_units", "major_units", "mpu_group", "prescribed_elective", "elective", "wil_group")
        for u in _group_units(base_data, group_name)
        if str(u.get("unit_code", "")).strip()
    }

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
    def process_unit(unit):
        code = str(unit.get('unit_code', '')).strip().upper()
        is_existing = code in existing_codes
        if not is_existing and 'semester' in unit:
            original_sem = unit['semester']
            if is_engineering_course:
                unit['semester'] = coerce_int(unit['semester'])
            else:
                unit['semester'] = _planner_sem_to_db_sem(unit['semester']) if coerce_int(unit['semester']) and coerce_int(unit['semester']) > 4 else coerce_int(unit['semester'])
            if unit.get('year_level') is None and original_sem is not None:
                unit['year_level'] = _planner_sem_to_year(original_sem)
        original_name = unit.get('unit_name')
        if 'unit_name' in unit:
            unit['unit_name'] = clean_unit_name(unit['unit_name'])
            if _is_worse_unit_name(original_name, unit.get('unit_name')):
                unit['unit_name'] = original_name
                _record_patch_rejection(
                    rejection_log,
                    "rejected_name_quality",
                    unit_code=code or None,
                )
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
                _record_patch_rejection(
                    rejection_log,
                    "rejected_prereq_truncation",
                    unit_code=code or None,
                )
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


# This takes unit-like dict and returns normalised app unit or None because downstream validation expects one schema shape.
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


# This takes LLM/deterministic data and returns normalised planner JSON because this repairs casing, groups, and field names before validation.
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
            "minor_groups": [],
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
    if "minorGroups" in categories and "minor_groups" not in categories:
        categories["minor_groups"] = categories.pop("minorGroups")

    elective_groups = categories.get("elective_groups")
    if not isinstance(elective_groups, dict):
        elective_groups = {}
    minor_groups = categories.get("minor_groups")
    if not isinstance(minor_groups, list):
        minor_groups = []

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

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
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
    normalised_minor_groups = []
    for group in minor_groups:
        if not isinstance(group, dict):
            continue
        minor_name = re.sub(r"\s+", " ", str(group.get("minor_name") or group.get("name") or "")).strip()
        units_list = normalise_unit_list(group.get("units", []))
        cleaned_units = []
        for unit in units_list:
            cleaned = {
                "unit_code": unit.get("unit_code"),
                "unit_name": unit.get("unit_name"),
                "prerequisite": unit.get("prerequisite"),
                "offered_in": unit.get("offered_in"),
            }
            if cleaned.get("unit_code") and cleaned.get("unit_name"):
                cleaned_units.append(cleaned)
        if minor_name:
            normalised_minor_groups.append({"minor_name": minor_name, "units": cleaned_units})
    categories["minor_groups"] = normalised_minor_groups

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
        "minor_groups": categories["minor_groups"],
        "wil_group": categories["wil_group"],
    }
    return data


# This takes planner JSON and returns category counts because reports and safety checks need cheap count summaries.
def unit_count_snapshot(data):
    categories = data.get("categories", {})
    elective_groups = categories.get("elective_groups", {})
    return {
        "core_units": len(categories.get("core_units", [])),
        "major_units": len(categories.get("major_units", [])),
        "mpu_group": len(categories.get("mpu_group", [])),
        "prescribed_elective": len(elective_groups.get("prescribed_elective", [])),
        "elective": len(elective_groups.get("elective", [])),
        "minor_groups": len(categories.get("minor_groups", [])),
        "wil_group": len(categories.get("wil_group", [])),
    }


# This takes planner JSON and group name and returns unit list because safety checks need uniform access to nested groups.
def _group_units(data, group_name):
    categories = data.get("categories", {})
    if group_name == "prescribed_elective":
        return categories.get("elective_groups", {}).get("prescribed_elective", [])
    if group_name == "elective":
        return categories.get("elective_groups", {}).get("elective", [])
    return categories.get(group_name, [])


# This takes unit list and returns code-indexed dict because LLM comparison should match units by code.
def _unit_index_by_code(units):
    index = {}
    for unit in units if isinstance(units, list) else []:
        code = str(unit.get("unit_code", unit.get("code", ""))).strip().upper()
        if code:
            index[code] = unit
    return index


# This takes value and returns cleaned nullable text because comparisons should ignore whitespace noise.
def _normalised_text(value):
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


# This takes baseline and LLM values and returns boolean because LLM patches must not erase existing data.
def _value_loss(base_value, llm_value):
    base_norm = _normalised_text(base_value)
    llm_norm = _normalised_text(llm_value)
    return base_norm is not None and llm_norm is None


# This takes baseline and LLM JSON and returns accept flag and reason because LLM patches are rejected if they lose units, categories, or field quality.
def should_accept_llm_output(base_data, llm_data):
    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
    def allowed_project_promotions():
        base_core = _unit_index_by_code(_group_units(base_data, "core_units"))
        base_major = _unit_index_by_code(_group_units(base_data, "major_units"))
        llm_core = _unit_index_by_code(_group_units(llm_data, "core_units"))

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
            if llm_unit.get("semester") != base_unit.get("semester"):
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
# This takes LLM response text and returns parsed JSON object because model output may include prose, so parsing searches for the first valid JSON value.
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
            if isinstance(obj, list):
                return {"course_information": {}, "unit_changes": obj}
            return obj
        except json.JSONDecodeError:
            continue
    raise ValueError("No valid JSON object found in LLM response")


# ---------------------------
# Validate and normalise
# ---------------------------
# This takes planner JSON and returns the normalised schema or raises validation errors unless silent mode is enabled because the app expects one stable top-level shape.
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
    if not isinstance(cats.get("minor_groups"), list):
        errors.append("categories.minor_groups is missing or invalid")
        cats["minor_groups"] = []

    eg = cats.get("elective_groups", {})

    if not cats.get("core_units"):
        errors.append("core_units is empty")
    if not cats.get("major_units"):
        errors.append("major_units is empty")
    if "prescribed_elective" not in eg:
        errors.append("elective_groups.prescribed_elective is missing")
    if "elective" not in eg:
        errors.append("elective_groups.elective is missing")
    for idx, group in enumerate(cats.get("minor_groups", [])):
        if not isinstance(group, dict):
            errors.append(f"minor_groups[{idx}] is invalid")
            continue
        if not group.get("minor_name"):
            errors.append(f"minor_groups[{idx}].minor_name is missing")
        if not isinstance(group.get("units"), list):
            errors.append(f"minor_groups[{idx}].units is missing or invalid")
            continue
        for unit_idx, unit in enumerate(group.get("units", [])):
            if not isinstance(unit, dict):
                errors.append(f"minor_groups[{idx}].units[{unit_idx}] is invalid")
                continue
            if not unit.get("unit_code"):
                errors.append(f"minor_groups[{idx}].units[{unit_idx}].unit_code is missing")
            if not unit.get("unit_name"):
                errors.append(f"minor_groups[{idx}].units[{unit_idx}].unit_name is missing")

    if silent:
        return data

    if errors:
        print("  WARNINGS:")
        for e in errors:
            print("    - " + e)
    else:
        print("  Validation passed.")

    return data


# This takes planner JSON and returns issue list because reports should tell users what needs manual review.
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
    minor_groups = cats.get("minor_groups", [])
    if minor_groups is None:
        minor_groups = []
    elif not isinstance(minor_groups, list):
        issues.append("minor_groups is missing or invalid")
    else:
        for idx, group in enumerate(minor_groups):
            if not isinstance(group, dict):
                issues.append(f"minor_groups[{idx}] is invalid")
                continue
            if not group.get("minor_name"):
                issues.append(f"minor_groups[{idx}].minor_name is missing")
            if not isinstance(group.get("units"), list):
                issues.append(f"minor_groups[{idx}].units is missing or invalid")
                continue
            for unit_idx, unit in enumerate(group.get("units", [])):
                if not isinstance(unit, dict):
                    issues.append(f"minor_groups[{idx}].units[{unit_idx}] is invalid")
                    continue
                if not unit.get("unit_code"):
                    issues.append(f"minor_groups[{idx}].units[{unit_idx}].unit_code is missing")
                if not unit.get("unit_name"):
                    issues.append(f"minor_groups[{idx}].units[{unit_idx}].unit_name is missing")
    return issues


# This takes numeric score and returns score from 0 to 1 because confidence signals must stay bounded.
def _clamp_score(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, value))


# This takes value and returns single-spaced text because scoring and issue formatting should be consistent.
def _normalise_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


# This takes planner JSON and returns boolean because some planners legitimately have no major requirement.
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


# This takes source evidence and planner JSON and returns a boolean because missing WIL should be treated as critical only when the PDF evidence implies WIL is expected.
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


# This takes requirement entry, unit count, evidence patterns and returns boolean because confidence should not penalise requirements absent from the planner.
def _requirement_expected(req_entry, unit_count, raw_evidence, label_patterns):
    if not isinstance(req_entry, dict):
        req_entry = {}
    if req_entry.get("count") is not None or req_entry.get("cp") is not None:
        return True
    if unit_count:
        return True
    text = _normalise_text(raw_evidence)
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in label_patterns)


# This takes planner JSON and returns flattened unit list because confidence and quality checks need every unit across all groups.
def _iter_all_units(data):
    categories = data.get("categories", {})
    elective_groups = categories.get("elective_groups", {})
    minor_units = []
    for group in categories.get("minor_groups", []) if isinstance(categories.get("minor_groups"), list) else []:
        if isinstance(group, dict):
            minor_units.extend(group.get("units", []))
    return (
        categories.get("core_units", []) +
        categories.get("major_units", []) +
        categories.get("mpu_group", []) +
        elective_groups.get("prescribed_elective", []) +
        elective_groups.get("elective", []) +
        minor_units +
        categories.get("wil_group", [])
    )


# This takes expected and actual counts and returns score because small count differences should be graded, not treated as binary failure.
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


# This takes issue text and returns severity because confidence scoring weighs critical and warning issues differently.
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


# This takes planner JSON and evidence and returns boolean because elective pools can exceed exact requirement counts without being wrong.
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


# This takes unit name and returns boolean because poor names signal extraction uncertainty and possible manual review.
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


# This takes unit dict and returns penalty labels because confidence needs explainable signals for bad names/prereqs.
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


# This takes planner JSON, raw evidence, validation issues and returns confidence report because users need a reliability signal when AI review is enabled.
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


# Formats validation issue for user for app-facing output.
# This takes an internal validation issue and returns a readable user message because the UI should not expose raw field paths like major_units.
def format_validation_issue_for_user(issue):
    text = _normalise_text(issue)
    lowered = text.lower()
    issue_map = {
        "core_units is empty": "Core unit is missing.",
        "major_units is empty": "Major unit is missing.",
        "mpu_group is empty": "MPU unit is missing.",
        "wil_group is empty": "WIL unit is missing.",
        "elective_groups is missing or invalid": "Elective group information is missing.",
        "elective_groups.elective is missing": "Elective unit is missing.",
        "elective_groups.prescribed_elective is missing": "Prescribed elective unit is missing.",
        "wil expected but wil_group is empty": "WIL unit is missing.",
    }
    if lowered in issue_map:
        return issue_map[lowered]

    metadata_match = re.match(r"missing course_information\.(.+)$", lowered)
    if metadata_match:
        return metadata_match.group(1).replace("_", " ") + " is missing."

    requirement_match = re.match(r"missing requirements\.(.+)$", lowered)
    if requirement_match:
        return requirement_match.group(1).replace("_", " ") + " requirement is missing."

    return (
        text
        .replace("course_information.", "")
        .replace("requirements.", "")
        .replace("elective_groups.", "")
        .replace("core_units", "core unit")
        .replace("major_units", "major unit")
        .replace("mpu_group", "MPU unit")
        .replace("wil_group", "WIL unit")
        .replace("prescribed_elective", "prescribed elective")
        .replace("_", " ")
    )


# Formats validation issues for user for app-facing output.
# This takes raw issue list and returns deduped readable issues because the report should be concise and user-facing.
def format_validation_issues_for_user(issues):
    formatted = []
    for issue in issues or []:
        readable = format_validation_issue_for_user(issue)
        if readable and readable not in formatted:
            formatted.append(readable)
    return formatted

# Determines processing outcome for the import report.
# This takes category counts, LLM state, and validation issues and returns the import outcome because the UI wording should reflect validation state without noisy success reasons.
def determine_processing_outcome(categories, llm_used, llm_applied, llm_error, validation_issues):
    if validation_issues:
        return {
            "status": "manual_review_required",
            "reason": "; ".join(validation_issues),
        }
    if llm_error and not llm_applied:
        return {
            "status": "deterministic_ok",
        }
    if llm_used and llm_applied:
        return {
            "status": "llm_fallback_used",
        }
    return {
        "status": "deterministic_ok",
    }

# Applies wil text override to the structured planner data.
# This takes structured planner JSON and returns planner JSON with WIL-like units moved into wil_group because WIL rows are often misclassified by colour or table layout.
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

    # This takes unit dict and returns boolean because wIL detection combines code, name, and prerequisite evidence.
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

# Helper for process planner pdf in the planner import pipeline.
# This takes PDF path and import options and returns planner JSON plus report because this preserves the app stdout contract while orchestrating extraction, optional LLM review, validation, and reporting.
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

    # Deterministic baseline. This always runs and is the fallback when LLM is
    # disabled, unavailable, or rejected by the safety checks.
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
            # The LLM receives compact evidence plus the deterministic JSON and
            # must return a patch. This keeps model output bounded and reviewable.
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

    # Final cleanup runs for both deterministic and LLM paths so downstream code
    # receives one stable schema shape.
    structured = normalise_llm_output(structured, base_name)
    structured = apply_wil_text_override(structured)
    structured = validate_and_normalise(structured, silent=True)
    validation_issues = collect_validation_issues(structured)
    db_payload = build_planner_template_db_payload(structured)
    # Confidence is only returned when AI review is enabled; the UI hides the
    # confidence panel for deterministic-only imports.
    confidence = None
    if use_llm and not raw_evidence:
        raw_evidence = extract_useful_raw_evidence_lines(
            pdf_path,
            max_lines_per_page=200,
            enhanced=False,
        )
    if use_llm:
        confidence = calculate_confidence(
            structured,
            raw_evidence=raw_evidence,
            validation_issues=validation_issues,
        )
    # Keep raw issues for scoring, but expose readable messages to the UI.
    report_validation_issues = format_validation_issues_for_user(validation_issues)
    outcome = determine_processing_outcome(
        structured.get("categories", {}),
        llm_used=llm_used,
        llm_applied=llm_applied,
        llm_error=llm_error,
        validation_issues=report_validation_issues,
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
        "validation_issues": report_validation_issues,
        "outcome": outcome,
        "unit_counts": unit_count_snapshot(structured),
        "db_payload": db_payload,
    }
    if confidence is not None:
        report["confidence"] = confidence

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
