from __future__ import annotations
import re
from plannerPdfExtractor import UNIT_MARKER_RE

# Canonical planner-structure helpers shared by extraction fallbacks and normalization.
# This module assembles groups and unit objects; PDF parsing remains in extractor modules.

CODE_TOKEN_RE = re.compile(
    rf"^[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?$", re.IGNORECASE
)

def clean_unit_name(name):
    """Remove PDF markers and repeated noise while preserving the unit title."""
    if not name:
        return name
    name = re.sub(r'\s+[A-Z]{3}\d{3,5}[@#]?\s*', ' ', str(name))
    name = name.replace('@', '').replace('#', '').replace('â€ ', '').replace('*', '')
    name = re.sub(r'\s*\([^()]*\)', '', name)
    if name.endswith(' Nil'):
        name = name[:-4]
    name = re.sub(r'\b(\w+)(?:\s+\1)+\b', r'\1', name)
    name = re.sub(r'(\([^()]+\))(?:\s+\1)+', r'\1', name)
    name = re.sub(
        r'^([A-Za-z&/()]+)\s+Professional Experience in$',
        r'Professional Experience in \1',
        name,
    )
    return re.sub(r'\s+', ' ', name).strip()


CATEGORY_GROUPS = {
    "core": ("core_units",),
    "major_core": ("major_units",),
    "elective": ("elective_groups", "elective"),
    "prescribed_elective": ("elective_groups", "prescribed_elective"),
    "mpu": ("mpu_group",),
    "wil": ("wil_group",),
}


def iter_units(data):
    """Yield (group name, unit) pairs from every main planner category."""
    categories = data.get("categories", {}) if isinstance(data, dict) else {}
    groups = [
        ("core", categories.get("core_units", [])),
        ("major_core", categories.get("major_units", [])),
        ("mpu", categories.get("mpu_group", [])),
        ("wil", categories.get("wil_group", [])),
        ("prescribed_elective", categories.get("elective_groups", {}).get("prescribed_elective", [])),
        ("elective", categories.get("elective_groups", {}).get("elective", [])),
    ]
    for category, units in groups:
        for unit in units if isinstance(units, list) else []:
            if isinstance(unit, dict):
                yield category, unit


def _iter_unit_refs(data):
    categories = data.get("categories", {}) if isinstance(data, dict) else {}
    for category, path in CATEGORY_GROUPS.items():
        value = categories
        for key in path:
            value = value.get(key, {}) if isinstance(value, dict) else []
        for unit in value if isinstance(value, list) else []:
            if isinstance(unit, dict):
                yield category, unit


def _unit_index(data):
    return {
        str(unit.get("unit_code") or "").strip().upper(): (category, unit)
        for category, unit in _iter_unit_refs(data)
        if unit.get("unit_code")
    }


def _minor_codes(data):
    groups = data.get("categories", {}).get("minor_groups", []) if isinstance(data, dict) else []
    return {
        str(unit.get("unit_code") or "").strip().upper()
        for group in groups if isinstance(group, dict)
        for unit in group.get("units", [])
        if isinstance(unit, dict) and unit.get("unit_code")
    }

def parse_wil_unit(u):
    """Separate WIL title text from attached explanatory or prerequisite text."""
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
    """Return normalized prerequisite text, representing blank or Nil values as None."""
    if text is None:
        return None
    text = re.sub(r"\s+", " ", str(text)).strip()
    if not text or text.lower() == "nil":
        return None
    return text


# This takes course title and returns template course_type because planner templates now store canonical course type values for persistence.

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



def coerce_requirement_cp(value):
    """Preserve integer and decimal credit-point values during final normalisation."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else float(value)
    text = str(value).strip()
    if not text or text == "-":
        return None
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        number = float(text)
        return int(number) if number.is_integer() else number
    return None


# This takes offered-in label and returns app semester code because labels like Feb/Mar need database-compatible numeric values.

def normalise_offered_in(value):
    """Normalize offered-in values into the planner contract's nullable representation."""
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
    """Build minor-group structures while retaining unit ownership and section names."""
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


# This assembles extracted metadata, requirements, units, and elective sections into the app planner schema.

def assemble_json(file_name, metadata, requirements, units, elective_sections):
    """Assemble extracted metadata and units into the canonical planner JSON structure."""
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
