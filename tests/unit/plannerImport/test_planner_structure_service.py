import sys
import unittest
from pathlib import Path


PLANNER_IMPORT_DIR = (
    Path(__file__).resolve().parents[3]
    / "core"
    / "services"
    / "plannerImport"
)
sys.path.insert(0, str(PLANNER_IMPORT_DIR))

from plannerStructureService import (  # noqa: E402
    build_planner_template_db_payload,
    collect_validation_issues,
    determine_processing_outcome,
    format_validation_issue_for_user,
    format_validation_issues_for_user,
    infer_template_course_type,
    infer_template_duration_semesters,
    normalise_planner_output,
    unit_count_snapshot,
)
from plannerStructureAssembler import assemble_json  # noqa: E402
from plannerExtractionQuality import (  # noqa: E402
    plan_uses,
    select_fallbacks,
    validate_planner,
)


class InferTemplateCourseTypeTests(unittest.TestCase):
    # Verifies that a Bachelor course is classified correctly.
    def test_infer_template_course_type_bachelor(self):
        self.assertEqual(infer_template_course_type("Bachelor of Computer Science"), "bachelor")

    # Verifies that a Diploma course is classified correctly.
    def test_infer_template_course_type_diploma(self):
        self.assertEqual(infer_template_course_type("Diploma of Information Technology"), "diploma")

    # Verifies that Foundation Studies is classified correctly.
    def test_infer_template_course_type_foundation(self):
        self.assertEqual(infer_template_course_type("Foundation Studies"), "foundation")

    # Verifies unknown or blank course names default to bachelor.
    def test_infer_template_course_type_unknown_and_blank_fall_back_to_bachelor(self):
        for value in ("Certificate IV", "", None):
            with self.subTest(value=value):
                self.assertEqual(infer_template_course_type(value), "bachelor")

    # Verifies course type matching ignores case and extra spacing.
    def test_infer_template_course_type_handles_case_and_spacing(self):
        self.assertEqual(
            infer_template_course_type("  bACHELOR   of   Computer Science  "),
            "bachelor",
        )


class InferTemplateDurationTests(unittest.TestCase):
    # Verifies a three-year placement produces a six-semester duration.
    def test_duration_uses_highest_year_level_three(self):
        data = {"categories": {"core_units": [{"year_level": 3}]}}

        self.assertEqual(infer_template_duration_semesters(data), 6)

    # Verifies a fourth-year placement produces an eight-semester duration.
    def test_duration_uses_highest_year_level_four(self):
        data = {"categories": {"major_units": [{"year_level": 4}]}}

        self.assertEqual(infer_template_duration_semesters(data), 8)

    # Verifies duration defaults when no valid placement is available.
    def test_duration_defaults_when_no_usable_placement_exists(self):
        data = {"categories": {"core_units": [{"year_level": "-", "semester": None}]}}

        self.assertEqual(infer_template_duration_semesters(data), 6)

    # Verifies prescribed elective placements contribute to duration.
    def test_duration_considers_prescribed_elective_units(self):
        data = {
            "categories": {
                "elective_groups": {
                    "prescribed_elective": [{"year_level": 4, "semester": 1}]
                }
            }
        }

        self.assertEqual(infer_template_duration_semesters(data), 8)


class NormalisePlannerOutputTests(unittest.TestCase):
    # Verifies the filename is retained and camel-case intake year is normalized.
    def test_normalise_planner_output_sets_file_name_and_converts_intake_year(self):
        data = {"course_information": {"intakeYear": "2025"}}

        result = normalise_planner_output(data, "planner.pdf")

        self.assertEqual(result["file_name"], "planner.pdf")
        self.assertEqual(result["course_information"]["intake_year"], 2025)
        self.assertNotIn("intakeYear", result["course_information"])

    # Verifies an existing snake-case intake year takes precedence.
    def test_normalise_planner_output_prefers_existing_snake_case_intake_year(self):
        data = {"course_information": {"intake_year": "2024", "intakeYear": "2025"}}

        result = normalise_planner_output(data, "planner.pdf")

        self.assertEqual(result["course_information"]["intake_year"], 2024)

    # Verifies unit codes are uppercased and legacy name fields are mapped.
    def test_normalise_planner_output_uppercases_unit_code_and_uses_alias_fields(self):
        data = {
            "categories": {
                "core_units": [
                    {"code": "cos10003", "name": "Computer and Logic Essentials"}
                ]
            }
        }

        result = normalise_planner_output(data, "planner.pdf")
        unit = result["categories"]["core_units"][0]

        self.assertEqual(unit["unit_code"], "COS10003")
        self.assertEqual(unit["unit_name"], "Computer and Logic Essentials")

    # Verifies year and semester values are converted to integers.
    def test_normalise_planner_output_coerces_year_and_semester(self):
        data = {
            "categories": {
                "core_units": [{"code": "cos10003", "year": "2", "semester": "3"}]
            }
        }

        unit = normalise_planner_output(data, "planner.pdf")["categories"]["core_units"][0]

        self.assertEqual(unit["year_level"], 2)
        self.assertEqual(unit["semester"], 3)

    # Verifies each planner group assigns its canonical unit category.
    def test_normalise_planner_output_assigns_category_values(self):
        data = {
            "categories": {
                "core_units": [{"code": "cos10003"}],
                "major_units": [{"code": "cos20007"}],
                "elective_groups": {
                    "prescribed_elective": [{"code": "cos20028"}]
                },
            }
        }

        result = normalise_planner_output(data, "planner.pdf")["categories"]

        self.assertEqual(result["core_units"][0]["category"], "core")
        self.assertEqual(result["major_units"][0]["category"], "major_core")
        self.assertEqual(
            result["elective_groups"]["prescribed_elective"][0]["category"],
            "prescribed_elective",
        )

    # Verifies malformed unit entries are ignored during normalization.
    def test_normalise_planner_output_ignores_malformed_unit_entries(self):
        data = {"categories": {"core_units": [None, "not a unit", {"code": "cos10003"}]}}

        units = normalise_planner_output(data, "planner.pdf")["categories"]["core_units"]

        self.assertEqual(len(units), 1)
        self.assertEqual(units[0]["unit_code"], "COS10003")


class UnitCountSnapshotTests(unittest.TestCase):
    # Verifies counts are reported separately for every planner category.
    def test_unit_count_snapshot_counts_each_category(self):
        data = {
            "categories": {
                "core_units": [{}, {}],
                "major_units": [{}],
                "mpu_group": [{}],
                "elective_groups": {
                    "prescribed_elective": [{}],
                    "elective": [{}, {}],
                },
                "minor_groups": [{}, {}],
                "wil_group": [{}],
            }
        }

        self.assertEqual(
            unit_count_snapshot(data),
            {
                "core_units": 2,
                "major_units": 1,
                "mpu_group": 1,
                "prescribed_elective": 1,
                "elective": 2,
                "minor_groups": 2,
                "wil_group": 1,
            },
        )


class CollectValidationIssuesTests(unittest.TestCase):
    # Verifies complete planner metadata has no tested missing-field issues.
    def test_complete_structure_has_no_tested_missing_field_issues(self):
        data = {
            "course_information": {
                "course": "Bachelor of Computer Science",
                "major": "Software Development",
                "intake": "March",
                "intake_year": 2025,
            },
            "categories": {
                "core_units": [{}],
                "major_units": [{}],
                "elective_groups": {"elective": []},
            },
        }

        self.assertEqual(collect_validation_issues(data), [])

    # Verifies missing major metadata is reported.
    def test_collect_validation_issues_reports_missing_major(self):
        data = {
            "course_information": {
                "course": "Bachelor of Computer Science",
                "intake": "March",
                "intake_year": 2025,
            },
            "categories": {"core_units": [{}], "major_units": [{}], "elective_groups": {}},
        }

        self.assertIn("Missing course_information.major", collect_validation_issues(data))

    # Verifies empty core and major groups are reported.
    def test_collect_validation_issues_reports_empty_core_and_major_units(self):
        data = {
            "course_information": {
                "course": "Course",
                "major": "Major",
                "intake": "March",
                "intake_year": 2025,
            },
            "categories": {"core_units": [], "major_units": [], "elective_groups": {}},
        }

        issues = collect_validation_issues(data)

        self.assertIn("core_units is empty", issues)
        self.assertIn("major_units is empty", issues)

    # Verifies missing or malformed elective groups are reported.
    def test_collect_validation_issues_reports_missing_or_invalid_elective_groups(self):
        for elective_groups in (None, []):
            with self.subTest(elective_groups=elective_groups):
                data = {
                    "course_information": {
                        "course": "Course",
                        "major": "Major",
                        "intake": "March",
                        "intake_year": 2025,
                    },
                    "categories": {
                        "core_units": [{}],
                        "major_units": [{}],
                        "elective_groups": elective_groups,
                    },
                }

                self.assertIn(
                    "elective_groups is missing or invalid",
                    collect_validation_issues(data),
                )


class FormatValidationIssuesTests(unittest.TestCase):
    # Verifies missing core and major issues receive readable messages.
    def test_format_validation_issue_for_user_maps_missing_core_and_major(self):
        self.assertEqual(
            format_validation_issue_for_user("core_units is empty"),
            "Core unit is missing.",
        )
        self.assertEqual(
            format_validation_issue_for_user("major_units is empty"),
            "Major unit is missing.",
        )

    # Verifies missing-major metadata is formatted for the user.
    def test_format_validation_issue_for_user_formats_missing_major_metadata(self):
        self.assertEqual(
            format_validation_issue_for_user("Missing course_information.major"),
            "major is missing.",
        )

    # Verifies duplicate user-facing validation messages are removed.
    def test_format_validation_issues_for_user_deduplicates_messages(self):
        self.assertEqual(
            format_validation_issues_for_user(
                ["core_units is empty", "core_units is empty", "major_units is empty"]
            ),
            ["Core unit is missing.", "Major unit is missing."],
        )


class DetermineProcessingOutcomeTests(unittest.TestCase):
    # Verifies a planner without validation issues is marked deterministic.
    def test_determine_processing_outcome_is_deterministic_without_issues(self):
        self.assertEqual(
            determine_processing_outcome({}, []),
            {"status": "deterministic_ok"},
        )

    # Verifies validation issues require review and appear in the reason.
    def test_determine_processing_outcome_requires_review_and_includes_reason(self):
        issue = "Missing course_information.major"

        result = determine_processing_outcome({}, [issue])

        self.assertEqual(result["status"], "manual_review_required")
        self.assertIn(issue, result["reason"])


class BuildPlannerTemplatePayloadTests(unittest.TestCase):
    # Verifies planner metadata and requirement totals map into the DB payload.
    def test_build_planner_template_db_payload_maps_metadata_and_requirements(self):
        data = {
            "course_information": {
                "course": "Bachelor of Computer Science",
                "major": "Software Development",
                "intake": "March",
                "intake_year": "2025",
                "requirements": {
                    "core": {"count": "8", "cp": 100},
                    "major": {"count": "7", "cp": 87.5},
                    "elective": {"count": "2", "cp": 25},
                    "wil": {"count": "1", "cp": 12.5},
                },
            },
            "categories": {"core_units": [{"year_level": 3}]},
        }

        result = build_planner_template_db_payload(data)

        self.assertEqual(
            result["planner_template"],
            {
                "course": "Bachelor of Computer Science",
                "major": "Software Development",
                "intake": "March",
                "intake_year": 2025,
                "course_type": "bachelor",
                "duration_semesters": 6,
                "core_count": 8,
                "core_cp": 100,
                "major_count": 7,
                "major_cp": 87.5,
                "elective_count": 2,
                "elective_cp": 25,
                "wil_count": 1,
                "wil_cp": 12.5,
            },
        )
        self.assertEqual(result["unit_requisite_groups"], [])


class AssembleJsonTests(unittest.TestCase):
    # Verifies a scheduled elective remains in both its placement and minor.
    def test_scheduled_elective_remains_in_minor_group(self):
        unit = {
            "code": "DDD20022",
            "name": "3D Modelling for Objects and Environments",
            "category": "elective",
            "year_level": 1,
            "semester": 2,
            "prerequisite": None,
            "offered_in": None,
        }

        result = assemble_json(
            "synthetic_planner",
            {},
            {},
            [unit],
            {
                "Advanced Minor in 3D Modelling and Animation": [
                    {"code": "DDD20022", "name": unit["name"]}
                ]
            },
        )

        elective_codes = [
            item["unit_code"]
            for item in result["categories"]["elective_groups"]["elective"]
        ]
        minor_codes = [
            item["unit_code"]
            for group in result["categories"]["minor_groups"]
            for item in group["units"]
        ]

        self.assertIn("DDD20022", elective_codes)
        self.assertIn("DDD20022", minor_codes)


class FallbackRoutingTests(unittest.TestCase):
    def _planner(self, unit, requirements=None):
        return {
            "course_information": {
                "requirements": requirements or {},
            },
            "categories": {
                "core_units": [unit] if unit else [],
                "major_units": [],
                "mpu_group": [],
                "wil_group": [],
                "elective_groups": {"prescribed_elective": [], "elective": []},
                "minor_groups": [],
            },
        }

    # Verifies a requirement-count deficit selects the PDFText fallback.
    def test_requirement_deficit_routes_to_pdftext(self):
        planner = self._planner(
            None,
            {"core": {"count": 1}},
        )

        validation = validate_planner(planner)
        plan = select_fallbacks(validation)

        self.assertIn("E01", [issue["code"] for issue in validation["issues"]])
        self.assertTrue(plan_uses(plan, "pdftext"))

    # Verifies a missing semester selects the Docling fallback.
    def test_missing_placement_routes_to_docling(self):
        planner = self._planner(
            {
                "unit_code": "COS10003",
                "unit_name": "Computer and Logic Essentials",
                "category": "core",
                "year_level": 1,
                "semester": None,
                "prerequisite": None,
            }
        )

        validation = validate_planner(planner)
        plan = select_fallbacks(validation)

        self.assertIn("E10", [issue["code"] for issue in validation["issues"]])
        self.assertTrue(plan_uses(plan, "docling"))

    # Verifies a review-only issue does not select an extraction fallback.
    def test_review_only_issue_does_not_select_extraction_fallback(self):
        planner = self._planner(
            {
                "unit_code": "COS10003",
                "unit_name": "Computer and Logic Essentials",
                "category": "core",
                "year_level": 1,
                "semester": 1,
                "prerequisite": "COS10009 &",
            }
        )

        validation = validate_planner(planner)
        plan = select_fallbacks(validation)

        self.assertIn("E16", [issue["code"] for issue in validation["issues"]])
        self.assertFalse(plan_uses(plan, "pdftext"))
        self.assertFalse(plan_uses(plan, "docling"))
        self.assertEqual([item["engine"] for item in plan], ["deterministic_review"])


if __name__ == "__main__":
    unittest.main()
