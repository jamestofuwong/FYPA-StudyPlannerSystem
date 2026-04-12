import argparse
import json
import os
import re
import sys
import requests

from plannerPdfExtractor import (
    extract_text_from_pdf,
    clean_text,
    extract_metadata,
    extract_requirements,
    extract_units,
    extract_elective_sections,
)

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL_NAME = "deepseek-r1:1.5b"
DEFAULT_LLM_RETRIES = 2

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


# ---------------------------
# Parse WIL unit name/prereq
# ---------------------------
def parse_wil_unit(u):
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


def prepare_llm_text(raw_text):
    seen = set()
    cleaned_lines = []
    for line in raw_text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        if line in seen:
            continue
        seen.add(line)
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def build_structuring_prompt(file_name, raw_text):
    return f"""Convert this tagged PDF text into a structured JSON planner. The tags come from table cell background rectangles, not text colour.

Return ONLY one valid JSON object with this exact structure:
{{
  "file_name": "{file_name}",
  "course_information": {{
    "course": string,
    "major": string,
    "intake": string,
    "intake_year": integer,
    "requirements": {{
      "core": {{"count": integer or null, "cp": integer or null}},
      "major": {{"count": integer or null, "cp": integer or null}},
      "elective": {{"count": integer or null, "cp": integer or null}},
      "wil": {{"count": integer or null, "cp": integer or null}}
    }}
  }},
  "categories": {{
    "core_units": [unit],
    "major_units": [unit],
    "mpu_group": [unit],
    "elective_groups": {{
      "prescribed_elective": [unit],
      "elective": [unit]
    }},
    "wil_group": [unit]
  }}
}}

Each unit object must contain exactly:
{{
  "year_level": integer or null,
  "semester": integer or null,
  "category": string or null,
  "unit_code": string,
  "unit_name": string,
  "prerequisite": string or null,
  "offered_in": integer or null
}}

Rules:
1. Use tags like [CORE], [MAJOR], [ELECTIVE], [WIL], [MPU], [PRESCRIBED_ELECTIVE] to help set the category field.
2. Put elective units inside categories.elective_groups.elective, not directly under categories.
3. Always include categories.elective_groups.prescribed_elective, even if it is an empty array.
4. Always include mpu_group and wil_group, even if empty.
5. Keep the exact planner wording for intake. Convert offered_in to integer when possible: Semester 1 -> 1, Semester 2 -> 2, Summer Term -> 3, Winter Term -> 4.
6. year_level and semester are required for scheduled planner rows. Use null only for recommended elective pools or when the planner truly does not assign them.
7. MPU-prefixed units belong in mpu_group, not core_units or major_units.
8. Placeholder rows like "Elective 1" must be kept with unit_code "-" and unit_name "Elective 1".
9. [GENERAL] means the text was in a white or missing background. Use it for metadata, headings, intake info, and any uncategorised planner text.
10. Do not invent units. Do not drop units. Do not merge categories.
11. If a prerequisite line contains an offering period at the end, move that period into offered_in.
12. Return JSON only. No markdown. No explanation.

TAGGED TEXT:
{raw_text}
"""


DEEPSEEK_PROMPT_TEMPLATE = """\
Return JSON only.
Do not explain anything.
Do not restate the SUPPORT lines.
Do not use markdown.

Task:
Review the INPUT JSON and return only a minimal correction patch.

Output rules:
1. If no obvious correction is needed, return exactly:
[]
2. Otherwise return exactly one JSON array of changes:
[
  {
    "group": "core_units|major_units|mpu_group|wil_group|prescribed_elective|elective",
    "unit_code": "UNITCODE",
    "unit_name": "UNIT NAME",
    "fields": {
      "prerequisite": null,
      "offered_in": 1
    }
  }
]

Rules:
- Return only JSON.
- No prose.
- No SUPPORT summary.
- No code fences.
- No full planner JSON.
- Do not add or remove units.
- Only include fields that must change.
- If unsure, return [].

INPUT JSON:
{input_json}

SUPPORT:
{support_text}
"""


def build_support_context(metadata, requirements, units):
    lines = []
    lines.append(
        "META|course={}|major={}|intake={}|intake_year={}".format(
            metadata.get("course"),
            metadata.get("major"),
            metadata.get("intake"),
            metadata.get("intakeYear"),
        )
    )
    for key in ("core", "major", "elective", "wil"):
        value = requirements.get(key, {})
        lines.append(
            "REQ|{}|count={}|cp={}".format(
                key,
                value.get("count"),
                value.get("cp"),
            )
        )
    for unit in units:
        lines.append(
            "UNIT|{}|{}|{}|{}|{}|prereq={}|offered={}".format(
                unit.get("year_level"),
                unit.get("semester"),
                output_category(unit.get("category")),
                unit.get("unit_code", unit.get("code")),
                unit.get("unit_name", unit.get("name")),
                unit.get("prerequisite"),
                normalise_offered_in(unit.get("offered_in")),
            )
        )
    return "\n".join(lines)


def build_validation_prompt(data, support_text=""):
    input_str = json.dumps(data, indent=2, ensure_ascii=False)
    return (
        DEEPSEEK_PROMPT_TEMPLATE
        .replace("{input_json}", input_str)
        .replace("{support_text}", support_text)
    )


def is_patch_response(data):
    return isinstance(data, dict) and "unit_changes" in data


def _unit_group_container(categories, group_name):
    if group_name in ("prescribedElective", "prescribed_elective"):
        return (
            categories.get("elective_groups", {}).get("prescribed_elective", [])
            or categories.get("electiveGroups", {}).get("prescribedElective", [])
        )
    if group_name == "elective":
        return (
            categories.get("elective_groups", {}).get("elective", [])
            or categories.get("electiveGroups", {}).get("elective", [])
        )
    legacy_map = {
        "coreUnits": "core_units",
        "majorUnits": "major_units",
        "mpuGroup": "mpu_group",
        "wilGroup": "wil_group",
    }
    resolved = legacy_map.get(group_name, group_name)
    return categories.get(resolved, categories.get(group_name, []))


def apply_patch_response(base_data, patch_data):
    data = json.loads(json.dumps(base_data))

    course_patch = patch_data.get("course_information", {})
    if isinstance(course_patch, dict):
        target_ci = data.setdefault("course_information", {})
        for key in ("course", "major", "intake", "intake_year", "intakeYear"):
            if key in course_patch:
                target_ci["intake_year" if key == "intakeYear" else key] = course_patch[key]

        req_patch = course_patch.get("requirements", {})
        if isinstance(req_patch, dict):
            target_req = target_ci.setdefault("requirements", {})
            for req_key in ("core", "major", "elective", "wil"):
                if req_key in req_patch and isinstance(req_patch[req_key], dict):
                    target_req.setdefault(req_key, {})
                    for field in ("count", "cp"):
                        if field in req_patch[req_key]:
                            target_req[req_key][field] = req_patch[req_key][field]

    categories = data.setdefault("categories", {})
    for change in patch_data.get("unit_changes", []):
        if not isinstance(change, dict):
            continue
        group = change.get("group")
        code = str(change.get("unit_code", change.get("code", ""))).strip().upper()
        name = _normalised_text(change.get("unit_name", change.get("name")))
        fields = change.get("fields", {})
        if not isinstance(fields, dict):
            continue

        units = _unit_group_container(categories, group)
        target = None
        for unit in units if isinstance(units, list) else []:
            unit_code = str(unit.get("unit_code", unit.get("code", ""))).strip().upper()
            unit_name = _normalised_text(unit.get("unit_name", unit.get("name")))
            if unit_code == code and unit_name == name:
                target = unit
                break
        if target is None:
            continue

        for key, value in fields.items():
            if key in ("year_level", "semester", "category", "unit_code", "unit_name", "prerequisite", "offered_in", "code", "name"):
                if key == "code":
                    target["unit_code"] = value
                elif key == "name":
                    target["unit_name"] = value
                elif key == "category":
                    target["category"] = output_category(value)
                elif key == "offered_in":
                    normalised = normalise_offered_in(value)
                    if normalised is not None:
                        target["offered_in"] = normalised
                else:
                    target[key] = value

    return data


def overlay_llm_on_base(base_data, llm_data):
    data = json.loads(json.dumps(base_data))

    llm_ci = llm_data.get("course_information", {})
    base_ci = data.setdefault("course_information", {})
    if isinstance(llm_ci, dict):
        for key in ("course", "major", "intake", "intake_year", "intakeYear"):
            if llm_ci.get(key) not in (None, "", {}):
                base_ci["intake_year" if key == "intakeYear" else key] = llm_ci.get(key)

        llm_req = llm_ci.get("requirements", {})
        base_req = base_ci.setdefault("requirements", {})
        if isinstance(llm_req, dict):
            for req_key in ("core", "major", "elective", "wil"):
                base_req.setdefault(req_key, {})
                llm_req_val = llm_req.get(req_key, {})
                if isinstance(llm_req_val, dict):
                    for field in ("count", "cp"):
                        if llm_req_val.get(field) is not None:
                            base_req[req_key][field] = llm_req_val.get(field)

    categories = data.setdefault("categories", {})
    llm_categories = llm_data.get("categories", {})
    llm_groups = {
        "core_units": llm_categories.get("core_units", llm_categories.get("coreUnits", [])),
        "major_units": llm_categories.get("major_units", llm_categories.get("majorUnits", [])),
        "mpu_group": llm_categories.get("mpu_group", llm_categories.get("mpuGroup", [])),
        "wil_group": llm_categories.get("wil_group", llm_categories.get("wilGroup", [])),
        "prescribed_elective": (
            llm_categories.get("elective_groups", {}).get("prescribed_elective", [])
            or llm_categories.get("electiveGroups", {}).get("prescribedElective", [])
        ),
        "elective": (
            llm_categories.get("elective_groups", {}).get("elective", [])
            or llm_categories.get("electiveGroups", {}).get("elective", [])
        ),
    }
    base_groups = {
        "core_units": categories.get("core_units", []),
        "major_units": categories.get("major_units", []),
        "mpu_group": categories.get("mpu_group", []),
        "wil_group": categories.get("wil_group", []),
        "prescribed_elective": categories.get("elective_groups", {}).get("prescribed_elective", []),
        "elective": categories.get("elective_groups", {}).get("elective", []),
    }

    for group_name, base_units in base_groups.items():
        llm_index = _unit_index(llm_groups.get(group_name, []))
        for base_unit in base_units if isinstance(base_units, list) else []:
            key = (
                str(base_unit.get("unit_code", base_unit.get("code", ""))).strip().upper(),
                str(base_unit.get("unit_name", base_unit.get("name", ""))).strip(),
            )
            llm_unit = llm_index.get(key)
            if not llm_unit:
                continue

            if llm_unit.get("year_level") is not None:
                base_unit["year_level"] = llm_unit.get("year_level")
            if llm_unit.get("semester") is not None:
                base_unit["semester"] = llm_unit.get("semester")
            if llm_unit.get("category") not in (None, ""):
                base_unit["category"] = output_category(llm_unit.get("category"))
            if llm_unit.get("unit_code", llm_unit.get("code")) not in (None, ""):
                base_unit["unit_code"] = llm_unit.get("unit_code", llm_unit.get("code"))
            if llm_unit.get("unit_name", llm_unit.get("name")) not in (None, ""):
                base_unit["unit_name"] = llm_unit.get("unit_name", llm_unit.get("name"))
            if llm_unit.get("prerequisite") not in (None, ""):
                base_unit["prerequisite"] = llm_unit.get("prerequisite")
            if llm_unit.get("offered_in") not in (None, ""):
                base_unit["offered_in"] = normalise_offered_in(llm_unit.get("offered_in"))

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

    if not silent and errors:
        print("  WARNINGS:")
        for e in errors:
            print("    - " + e)
    elif not silent:
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


def determine_processing_outcome(data, llm_used, llm_applied, llm_error, validation_issues):
    categories = data.get("categories", {})
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
    elective_sections = extract_elective_sections(pdf_path)

    structured = assemble_json(base_name, metadata, requirements, units, elective_sections)
    llm_used = False
    llm_applied = False
    llm_error = None
    llm_attempts = []
    llm_mode = "disabled" if not use_llm else "enabled"

    if use_llm:
        llm_used = True
        support_text = build_support_context(metadata, requirements, units)
        try:
            cleanup_prompt = build_validation_prompt(structured, support_text=support_text)
            response, llm_attempts = call_ollama_with_retries(cleanup_prompt, model_name, retries=llm_retries)
            llm_structured = extract_json(response)
            if is_patch_response(llm_structured):
                llm_structured = apply_patch_response(structured, llm_structured)
            else:
                llm_structured = normalise_llm_output(llm_structured, base_name)
                llm_structured = overlay_llm_on_base(structured, llm_structured)
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
        structured,
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
