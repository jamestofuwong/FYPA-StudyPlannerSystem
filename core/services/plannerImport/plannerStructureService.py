import argparse
import json
import os
import re
import sys
from contextlib import redirect_stdout
from plannerPdfExtractor import (
    extract_text_from_pdf,
    clean_text,
    extract_units,
    extract_elective_sections,
)
from plannerPdfRequirements import extract_metadata, extract_requirements
from plannerStructureAssembler import (
    assemble_json,
    clean_unit_name,
    coerce_int,
    coerce_requirement_cp,
    normalise_offered_in,
    normalise_prereq_text,
)
from plannerExtractionPipeline import apply_extraction_pipeline
from plannerExtractionQuality import NAME_NOISE_RE

# ============================================================
# STEP 1: Prepare application helpers
# ============================================================
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
    if not isinstance(elective_groups, dict):
        elective_groups = {}
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

# ============================================================
# STEP 2: Prepare normalization and report helpers
# ============================================================
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

# Normalize extracted planner data to the application schema.
def normalise_planner_output(data, file_name):
    data = data if isinstance(data, dict) else {}
    data["file_name"] = file_name
    ci = data.get("course_information") if isinstance(data.get("course_information"), dict) else {}
    requirements = ci.get("requirements") if isinstance(ci.get("requirements"), dict) else {}
    for key in ("core", "major", "elective", "wil"):
        value = requirements.get(key) if isinstance(requirements.get(key), dict) else {}
        requirements[key] = {"count": coerce_int(value.get("count")), "cp": coerce_requirement_cp(value.get("cp"))}
    ci["requirements"] = requirements
    ci["intake_year"] = coerce_int(ci.get("intake_year") or ci.get("intakeYear"))
    ci.pop("intakeYear", None)
    data["course_information"] = ci

    categories = data.get("categories") if isinstance(data.get("categories"), dict) else {}
    electives = categories.get("elective_groups") if isinstance(categories.get("elective_groups"), dict) else {}
    # Normalize all units in one category while preserving their fields.
    def normalise_units(units, category):
        output = []
        for raw in units if isinstance(units, list) else []:
            if not isinstance(raw, dict):
                continue
            code = str(raw.get("unit_code") or raw.get("code") or "").strip().upper() or "-"
            output.append({
                "year_level": coerce_int(raw.get("year_level") or raw.get("year")),
                "semester": coerce_int(raw.get("semester")),
                "category": category,
                "unit_code": code,
                "unit_name": clean_unit_name(raw.get("unit_name") or raw.get("name") or ""),
                "prerequisite": normalise_prereq_text(raw.get("prerequisite") or raw.get("prereq")),
                "offered_in": normalise_offered_in(raw.get("offered_in") or raw.get("offered")),
            })
        return output
    data["categories"] = {
        "core_units": normalise_units(categories.get("core_units"), "core"),
        "major_units": normalise_units(categories.get("major_units"), "major_core"),
        "mpu_group": normalise_units(categories.get("mpu_group"), "mpu"),
        "wil_group": normalise_units(categories.get("wil_group"), "wil"),
        "elective_groups": {
            "prescribed_elective": normalise_units(electives.get("prescribed_elective"), "prescribed_elective"),
            "elective": normalise_units(electives.get("elective"), "elective"),
        },
        "minor_groups": categories.get("minor_groups") if isinstance(categories.get("minor_groups"), list) else [],
    }
    return data

# Count units in each output group for the import report.
def unit_count_snapshot(data):
    categories = data.get("categories", {})
    electives = categories.get("elective_groups", {})
    return {"core_units": len(categories.get("core_units", [])), "major_units": len(categories.get("major_units", [])), "mpu_group": len(categories.get("mpu_group", [])), "prescribed_elective": len(electives.get("prescribed_elective", [])), "elective": len(electives.get("elective", [])), "minor_groups": len(categories.get("minor_groups", [])), "wil_group": len(categories.get("wil_group", []))}

# Preserve the application validation hook for compatibility.
def validate_and_normalise(data, silent=False):
    return data

# Return category/unit pairs from groups that can contain scheduled units.
def _iter_validation_units(data):
    categories = data.get("categories", {}) if isinstance(data, dict) else {}
    electives = categories.get("elective_groups", {}) if isinstance(categories, dict) else {}
    groups = (
        ("core", categories.get("core_units", [])),
        ("major", categories.get("major_units", [])),
        ("mpu", categories.get("mpu_group", [])),
        ("prescribed_elective", electives.get("prescribed_elective", []) if isinstance(electives, dict) else []),
        ("elective", electives.get("elective", []) if isinstance(electives, dict) else []),
        ("wil", categories.get("wil_group", [])),
    )
    for category, units in groups:
        for unit in units if isinstance(units, list) else []:
            if isinstance(unit, dict):
                yield category, unit


# Count unique scheduled placements, including distinct empty elective slots.
def _scheduled_main_semester_units(data):
    categories = data.get("categories", {}) if isinstance(data, dict) else {}
    electives = categories.get("elective_groups", {}) if isinstance(categories, dict) else {}
    groups = (
        categories.get("core_units", []),
        categories.get("major_units", []),
        categories.get("mpu_group", []),
        electives.get("prescribed_elective", []) if isinstance(electives, dict) else [],
        electives.get("elective", []) if isinstance(electives, dict) else [],
        categories.get("wil_group", []),
    )
    units_by_semester = {}
    for group_index, group in enumerate(groups):
        for unit_index, unit in enumerate(group if isinstance(group, list) else []):
            if not isinstance(unit, dict):
                continue
            year = coerce_int(unit.get("year_level"))
            semester = coerce_int(unit.get("semester"))
            raw_code = str(unit.get("unit_code") or unit.get("code") or "").strip().upper()
            code = re.sub(r"[^A-Z0-9]", "", raw_code)
            if year is None or semester not in (1, 2):
                continue
            if raw_code in {"-", "ELECTIVE"} and str(unit.get("unit_name") or "").strip():
                identity = f"slot:{group_index}:{unit_index}"
            elif code:
                identity = f"code:{code}"
            else:
                continue
            units_by_semester.setdefault((year, semester), set()).add(identity)
    return units_by_semester


# Count placed units by requirement category, excluding unplaced elective options.
def _scheduled_requirement_counts(data):
    counts = {"core": set(), "major": set(), "elective": set(), "wil": set()}
    for category, unit in _iter_validation_units(data):
        year = coerce_int(unit.get("year_level"))
        semester = coerce_int(unit.get("semester"))
        if year is None or year < 1 or semester is None or semester < 1:
            continue
        requirement_category = "elective" if category in {"elective", "prescribed_elective"} else category
        if requirement_category not in counts:
            continue
        raw_code = str(unit.get("unit_code") or unit.get("code") or "").strip().upper()
        code = re.sub(r"[^A-Z0-9]", "", raw_code)
        if requirement_category == "elective" and raw_code in {"-", "ELECTIVE"} and str(unit.get("unit_name") or "").strip():
            identity = f"slot:{category}:{len(counts[requirement_category])}"
        elif code:
            identity = f"code:{code}"
        else:
            continue
        counts[requirement_category].add(identity)
    return {category: len(units) for category, units in counts.items()}


# Use explicit duration or the last scheduled year, not unplaced elective options.
def _validation_duration_semesters(data):
    course_info = data.get("course_information", {}) if isinstance(data, dict) else {}
    explicit_duration = coerce_int(course_info.get("duration_semesters")) if isinstance(course_info, dict) else None
    if explicit_duration and explicit_duration > 0:
        return explicit_duration
    years = [
        year for _, unit in _iter_validation_units(data)
        if (year := coerce_int(unit.get("year_level"))) is not None
        and year > 0 and coerce_int(unit.get("semester")) in (1, 2)
    ]
    return max(years) * 2 if years else 0


# Build a report finding using the shape already used by extraction-quality validation.
def _validation_finding(code, issue_type, category, severity, reason, message, **context):
    return {
        "code": code,
        "type": issue_type,
        "category": category,
        "severity": severity,
        "reason": reason,
        "message": message,
        **{key: value for key, value in context.items() if value is not None},
    }


# Report structural gaps only when the planner evidence supports them.
def collect_validation_findings(data, robustness_report=None):
    findings = []
    course_info = data.get("course_information", {}) if isinstance(data, dict) else {}
    course_info = course_info if isinstance(course_info, dict) else {}
    categories = data.get("categories", {}) if isinstance(data, dict) else {}
    categories = categories if isinstance(categories, dict) else {}

    for key, label in (("course", "course"), ("intake", "intake"), ("intake_year", "intake year")):
        value = course_info.get(key)
        if value is None or not str(value).strip():
            findings.append(_validation_finding(
                "V01", "missing_metadata", "structural", "high",
                f"course_information.{key} is required for a planner template",
                f"{label.capitalize()} information is missing.", field=key,
            ))

    major_units = categories.get("major_units", [])
    has_major_units = isinstance(major_units, list) and any(
        isinstance(unit, dict) and (unit.get("unit_code") or unit.get("unit_name"))
        for unit in major_units
    )
    requirements = course_info.get("requirements", {})
    requirements = requirements if isinstance(requirements, dict) else {}
    major_requirement = requirements.get("major", {})
    major_requirement = major_requirement if isinstance(major_requirement, dict) else {}
    major_count = coerce_int(major_requirement.get("count"))
    major_cp = coerce_requirement_cp(major_requirement.get("cp"))
    major_expected = bool(str(course_info.get("major") or "").strip()) or has_major_units or bool(
        (major_count is not None and major_count > 0) or (major_cp is not None and major_cp > 0)
    )

    if major_expected and not str(course_info.get("major") or "").strip():
        findings.append(_validation_finding(
            "V02", "missing_major_metadata", "structural", "medium",
            "planner evidence indicates that a major is expected",
            "Major information is missing even though the planner indicates a major.",
            field="major",
        ))
    if major_expected and not has_major_units:
        findings.append(_validation_finding(
            "V03", "missing_major_units", "structural", "medium",
            "planner evidence indicates that major units should be present",
            "Major units are missing even though the planner indicates a major.",
            field="major_units",
        ))

    if not isinstance(categories.get("elective_groups"), dict):
        findings.append(_validation_finding(
            "V04", "invalid_elective_groups", "structural", "medium",
            "elective_groups must contain planner elective data",
            "Elective group information is missing.", field="elective_groups",
        ))

    actual_counts = _scheduled_requirement_counts(data)
    requirement_deficits = []
    for key, category in (("core", "core"), ("major", "major"), ("elective", "elective"), ("wil", "wil")):
        requirement = requirements.get(key)
        requirement = requirement if isinstance(requirement, dict) else {}
        expected = coerce_int(requirement.get("count"))
        if expected is None or expected <= 0 or expected <= actual_counts[category]:
            continue
        requirement_deficits.append(category)
        findings.append(_validation_finding(
            "V05", "requirement_count_deficit", "structural", "medium",
            f"the {category} requirement count exceeds the extracted scheduled units",
            f"{category.capitalize()} requirement expects {expected} units, but only {actual_counts[category]} scheduled units were extracted.",
            section=category, expected=expected, actual=actual_counts[category], deficit=expected - actual_counts[category],
        ))

    scheduled_units = _scheduled_main_semester_units(data)
    duration_semesters = _validation_duration_semesters(data)
    diagnostics = (robustness_report or {}).get("final_validation", {})
    diagnostic_issues = diagnostics.get("issues", []) if isinstance(diagnostics, dict) else []
    has_placement_diagnostics = any(
        issue.get("type") in {"missing_year", "missing_semester", "invalid_year", "invalid_semester"}
        for issue in diagnostic_issues if isinstance(issue, dict)
    )
    for semester_index in range(1, duration_semesters + 1):
        year = (semester_index - 1) // 2 + 1
        semester = (semester_index - 1) % 2 + 1
        unit_count = len(scheduled_units.get((year, semester), set()))
        if unit_count == 0:
            findings.append(_validation_finding(
                "V06", "empty_expected_semester", "structural", "medium",
                "no scheduled placements were detected in an expected main semester",
                f"Year {year} Semester {semester} has no scheduled units; this may indicate missing planner information.",
                year=year, semester=semester,
            ))
        elif unit_count < 4 and (requirement_deficits or has_placement_diagnostics):
            findings.append(_validation_finding(
                "V07", "sparse_semester_with_evidence", "structural", "medium",
                "a sparse semester coincides with requirement or placement evidence of incomplete extraction",
                f"Year {year} Semester {semester} has only {unit_count} scheduled units alongside other evidence of incomplete extraction.",
                year=year, semester=semester, actual=unit_count,
            ))

    for category, unit in _iter_validation_units(data):
        name = re.sub(r"\s+", " ", str(unit.get("unit_name") or "")).strip()
        code = str(unit.get("unit_code") or "").strip().upper()
        if not name:
            continue
        if _has_unbalanced_brackets(name):
            findings.append(_validation_finding(
                "T01", "unbalanced_unit_title_brackets", "text_quality", "low",
                "unit title contains unmatched round or square brackets",
                f"{code + ': ' if code else ''}unit title contains unmatched brackets.",
                section=category, unit_code=code or None,
            ))
        title_number = re.search(r"(\d{2,})\s*$", name)
        prerequisite = re.sub(r"\s+", " ", str(unit.get("prerequisite") or "")).strip()
        requisite_cp = re.match(r"^(\d{2,})\s*(?:credit\s*points?|cp\b)", prerequisite, re.IGNORECASE)
        if title_number and requisite_cp and title_number.group(1) == requisite_cp.group(1):
            findings.append(_validation_finding(
                "T02", "possible_credit_point_text_in_title", "text_quality", "low",
                "the title ending matches a credit-point prerequisite value",
                f"{code + ': ' if code else ''}unit title may include credit-point prerequisite text.",
                section=category, unit_code=code or None,
            ))
        if NAME_NOISE_RE.search(name):
            findings.append(_validation_finding(
                "T03", "possible_planner_text_in_title", "text_quality", "low",
                "the existing generic unit-title noise rule matched unrelated planner text",
                f"{code + ': ' if code else ''}unit title may contain unrelated planner text.",
                section=category, unit_code=code or None,
            ))

    unique = []
    seen = set()
    for finding in findings:
        identity = (
            finding["code"], finding.get("unit_code"), finding.get("year"),
            finding.get("semester"), finding["message"],
        )
        if identity not in seen:
            seen.add(identity)
            unique.append(finding)
    return unique


# Keep the old string list as a structural-only compatibility view.
def collect_validation_issues(data, robustness_report=None):
    return [
        finding["message"]
        for finding in collect_validation_findings(data, robustness_report)
        if finding["category"] == "structural"
    ]


# Detect unbalanced round and square brackets without changing the extracted title.
def _has_unbalanced_brackets(text):
    pairs = {"(": ")", "[": "]"}
    closing = {value: key for key, value in pairs.items()}
    stack = []
    for character in text:
        if character in pairs:
            stack.append(character)
        elif character in closing:
            if not stack or stack.pop() != closing[character]:
                return True
    return bool(stack)

# Normalize a user-facing issue string.
def _normalise_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

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

# Format validation issues for app-facing output.
def format_validation_issues_for_user(issues):
    formatted = []
    for issue in issues or []:
        readable = format_validation_issue_for_user(issue)
        if readable and readable not in formatted:
            formatted.append(readable)
    return formatted

# Determines processing outcome from structural findings and text warnings.
def determine_processing_outcome(categories, findings):
    findings = findings or []
    if findings and isinstance(findings[0], str):
        findings = [{"category": "structural", "message": message} for message in findings]
    structural = [finding for finding in findings if finding.get("category") == "structural"]
    if structural:
        return {
            "status": "manual_review_required",
            "reason": "; ".join(finding["message"] for finding in structural),
        }
    if findings:
        return {
            "status": "review_recommended",
            "reason": "; ".join(finding["message"] for finding in findings),
        }
    return {
        "status": "deterministic_ok",
    }

# ============================================================
# STEP 3: Run extraction, refinement, and report creation
# ============================================================
# Extract one planner and build its application report.
def process_planner_pdf(pdf_path):
    if not os.path.exists(pdf_path):
        raise FileNotFoundError("file not found: " + pdf_path)

    base_name = os.path.splitext(os.path.basename(pdf_path))[0]

    # Deterministic extraction is the sole planner-import path.
    raw_text = extract_text_from_pdf(pdf_path)
    cleaned_text = clean_text(raw_text)
    metadata = extract_metadata(cleaned_text)
    requirements = extract_requirements(cleaned_text)
    units = extract_units(pdf_path)
    elective_sections = extract_elective_sections(pdf_path)
    structured = assemble_json(base_name, metadata, requirements, units, elective_sections)

    # Apply the validated deterministic robustness stages before final normalisation.
    structured, robustness_report = apply_extraction_pipeline(structured, pdf_path)

    structured = normalise_planner_output(structured, base_name)
    structured = validate_and_normalise(structured, silent=True)
    findings = collect_validation_findings(structured, robustness_report)
    validation_issues = [
        finding["message"] for finding in findings if finding["category"] == "structural"
    ]
    db_payload = build_planner_template_db_payload(structured)
    outcome = determine_processing_outcome(
        structured.get("categories", {}),
        findings=findings,
    )

    report = {
        "file_name": base_name,
        "pdf_path": pdf_path,
        "validation_issues": validation_issues,
        "findings": findings,
        "outcome": outcome,
        "unit_counts": unit_count_snapshot(structured),
        "db_payload": db_payload,
        "robustness": robustness_report,
    }
    return structured, report


# ============================================================
# STEP 4: Write the subprocess result
# ============================================================
# Ensure subprocess JSON and diagnostics use the same encoding as Node's pipe decoder.
def _configure_utf8_stdio():
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    _configure_utf8_stdio()
    parser = argparse.ArgumentParser(description="Extract a planner PDF into structured JSON.")
    parser.add_argument("pdf", help="Path to planner PDF")
    parser.add_argument("--planner-only", action="store_true", help="Print only the structured planner JSON")
    args = parser.parse_args()

    try:
        # Keep subprocess stdout machine-readable even when a fallback library logs diagnostics.
        with redirect_stdout(sys.stderr):
            structured, report = process_planner_pdf(args.pdf)
        payload = structured if args.planner_only else {"planner": structured, "report": report}
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
