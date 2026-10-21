import json
import sys
import unittest
from collections import Counter
from pathlib import Path


TEST_DIR = Path(__file__).resolve().parent
FIXTURE_DIR = TEST_DIR / "fixtures"
PDF_PATH = FIXTURE_DIR / "planner1.pdf"
EXPECTED_PATH = FIXTURE_DIR / "planner1.expected.json"
PLANNER_IMPORT_DIR = (
    Path(__file__).resolve().parents[3]
    / "core"
    / "services"
    / "plannerImport"
)
sys.path.insert(0, str(PLANNER_IMPORT_DIR))

from plannerStructureService import process_planner_pdf  # noqa: E402


class RealPlannerPdfIntegrationTests(unittest.TestCase):
    def _index_units(self, units, section):
        self.assertIsInstance(units, list, f"{section} should be a list")
        indexed = {}
        for unit in units:
            code = str(unit.get("unit_code") or "").strip().upper()
            if code and code != "-":
                identity = ("unit_code", code)
            else:
                identity = ("unit_name", str(unit.get("unit_name") or "").strip())
            self.assertNotIn(identity, indexed, f"Duplicate unit identity in {section}: {identity}")
            indexed[identity] = unit
        return indexed

    def _assert_unit_lists_match(self, expected_units, actual_units, section):
        expected_by_id = self._index_units(expected_units, f"expected {section}")
        actual_by_id = self._index_units(actual_units, f"actual {section}")
        self.assertEqual(
            set(actual_by_id),
            set(expected_by_id),
            f"{section} unit identities differ",
        )

        for identity, expected_unit in expected_by_id.items():
            actual_unit = actual_by_id[identity]
            for field, expected_value in expected_unit.items():
                with self.subTest(section=section, unit=identity, field=field):
                    self.assertEqual(actual_unit.get(field), expected_value)

    def _assert_minor_groups_match(self, expected_groups, actual_groups):
        expected_by_name = {group["minor_name"]: group for group in expected_groups}
        actual_by_name = {group["minor_name"]: group for group in actual_groups}
        self.assertEqual(
            set(actual_by_name),
            set(expected_by_name),
            "Minor group names differ",
        )

        for name, expected_group in expected_by_name.items():
            with self.subTest(minor_group=name):
                self._assert_unit_lists_match(
                    expected_group["units"],
                    actual_by_name[name]["units"],
                    f"minor group {name}",
                )

    # Verifies the real Computer Science planner matches its approved golden output.
    def test_process_planner_pdf_matches_validated_expected_result(self):
        self.assertTrue(PDF_PATH.is_file(), f"Missing planner PDF fixture: {PDF_PATH}")
        self.assertTrue(
            EXPECTED_PATH.is_file(),
            f"Missing expected planner JSON fixture: {EXPECTED_PATH}",
        )
        expected = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))

        structured, report = process_planner_pdf(str(PDF_PATH))

        self.assertEqual(structured["file_name"], expected["file_name"])
        self.assertEqual(structured["course_information"]["course"], expected["course_information"]["course"])
        self.assertEqual(structured["course_information"]["major"], expected["course_information"]["major"])
        self.assertEqual(structured["course_information"]["intake"], expected["course_information"]["intake"])
        self.assertEqual(
            structured["course_information"]["intake_year"],
            expected["course_information"]["intake_year"],
        )
        self.assertEqual(
            structured["course_information"]["requirements"],
            expected["course_information"]["requirements"],
        )

        expected_categories = expected["categories"]
        actual_categories = structured["categories"]
        for category in ("core_units", "major_units", "mpu_group", "wil_group"):
            with self.subTest(category=category):
                self._assert_unit_lists_match(
                    expected_categories[category],
                    actual_categories[category],
                    category,
                )

        expected_electives = expected_categories["elective_groups"]
        actual_electives = actual_categories["elective_groups"]
        for group in ("prescribed_elective", "elective"):
            with self.subTest(elective_group=group):
                self._assert_unit_lists_match(
                    expected_electives[group],
                    actual_electives[group],
                    f"elective_groups.{group}",
                )

        self._assert_minor_groups_match(
            expected_categories["minor_groups"],
            actual_categories["minor_groups"],
        )

        scheduled_units = []
        for category in ("core_units", "major_units", "mpu_group", "wil_group"):
            scheduled_units.extend(actual_categories[category])
        scheduled_units.extend(actual_electives["prescribed_elective"])
        scheduled_units.extend(
            unit
            for unit in actual_electives["elective"]
            if unit.get("year_level") is not None and unit.get("semester") is not None
        )
        scheduled_codes = [
            str(unit.get("unit_code") or "").strip().upper()
            for unit in scheduled_units
        ]
        scheduled_codes = [code for code in scheduled_codes if code and code != "-"]
        duplicate_codes = sorted(
            code for code, count in Counter(scheduled_codes).items() if count > 1
        )
        self.assertEqual(duplicate_codes, [], "Scheduled placements contain duplicate unit codes")

        required_report_fields = {
            "file_name",
            "pdf_path",
            "validation_issues",
            "outcome",
            "unit_counts",
            "db_payload",
            "robustness",
        }
        self.assertTrue(required_report_fields.issubset(report))
        self.assertEqual(report["file_name"], expected["file_name"])
        self.assertEqual(Path(report["pdf_path"]).resolve(), PDF_PATH.resolve())
        self.assertIsInstance(report["validation_issues"], list)
        self.assertEqual(report["validation_issues"], [])
        self.assertEqual(report["outcome"]["status"], "deterministic_ok")

        expected_counts = {
            "core_units": len(expected_categories["core_units"]),
            "major_units": len(expected_categories["major_units"]),
            "mpu_group": len(expected_categories["mpu_group"]),
            "prescribed_elective": len(expected_electives["prescribed_elective"]),
            "elective": len(expected_electives["elective"]),
            "minor_groups": len(expected_categories["minor_groups"]),
            "wil_group": len(expected_categories["wil_group"]),
        }
        self.assertEqual(report["unit_counts"], expected_counts)

        planner_payload = report["db_payload"]["planner_template"]
        expected_course_info = expected["course_information"]
        self.assertEqual(planner_payload["course"], expected_course_info["course"])
        self.assertEqual(planner_payload["major"], expected_course_info["major"])
        self.assertEqual(planner_payload["intake"], expected_course_info["intake"])
        self.assertEqual(planner_payload["intake_year"], expected_course_info["intake_year"])
        self.assertEqual(planner_payload["course_type"], "bachelor")
        self.assertEqual(planner_payload["duration_semesters"], 6)
        self.assertEqual(report["db_payload"]["unit_requisite_groups"], [])
        self.assertIsInstance(report["robustness"], dict)


if __name__ == "__main__":
    unittest.main()
