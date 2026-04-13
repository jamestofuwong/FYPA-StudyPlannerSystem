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
)

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL_NAME = "deepseek-r1:1.5b"
DEFAULT_LLM_RETRIES = 2
UNIT_CODE_RE = re.compile(r"\b[A-Z]{3}\d{5}\b")
YEAR_RE = re.compile(r"^\s*Year\s+(One|Two|Three|Four|Five|\d+)\s*$", re.IGNORECASE)
SEM_RE = re.compile(r"^\s*Semester\s+(\d+)(?:\s*\|\s*([A-Za-z/]+)\s+(\d{4}))?.*$", re.IGNORECASE)
TERM_RE = re.compile(r"^\s*(Summer(?:\s+Term)?|Winter(?:\s+Term)?)(?:\s*\|\s*([A-Za-z/]+)\s+(\d{4}))?.*$", re.IGNORECASE)
YEAR_MAP = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}

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


def assemble_json(file_name, metadata, requirements, units):
    # Build requirements entry with count + cp
    def req_entry(key):
        val = requirements.get(key, {})
        if isinstance(val, dict):
            return {"count": val.get("count"), "cp": val.get("cp")}
        return {"count": None, "cp": None}

    course_info = {
        "course":      metadata.get("course", ""),
        "major":       re.sub(r"\s+", " ", metadata.get("major", "")).strip(),
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


def extract_useful_raw_evidence_lines(pdf_path, max_lines_per_page=120):
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


def build_improved_crosscheck_prompt(file_name, base_data, raw_lines, model_name=""):
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
   - ENG, MTH, PHY, NPS prefix -> "core"
   - CVE, MEE, PEH, ENV, BIO, CHE prefix -> "major_core" when the planner row is major-coloured or is a major row
   - MGT, ACC, MKT, INF, ECO, HRM, PRM, COM, BCH, COS, BUS, INB, SOC, EEE, MDA prefix -> "elective" when shown as elective choice
   - EAT or explicit Work Integrated Learning unit -> "wil"
   - MPU prefix -> "mpu"
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

    categories = data.setdefault("categories", {})
    containers = {
        "core": categories.setdefault("core_units", []),
        "major_core": categories.setdefault("major_units", []),
        "mpu": categories.setdefault("mpu_group", []),
        "prescribed_elective": categories.setdefault("elective_groups", {}).setdefault("prescribed_elective", []),
        "elective": categories.setdefault("elective_groups", {}).setdefault("elective", []),
        "wil": categories.setdefault("wil_group", []),
    }
    base_code_index = {}
    for category_name, items in containers.items():
        for item in items:
            code = str(item.get("unit_code", "")).strip().upper()
            if code:
                base_code_index[code] = category_name

    if "unit_changes" not in patch_data and isinstance(patch_data.get("units"), list):
        alt_ci = {
            "course": patch_data.get("course"),
            "major": patch_data.get("major"),
            "intake": patch_data.get("intake"),
            "intake_year": patch_data.get("intake_year", patch_data.get("start_year")),
            "requirements": patch_data.get("requirements", {}),
        }
        alt_units = []
        for item in patch_data.get("units", []):
            if not isinstance(item, dict):
                continue
            code = str(item.get("unit_code", "")).strip().upper()
            if not code or len(code) > 12:
                continue
            category = base_code_index.get(code)
            if category is None:
                if code.startswith(("EAT", "NPS")) and "work integrated" in json.dumps(item).lower():
                    category = "wil"
                elif code.startswith("MPU"):
                    category = "mpu"
                elif code.startswith(("ENG", "MTH", "PHY", "NPS")):
                    category = "core"
                elif code.startswith(("CVE", "MEE", "PEH", "ENV", "BIO", "CHE")):
                    category = "major_core"
                else:
                    category = "elective"
            alt_units.append({
                "year_level": item.get("year_level", item.get("year")),
                "semester": item.get("semester"),
                "category": category,
                "unit_code": code,
                "unit_name": item.get("unit_name"),
                "prerequisite": item.get("prerequisite", item.get("prerequisites")),
                "offered_in": item.get("offered_in"),
            })
        alt_data = {
            "file_name": file_name,
            "course_information": alt_ci,
            "units": alt_units,
        }
        return normalise_llm_output(alt_data, file_name)

    patch_ci = patch_data.get("course_information", {})
    if isinstance(patch_ci, dict):
        base_ci = data.setdefault("course_information", {})
        for key in ("course", "major", "intake", "intake_year"):
            value = patch_ci.get(key)
            if value not in (None, ""):
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
                    if req_value.get(field) is not None:
                        target[field] = req_value.get(field)

    code_index = {}
    for category_name, items in containers.items():
        for item in items:
            code = str(item.get("unit_code", "")).strip().upper()
            if code:
                code_index[code] = (category_name, item)

    for change in patch_data.get("unit_changes", []):
        if not isinstance(change, dict):
            continue
        code = str(change.get("unit_code", "")).strip().upper()
        if not code:
            continue
        action = str(change.get("action", "update")).strip().lower()
        target_info = code_index.get(code)
        if target_info:
            _, target_unit = target_info
            for field in ("year_level", "semester", "unit_name", "prerequisite", "offered_in"):
                if field in change and change.get(field) is not None:
                    target_unit[field] = change.get(field)
            if change.get("category") in containers and change.get("category") != target_unit.get("category"):
                old_category, old_unit = target_info
                if old_unit in containers[old_category]:
                    containers[old_category].remove(old_unit)
                old_unit["category"] = change.get("category")
                containers[change.get("category")].append(old_unit)
                code_index[code] = (change.get("category"), old_unit)
            continue
        if action != "add":
            continue
        category = change.get("category")
        if category not in containers:
            category = "elective"
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
    name = re.sub(r'\s+[A-Z]{3}\d{5}@?\s*', ' ', str(name))
    name = name.replace('@', '')
    if name.endswith(' Nil'):
        name = name[:-4]
    return re.sub(r'\s+', ' ', name).strip()


def normalize_prerequisite(prereq):
    if not prereq:
        return prereq
    prereq = re.sub(r'\s+Co-req:', '; Co-req:', str(prereq))
    return re.sub(r'\s+', ' ', prereq).strip()


def apply_enhanced_crosscheck_patch(base_data, patch_data, file_name):
    data = apply_crosscheck_patch(base_data, patch_data, file_name)

    def process_unit(unit):
        if 'semester' in unit:
            original_sem = unit['semester']
            unit['semester'] = _planner_sem_to_db_sem(unit['semester']) if coerce_int(unit['semester']) and coerce_int(unit['semester']) > 4 else coerce_int(unit['semester'])
            if unit.get('year_level') is None and original_sem is not None:
                unit['year_level'] = _planner_sem_to_year(original_sem)
        if 'unit_name' in unit:
            unit['unit_name'] = clean_unit_name(unit['unit_name'])
        if 'prerequisite' in unit and unit['prerequisite']:
            unit['prerequisite'] = normalize_prerequisite(unit['prerequisite'])
        return unit

    cats = data.get('categories', {})
    for key in ('core_units', 'major_units', 'mpu_group', 'wil_group'):
        cats[key] = [process_unit(u) for u in cats.get(key, [])]
    eg = cats.get('elective_groups', {})
    eg['elective'] = [process_unit(u) for u in eg.get('elective', [])]
    eg['prescribed_elective'] = [process_unit(u) for u in eg.get('prescribed_elective', [])]
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


def _normalised_text(value):
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _value_loss(base_value, llm_value):
    base_norm = _normalised_text(base_value)
    llm_norm = _normalised_text(llm_value)
    return base_norm is not None and llm_norm is None


def should_accept_llm_output(base_data, llm_data):
    base_counts = unit_count_snapshot(base_data)
    llm_counts = unit_count_snapshot(llm_data)

    if llm_counts["core_units"] < base_counts["core_units"]:
        return False, "LLM reduced core_units count"
    if llm_counts["major_units"] < base_counts["major_units"]:
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
        base_index = _unit_index(base_units)
        llm_index = _unit_index(llm_units)

        if set(base_index.keys()) != set(llm_index.keys()):
            return False, "LLM changed unit membership in " + group_name

        for key, base_unit in base_index.items():
            llm_unit = llm_index[key]
            if llm_unit.get("category") != base_unit.get("category"):
                return False, "LLM changed category for " + (base_unit.get("unit_code") or "-")
            if llm_unit.get("year_level") != base_unit.get("year_level"):
                return False, "LLM changed year_level for " + (base_unit.get("unit_code") or "-")
            if llm_unit.get("semester") != base_unit.get("semester"):
                return False, "LLM changed semester for " + (base_unit.get("unit_code") or "-")
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
def _validation_issues(data):
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
    if not isinstance(cats.get("elective_groups"), dict):
        issues.append("categories.elective_groups is missing or invalid")
        cats["elective_groups"] = {"prescribed_elective": [], "elective": []}

    eg = cats.get("elective_groups", {})

    if not cats.get("core_units"):
        issues.append("core_units is empty")
    if not cats.get("major_units"):
        issues.append("major_units is empty")
    if "prescribed_elective" not in eg:
        issues.append("elective_groups.prescribed_elective is missing")
    if "elective" not in eg:
        issues.append("elective_groups.elective is missing")
    return issues


def validate_and_normalise(data, silent=False):
    errors = _validation_issues(data)

    if not silent and errors:
        print("  WARNINGS:")
        for e in errors:
            print("    - " + e)
    elif not silent:
        print("  Validation passed.")

    return data


def collect_validation_issues(data):
    return _validation_issues(data)


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


def process_planner_pdf(pdf_path, model_name=DEFAULT_MODEL_NAME, use_llm=True, llm_retries=DEFAULT_LLM_RETRIES):
    if not os.path.exists(pdf_path):
        raise FileNotFoundError("file not found: " + pdf_path)

    base_name = os.path.splitext(os.path.basename(pdf_path))[0]

    raw_text = extract_text_from_pdf(pdf_path)
    cleaned_text = clean_text(raw_text)
    metadata = extract_metadata(cleaned_text)
    requirements = extract_requirements(cleaned_text)
    units = extract_units(pdf_path)
    structured = assemble_json(base_name, metadata, requirements, units)
    llm_used = False
    llm_applied = False
    llm_error = None
    llm_attempts = []
    llm_mode = "disabled" if not use_llm else "enabled"

    if use_llm:
        llm_used = True
        try:
            raw_evidence = extract_useful_raw_evidence_lines(pdf_path, max_lines_per_page=200)
            cleanup_prompt = build_improved_crosscheck_prompt(base_name, structured, raw_evidence, model_name=model_name)
            response, llm_attempts = call_ollama_with_retries(cleanup_prompt, model_name, retries=llm_retries)
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

    structured = validate_and_normalise(structured, silent=True)
    validation_issues = collect_validation_issues(structured)
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
        "llm_retries": llm_retries,
        "llm_used": llm_used,
        "llm_applied": llm_applied,
        "llm_error": llm_error,
        "llm_attempts": llm_attempts,
        "validation_issues": validation_issues,
        "outcome": outcome,
        "unit_counts": unit_count_snapshot(structured),
    }

    return structured, report


# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract a planner PDF into structured JSON.")
    parser.add_argument("pdf", help="Path to planner PDF")
    parser.add_argument("--model", default=DEFAULT_MODEL_NAME, help="Ollama model for optional LLM cleanup")
    parser.add_argument("--no-llm", action="store_true", help="Skip the LLM cleanup step")
    parser.add_argument("--llm-retries", type=int, default=DEFAULT_LLM_RETRIES, help="Number of LLM retry attempts")
    parser.add_argument("--planner-only", action="store_true", help="Print only the structured planner JSON")
    args = parser.parse_args()

    try:
        structured, report = process_planner_pdf(
            args.pdf,
            model_name=args.model,
            use_llm=not args.no_llm,
            llm_retries=args.llm_retries,
        )
        payload = structured if args.planner_only else {"planner": structured, "report": report}
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
