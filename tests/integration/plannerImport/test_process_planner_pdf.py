import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PLANNER_IMPORT_DIR = (
    Path(__file__).resolve().parents[3]
    / "core"
    / "services"
    / "plannerImport"
)
sys.path.insert(0, str(PLANNER_IMPORT_DIR))

from plannerStructureService import process_planner_pdf


class ProcessPlannerPdfIntegrationTests(unittest.TestCase):
    # Verifies extraction stages produce normalized planner data and a report.
    def test_process_planner_pdf_runs_extraction_and_builds_output_and_report(self):
        raw_text = "raw planner text"
        cleaned_text = "cleaned planner text"
        metadata = {
            "course": "Bachelor of Computer Science",
            "major": "Artificial Intelligence",
            "intake": "March",
            "intake_year": "2024",
        }
        requirements = {
            "core": {"count": 8, "cp": 100},
            "major": {"count": 8, "cp": 100},
            "elective": {"count": 8, "cp": 100},
            "wil": {"count": 0, "cp": 0},
        }
        units = ["extracted unit rows"]
        elective_sections = {"extracted elective sections": True}
        assembled = {
            "course_information": {
                "course": "Bachelor of Computer Science",
                "major": "Artificial Intelligence",
                "intake": "March",
                "intakeYear": "2024",
                "requirements": requirements,
            },
            "categories": {
                "core_units": [
                    {
                        "unit_code": "cos10009",
                        "unit_name": "Introduction to Programming",
                        "year_level": 1,
                        "semester": 1,
                    },
                    {
                        "unit_code": "TNE10006",
                        "unit_name": "Developing Technical Skills",
                        "year_level": 1,
                        "semester": 1,
                    },
                ],
                "major_units": [
                    {
                        "unit_code": "COS30018",
                        "unit_name": "Intelligent Systems",
                        "year_level": 3,
                        "semester": 1,
                    }
                ],
                "elective_groups": {
                    "prescribed_elective": [
                        {
                            "unit_code": "COS30045",
                            "unit_name": "Data Analytics",
                            "year_level": 3,
                            "semester": 2,
                        }
                    ],
                    "elective": [],
                },
            },
        }
        robustness = {"stages": [], "status": "ok"}

        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "sample_planner.pdf"
            pdf_path.write_bytes(b"%PDF-1.4\n")
            pdf_path_string = str(pdf_path)

            with (
                patch(
                    "plannerStructureService.extract_text_from_pdf",
                    return_value=raw_text,
                ) as extract_text,
                patch(
                    "plannerStructureService.clean_text",
                    return_value=cleaned_text,
                ) as clean,
                patch(
                    "plannerStructureService.extract_metadata",
                    return_value=metadata,
                ) as extract_metadata,
                patch(
                    "plannerStructureService.extract_requirements",
                    return_value=requirements,
                ) as extract_requirements,
                patch(
                    "plannerStructureService.extract_units",
                    return_value=units,
                ) as extract_units,
                patch(
                    "plannerStructureService.extract_elective_sections",
                    return_value=elective_sections,
                ) as extract_elective_sections,
                patch(
                    "plannerStructureService.assemble_json",
                    return_value=assembled,
                ) as assemble_json,
                patch(
                    "plannerStructureService.apply_extraction_pipeline",
                    return_value=(assembled, robustness),
                ) as apply_pipeline,
            ):
                structured, report = process_planner_pdf(pdf_path_string)

        extract_text.assert_called_once_with(pdf_path_string)
        clean.assert_called_once_with(raw_text)
        extract_metadata.assert_called_once_with(cleaned_text)
        extract_requirements.assert_called_once_with(cleaned_text)
        extract_units.assert_called_once_with(pdf_path_string)
        extract_elective_sections.assert_called_once_with(pdf_path_string)
        assemble_json.assert_called_once_with(
            "sample_planner",
            metadata,
            requirements,
            units,
            elective_sections,
        )
        apply_pipeline.assert_called_once_with(assembled, pdf_path_string)

        self.assertEqual(structured["file_name"], "sample_planner")
        self.assertEqual(structured["course_information"]["course"], metadata["course"])
        self.assertEqual(structured["course_information"]["major"], metadata["major"])
        self.assertEqual(structured["course_information"]["intake_year"], 2024)
        self.assertNotIn("intakeYear", structured["course_information"])

        categories = structured["categories"]
        self.assertEqual(categories["core_units"][0]["unit_code"], "COS10009")
        self.assertEqual(categories["core_units"][0]["category"], "core")
        self.assertEqual(categories["major_units"][0]["category"], "major_core")
        self.assertEqual(
            categories["elective_groups"]["prescribed_elective"][0]["category"],
            "prescribed_elective",
        )

        self.assertEqual(report["file_name"], "sample_planner")
        self.assertEqual(report["pdf_path"], pdf_path_string)
        self.assertEqual(report["validation_issues"], [])
        self.assertEqual(report["outcome"]["status"], "deterministic_ok")
        self.assertEqual(
            report["unit_counts"],
            {
                "core_units": 2,
                "major_units": 1,
                "mpu_group": 0,
                "prescribed_elective": 1,
                "elective": 0,
                "minor_groups": 0,
                "wil_group": 0,
            },
        )
        self.assertEqual(
            report["db_payload"]["planner_template"],
            {
                "course": "Bachelor of Computer Science",
                "major": "Artificial Intelligence",
                "intake": "March",
                "intake_year": 2024,
                "course_type": "bachelor",
                "duration_semesters": 6,
                "core_count": 8,
                "core_cp": 100,
                "major_count": 8,
                "major_cp": 100,
                "elective_count": 8,
                "elective_cp": 100,
                "wil_count": 0,
                "wil_cp": 0,
            },
        )
        self.assertEqual(report["db_payload"]["unit_requisite_groups"], [])
        self.assertEqual(report["robustness"], robustness)

    # Verifies a missing PDF fails before any extraction stage runs.
    def test_process_planner_pdf_missing_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_path = str(Path(temp_dir) / "does_not_exist.pdf")

            with (
                patch("plannerStructureService.extract_text_from_pdf") as extract_text,
                patch("plannerStructureService.clean_text") as clean,
                patch("plannerStructureService.extract_metadata") as extract_metadata,
                patch("plannerStructureService.extract_requirements") as extract_requirements,
                patch("plannerStructureService.extract_units") as extract_units,
                patch(
                    "plannerStructureService.extract_elective_sections"
                ) as extract_elective_sections,
                patch("plannerStructureService.assemble_json") as assemble_json,
                patch(
                    "plannerStructureService.apply_extraction_pipeline"
                ) as apply_pipeline,
            ):
                with self.assertRaises(FileNotFoundError):
                    process_planner_pdf(missing_path)

            for extraction_mock in (
                extract_text,
                clean,
                extract_metadata,
                extract_requirements,
                extract_units,
                extract_elective_sections,
                assemble_json,
                apply_pipeline,
            ):
                extraction_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
