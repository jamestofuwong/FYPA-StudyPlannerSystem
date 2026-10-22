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
    collect_validation_findings,
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
    def _planner_with_main_semesters(self, years=3, overrides=None):
        categories = {
            "core_units": [],
            "major_units": [],
            "mpu_group": [],
            "elective_groups": {"prescribed_elective": [], "elective": []},
            "minor_groups": [],
            "wil_group": [],
        }
        placement_groups = [
            categories["core_units"],
            categories["major_units"],
            categories["mpu_group"],
            categories["elective_groups"]["prescribed_elective"],
            categories["elective_groups"]["elective"],
            categories["wil_group"],
        ]
        overrides = overrides or {}
        for year in range(1, years + 1):
            for semester in (1, 2):
                codes = overrides.get(
                    (year, semester),
                    [f"U{year}{semester}{index}" for index in range(4)],
                )
                for index, code in enumerate(codes):
                    placement_groups[index % len(placement_groups)].append(
                        {"year_level": year, "semester": semester, "unit_code": code}
                    )
        return {
            "course_information": {
                "course": "Course",
                "major": "Major",
                "intake": "March",
                "intake_year": 2025,
            },
            "categories": categories,
        }

    # Verifies complete planner metadata has no tested missing-field issues.
    def test_complete_structure_has_no_tested_missing_field_issues(self):
        data = self._planner_with_main_semesters()

        self.assertEqual(collect_validation_issues(data), [])

    # Verifies an empty expected semester is reported and requires manual review.
    def test_empty_main_semester_generates_issue_and_requires_review(self):
        data = self._planner_with_main_semesters(overrides={(2, 1): []})

        issues = collect_validation_issues(data)

        self.assertTrue(any("Year 2 Semester 1 has no scheduled units" in issue for issue in issues))
        self.assertEqual(
            determine_processing_outcome(data["categories"], issues)["status"],
            "manual_review_required",
        )

    # Verifies one scheduled unit alone is not treated as proof of missing data.
    def test_one_main_semester_unit_alone_is_not_structural(self):
        data = self._planner_with_main_semesters(overrides={(2, 1): ["COS20001"]})

        self.assertEqual(collect_validation_issues(data), [])

    # Verifies three scheduled units alone are not treated as proof of missing data.
    def test_three_main_semester_units_alone_are_not_structural(self):
        data = self._planner_with_main_semesters(
            overrides={(2, 1): ["COS20001", "COS20002", "COS20003"]}
        )

        self.assertEqual(collect_validation_issues(data), [])

    # Verifies four scheduled units meet the main-semester review threshold.
    def test_four_main_semester_units_are_not_flagged_by_count(self):
        data = self._planner_with_main_semesters(
            overrides={(2, 1): ["COS20001", "COS20002", "COS20003"]}
        )
        data["categories"]["wil_group"].append(
            {"unit_code": "WIL20001", "year_level": 2, "semester": 1}
        )

        self.assertFalse(
            any(issue.startswith("Year 2 Semester 1 ") for issue in collect_validation_issues(data))
        )

    # Verifies a four-year structure checks all eight expected main semesters.
    def test_four_year_planner_checks_sparse_final_semester(self):
        data = self._planner_with_main_semesters(years=4, overrides={(4, 2): []})

        self.assertTrue(any(
            "Year 4 Semester 2 has no scheduled units" in issue
            for issue in collect_validation_issues(data)
        ))

    # Verifies an empty Winter Term is not treated as an incomplete main semester.
    def test_empty_winter_term_is_not_flagged(self):
        data = self._planner_with_main_semesters()

        self.assertFalse(any("Winter Term" in issue for issue in collect_validation_issues(data)))

    # Verifies an empty Summer Term is not treated as an incomplete main semester.
    def test_empty_summer_term_is_not_flagged(self):
        data = self._planner_with_main_semesters()

        self.assertFalse(any("Summer Term" in issue for issue in collect_validation_issues(data)))

    # Verifies unplaced elective options and minor memberships do not create low-count evidence.
    def test_elective_pool_and_minor_membership_do_not_count_as_placements(self):
        data = self._planner_with_main_semesters(
            overrides={(2, 1): ["COS20001", "COS20002", "COS20003"]}
        )
        categories = data["categories"]
        categories["elective_groups"]["elective"].append(
            {"unit_code": "ELEC99999", "year_level": None, "semester": None}
        )
        categories["minor_groups"].append(
            {"minor_name": "Example Minor", "units": [{"unit_code": "MINR10001"}]}
        )

        self.assertEqual(collect_validation_issues(data), [])

    # Verifies repeated representations of one normalized code count only once.
    def test_duplicate_scheduled_unit_does_not_inflate_semester_count(self):
        data = self._planner_with_main_semesters(
            overrides={(2, 1): ["COS20001", "COS20002", "COS20003"]}
        )
        data["categories"]["wil_group"].append(
            {"unit_code": " cos-20001 ", "year_level": 2, "semester": 1}
        )

        self.assertEqual(collect_validation_issues(data), [])

    # Verifies a major is not required without evidence that the course uses one.
    def test_collect_validation_issues_does_not_require_major_without_evidence(self):
        data = {
            "course_information": {
                "course": "Bachelor of Computer Science",
                "intake": "March",
                "intake_year": 2025,
            },
            "categories": {"core_units": [{}], "major_units": [{}], "elective_groups": {}},
        }

        self.assertFalse(any(
            finding["type"] in {"missing_major_metadata", "missing_major_units"}
            for finding in collect_validation_findings(data)
        ))

    # Verifies empty groups without declared requirements are not assumed to be missing.
    def test_empty_core_and_major_groups_without_requirements_are_not_flagged(self):
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

        self.assertEqual(
            [finding["type"] for finding in collect_validation_findings(data)],
            ["missing_major_units"],
        )

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
                    "Elective group information is missing.",
                    collect_validation_issues(data),
                )

    # Verifies a major count without a name or major units is a structural gap.
    def test_major_requirement_missing_metadata_is_structural(self):
        data = self._planner_with_main_semesters()
        data["course_information"].pop("major")
        data["course_information"]["requirements"] = {"major": {"count": 8, "cp": 100}}
        data["categories"]["major_units"] = []

        findings = collect_validation_findings(data)

        self.assertTrue(any(finding["type"] == "missing_major_metadata" for finding in findings))
        self.assertTrue(any(finding["type"] == "missing_major_units" for finding in findings))

    # Verifies major-unit records make missing major metadata reportable.
    def test_major_unit_records_without_metadata_are_structural(self):
        data = self._planner_with_main_semesters()
        data["course_information"].pop("major")
        data["categories"]["major_units"] = [
            {"unit_code": "COS20001", "year_level": 1, "semester": 1}
        ]

        self.assertTrue(any(
            finding["type"] == "missing_major_metadata"
            for finding in collect_validation_findings(data)
        ))

    # Verifies a valid major name and major-unit group do not create a major issue.
    def test_valid_major_course_has_no_major_finding(self):
        findings = collect_validation_findings(self._planner_with_main_semesters())

        self.assertFalse(any(
            finding["type"] in {"missing_major_metadata", "missing_major_units"}
            for finding in findings
        ))

    # Verifies a satisfied two-unit WIL semester is accepted for a no-major course.
    def test_two_unit_wil_semester_with_satisfied_requirements_is_valid(self):
        data = self._planner_with_main_semesters()
        categories = data["categories"]
        groups = [
            categories["core_units"], categories["major_units"], categories["mpu_group"],
            categories["elective_groups"]["prescribed_elective"], categories["elective_groups"]["elective"],
            categories["wil_group"],
        ]
        for group in groups:
            group[:] = [unit for unit in group if (unit.get("year_level"), unit.get("semester")) != (3, 1)]
        categories["major_units"] = []
        categories["wil_group"].extend([
            {
                "unit_code": "QSB30009", "unit_name": "Industry Training 200",
                "prerequisite": "200 credit points", "year_level": 3, "semester": 1,
            },
            {"unit_code": "QSB30019", "unit_name": "Integrated Professional Placement", "year_level": 3, "semester": 1},
        ])
        categories["mpu_group"].extend([
            {"unit_code": "MPU3142", "unit_name": "Malay Language Communication 2 [International"},
            {"unit_code": "MPU3212", "unit_name": "Bahasa Kebangsaan A ["},
        ])
        data["course_information"].pop("major")
        data["course_information"]["requirements"] = {
            "core": {"count": 5, "cp": 62.5},
            "major": {"count": 0, "cp": 0},
            "elective": {"count": 5, "cp": 62.5},
            "wil": {"count": 2, "cp": 25},
        }

        findings = collect_validation_findings(data)

        structural = [finding for finding in findings if finding["category"] == "structural"]
        warnings = [finding for finding in findings if finding["category"] == "text_quality"]
        self.assertEqual(structural, [])
        self.assertEqual(collect_validation_issues(data), [])
        self.assertEqual({finding.get("unit_code") for finding in warnings}, {"QSB30009", "MPU3142", "MPU3212"})
        self.assertFalse(any(
            finding.get("year") == 3 and finding.get("semester") == 1
            for finding in findings
        ))
        self.assertEqual(
            determine_processing_outcome(categories, findings)["status"],
            "review_recommended",
        )

    # Verifies empty placements and unmet requirements keep an incomplete planner in review.
    def test_chemical_engineering_like_incomplete_structure_still_requires_review(self):
        data = self._planner_with_main_semesters(overrides={(2, 1): []})
        data["course_information"]["requirements"] = {
            "core": {"count": 8, "cp": 100},
            "major": {"count": 8, "cp": 100},
        }

        findings = collect_validation_findings(data)

        self.assertTrue(any(finding["type"] == "requirement_count_deficit" for finding in findings))
        self.assertTrue(any(finding["type"] == "empty_expected_semester" for finding in findings))
        self.assertEqual(
            determine_processing_outcome(data["categories"], findings)["status"],
            "manual_review_required",
        )

    # Verifies a matching multi-digit credit-point requisite warns without repairing the title.
    def test_credit_point_requisite_leak_warns_but_legitimate_number_does_not(self):
        data = self._planner_with_main_semesters()
        first, second = data["categories"]["core_units"][:2]
        first.update({"unit_name": "Industry Training 200", "prerequisite": "200 credit points"})
        second.update({"unit_name": "Final Year Research Project 1", "prerequisite": "1 unit"})

        warnings = [finding for finding in collect_validation_findings(data) if finding["category"] == "text_quality"]

        self.assertEqual(
            [(finding["code"], finding["unit_code"]) for finding in warnings if finding["code"] == "T02"],
            [("T02", first["unit_code"])],
        )
        self.assertEqual(first["unit_name"], "Industry Training 200")

    # Verifies unmatched brackets warn while balanced title punctuation is accepted.
    def test_unbalanced_title_brackets_warn_and_balanced_title_does_not(self):
        data = self._planner_with_main_semesters()
        units = data["categories"]["core_units"]
        units[0]["unit_name"] = "Malay Language Communication 2 [International"
        units[1]["unit_name"] = "Bahasa Kebangsaan A ("
        units[2]["unit_name"] = "Research Project (Honours) [Part 1]"

        warnings = [finding for finding in collect_validation_findings(data) if finding["code"] == "T01"]

        self.assertEqual(len(warnings), 2)
        self.assertEqual(units[0]["unit_name"], "Malay Language Communication 2 [International")

    # Verifies unplaced elective choices do not satisfy declared scheduled elective requirements.
    def test_unplaced_elective_options_do_not_satisfy_requirement_count(self):
        data = self._planner_with_main_semesters()
        data["course_information"]["requirements"] = {"elective": {"count": 7, "cp": 87.5}}
        data["categories"]["elective_groups"]["elective"].extend(
            {
                "unit_code": f"ELEC{index:05d}", "unit_name": "Elective option",
                "year_level": None, "semester": None,
            }
            for index in range(20)
        )

        deficit = next(
            finding for finding in collect_validation_findings(data)
            if finding["type"] == "requirement_count_deficit" and finding["section"] == "elective"
        )

        self.assertEqual(deficit["actual"], 6)


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

    # Verifies warning-only findings recommend review without requiring manual review.
    def test_determine_processing_outcome_recommends_review_for_warnings_only(self):
        finding = {
            "category": "text_quality",
            "message": "COS10001: unit title contains unmatched brackets.",
        }

        result = determine_processing_outcome({}, [finding])

        self.assertEqual(result["status"], "review_recommended")
        self.assertIn(finding["message"], result["reason"])

    # Verifies structural findings take priority when warnings are also present.
    def test_structural_finding_takes_priority_over_text_warning(self):
        findings = [
            {"category": "text_quality", "message": "title warning"},
            {"category": "structural", "message": "requirement deficit"},
        ]

        result = determine_processing_outcome({}, findings)

        self.assertEqual(result["status"], "manual_review_required")
        self.assertEqual(result["reason"], "requirement deficit")


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
