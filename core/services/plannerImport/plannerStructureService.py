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

# Report missing runtime fields without using gold data.
def collect_validation_issues(data):
    issues = []
    ci = data.get("course_information", {})
    for key in ("course", "major", "intake", "intake_year"):
        if not ci.get(key): issues.append(f"Missing course_information.{key}")
    categories = data.get("categories", {})
    if not categories.get("core_units"): issues.append("core_units is empty")
    if not categories.get("major_units"): issues.append("major_units is empty")
    if not isinstance(categories.get("elective_groups"), dict): issues.append("elective_groups is missing or invalid")
    return issues

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

# Determines processing outcome for the import report.
# This returns an import outcome from deterministic validation issues.
def determine_processing_outcome(categories, validation_issues):
    if validation_issues:
        return {
            "status": "manual_review_required",
            "reason": "; ".join(validation_issues),
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
    validation_issues = collect_validation_issues(structured)
    db_payload = build_planner_template_db_payload(structured)
    # Keep raw issues for scoring, but expose readable messages to the UI.
    report_validation_issues = format_validation_issues_for_user(validation_issues)
    outcome = determine_processing_outcome(
        structured.get("categories", {}),
        validation_issues=report_validation_issues,
    )

    report = {
        "file_name": base_name,
        "pdf_path": pdf_path,
        "validation_issues": report_validation_issues,
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