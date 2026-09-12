from __future__ import annotations

import re
import statistics
from collections import Counter

from plannerStructureAssembler import CODE_TOKEN_RE, iter_units

VALID_CATEGORIES = {"core", "major_core", "elective", "prescribed_elective", "mpu", "wil"}
PLANNED_CATEGORIES = {"core", "major_core", "mpu", "wil"}
PLACEHOLDER_CODES = {"-", "ELECTIVE", "INDUSTRY_TRAINING"}

# Runtime quality checks support deterministic fallback planning; they do not evaluate against gold data.

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

NAME_NOISE_RE = re.compile(
    r"\b(?:pre-?req(?:uisites?)?|co-?req(?:uisites?)?|anti-?req(?:uisites?)?|"
    r"credit points?|course information|foundation studies|students? (?:need|required|"
    r"are|articulating)|complete as part of|recommended for completion|exemptions?)\b",
    re.IGNORECASE,
)
PREREQ_NOISE_RE = re.compile(
    r"\b(?:course information|unit name|unit title|recommended elective|foundation studies)\b",
    re.IGNORECASE,
)
CONNECTOR_END_RE = re.compile(r"(?:\b(?:and|or)\b|[&,/])\s*$", re.IGNORECASE)
SIGNIFICANT_STOPWORDS = {"and", "or", "of", "the", "in", "to", "for", "a", "an", "with"}

def _issue(code, issue_type, severity, reason, **context):
    return {
        "code": code,
        "type": issue_type,
        "severity": severity,
        "reason": reason,
        **{key: value for key, value in context.items() if value is not None},
    }

def _code(value):
    return str(value or "").strip().upper()

def _valid_code(value):
    value = _code(value)
    return value in PLACEHOLDER_CODES or CODE_TOKEN_RE.fullmatch(value) is not None

def _repeated_significant_word(value):
    words = [word for word in re.findall(r"[a-z]+", str(value or "").lower())
             if word not in SIGNIFICANT_STOPWORDS and len(word) > 3]
    return any(count > 1 for count in Counter(words).values())

def _name_problem(name, median_words):
    text = re.sub(r"\s+", " ", str(name or "")).strip()
    if not text:
        return "missing"
    if _is_bad_unit_name(text):
        return "invalid"
    if (_looks_corrupted_existing_name(text) or NAME_NOISE_RE.search(text) or
            CODE_TOKEN_RE.search(text) or _repeated_significant_word(text)):
        return "contaminated"
    if len(text.split()) > max(12, median_words * 2.5) or CONNECTOR_END_RE.search(text):
        return "suspicious"
    return None

def _prerequisite_problem(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return None
    codes = CODE_TOKEN_RE.findall(text.upper())
    if len(codes) != len(set(codes)):
        return "duplicate unit codes"
    if CONNECTOR_END_RE.search(text):
        return "trailing connector"
    if PREREQ_NOISE_RE.search(text):
        return "unrelated section text"
    return None

def _requirement_deficits(data):
    requirements = data.get("course_information", {}).get("requirements", {})
    counts = Counter(category for category, _ in iter_units(data))
    deficits = []
    for category, key in (("core", "core"), ("major_core", "major"),
                          ("elective", "elective"), ("wil", "wil")):
        requirement = requirements.get(key)
        expected = requirement.get("count") if isinstance(requirement, dict) else None
        if isinstance(expected, int) and expected > counts[category]:
            deficits.append((category, expected, counts[category]))
    return deficits

# Validate structure for deterministic fallback and refinement decisions without mutating it.
def validate_planner(data):
    """Return deterministic quality issues without changing planner data."""
    issues = []
    units = list(iter_units(data))
    names = [len(str(unit.get("unit_name") or "").split()) for _, unit in units if unit.get("unit_name")]
    median_words = statistics.median(names) if names else 3
    seen_codes = Counter(_code(unit.get("unit_code")) for _, unit in units if unit.get("unit_code"))

    for category, unit in units:
        code = _code(unit.get("unit_code"))
        if not _valid_code(code):
            issues.append(_issue("E04", "invalid_unit_code", "high", "unit code does not match the supported format",
                                 section=category, unit_code=code))
        if code not in PLACEHOLDER_CODES and seen_codes[code] > 1:
            issues.append(_issue("E03", "duplicate_unit", "high", "unit code appears more than once in main groups",
                                 section=category, unit_code=code))

        name_problem = _name_problem(unit.get("unit_name"), median_words)
        if name_problem:
            issue_code = "E06" if name_problem == "missing" else "E05" if name_problem == "contaminated" else "E07"
            issues.append(_issue(issue_code, name_problem + "_unit_name", "medium",
                                 "unit name failed generic quality checks", section=category, unit_code=code))

        year = unit.get("year_level")
        semester = unit.get("semester")
        if category in PLANNED_CATEGORIES and CODE_TOKEN_RE.fullmatch(code):
            if year is None:
                issues.append(_issue("E08", "missing_year", "medium", "planned unit has no year",
                                     section=category, unit_code=code))
            elif not isinstance(year, int) or not 1 <= year <= 6:
                issues.append(_issue("E09", "invalid_year", "high", "year is outside the supported range",
                                     section=category, unit_code=code))
            if semester is None:
                issues.append(_issue("E10", "missing_semester", "medium", "planned unit has no semester",
                                     section=category, unit_code=code))
            elif not isinstance(semester, int) or not 1 <= semester <= 8:
                issues.append(_issue("E11", "invalid_semester", "high", "semester is outside the supported range",
                                     section=category, unit_code=code))

        declared_category = unit.get("category")
        if declared_category is None:
            issues.append(_issue("E12", "missing_category", "high", "unit category field is missing",
                                 section=category, unit_code=code))
        elif declared_category not in VALID_CATEGORIES:
            issues.append(_issue("E13", "invalid_category", "high", "unit category field is unsupported",
                                 section=category, unit_code=code))
        elif declared_category != category:
            issues.append(_issue("E14", "category_conflict", "high",
                                 "unit category disagrees with its containing group",
                                 section=category, unit_code=code))
        prerequisite_problem = _prerequisite_problem(unit.get("prerequisite"))
        if prerequisite_problem:
            issues.append(_issue("E16", "suspicious_prerequisite", "medium", prerequisite_problem,
                                 section=category, unit_code=code))

    minor_codes = {
        _code(unit.get("unit_code"))
        for group in data.get("categories", {}).get("minor_groups", []) or []
        if isinstance(group, dict)
        for unit in group.get("units", []) or [] if isinstance(unit, dict)
    }
    main_by_code = {code: category for category, unit in units if (code := _code(unit.get("unit_code")))}
    for code in sorted(minor_codes & set(main_by_code)):
        if main_by_code[code] not in {"elective", "prescribed_elective"}:
            issues.append(_issue("E19", "main_minor_duplication", "medium",
                                 "minor unit also appears in a non-elective main group", unit_code=code,
                                 section=main_by_code[code]))

    for category, expected, actual in _requirement_deficits(data):
        issues.append(_issue("E01", "requirement_count_deficit", "medium",
                             "requirement count is supporting evidence only; alternatives may be valid",
                             section=category, expected=expected, actual=actual))

    return {
        "valid": not any(issue["severity"] == "high" for issue in issues),
        "issues": issues,
        "summary": dict(Counter(issue["code"] for issue in issues)),
    }

FALLBACK_ENGINE = {
    "E01": "pdftext",
    "E05": "pdftext",
    "E06": "pdftext",
    "E07": "pdftext",
    "E08": "docling",
    "E09": "docling",
    "E10": "docling",
    "E11": "docling",
    "E12": "pdfplumber_review",
    "E13": "pdfplumber_review",
    "E14": "pdfplumber_review",
    "E16": "deterministic_review",
    "E18": "deterministic_review",
    "E19": "deterministic_review",
    "E23": "docling",
    "E24": "docling",
}

# Map quality issues to deterministic fallback engines; these plans control extraction stages.
def select_fallbacks(validation):
    """Map each detected issue to one responsible engine; confidence alone never triggers."""
    return [
        {
            "engine": FALLBACK_ENGINE[issue["code"]],
            "issue": issue["type"],
            "issue_code": issue["code"],
            "severity": issue["severity"],
            "unit_code": issue.get("unit_code"),
            "section": issue.get("section"),
            "reason": issue["reason"],
        }
        for issue in validation.get("issues", [])
        if issue["code"] in FALLBACK_ENGINE
    ]

# Keep the orchestration check small so the pipeline does not depend on issue internals.
def plan_uses(plan, engine):
    return any(item.get("engine") == engine for item in plan)
