import json
import subprocess
import sys
import unittest
from pathlib import Path


TEST_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TEST_DIR.parents[2]
FIXTURE_DIR = TEST_DIR / "fixtures"
SCRIPT_PATH = (
    PROJECT_ROOT
    / "core"
    / "services"
    / "plannerImport"
    / "plannerStructureService.py"
)
PDF_PATH = FIXTURE_DIR / "planner1.pdf"
EXPECTED_PATH = FIXTURE_DIR / "planner1.expected.json"


class PlannerStructureCliIntegrationTests(unittest.TestCase):
    # Verifies the CLI emits a UTF-8 JSON result with stable planner details.
    def test_cli_success_emits_utf8_json_on_stdout(self):
        self.assertTrue(SCRIPT_PATH.is_file(), f"Missing CLI script: {SCRIPT_PATH}")
        self.assertTrue(PDF_PATH.is_file(), f"Missing planner PDF fixture: {PDF_PATH}")
        expected = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), str(PDF_PATH)],
            capture_output=True,
            check=False,
            timeout=180,
        )

        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
        stdout = result.stdout.decode("utf-8")
        result.stderr.decode("utf-8")
        payload = json.loads(stdout)

        self.assertTrue({"planner", "report"}.issubset(payload))
        planner = payload["planner"]
        report = payload["report"]
        self.assertEqual(
            planner["course_information"]["course"],
            expected["course_information"]["course"],
        )
        self.assertEqual(
            planner["course_information"]["intake_year"],
            expected["course_information"]["intake_year"],
        )
        self.assertIn(
            "COS10009",
            [unit["unit_code"] for unit in planner["categories"]["core_units"]],
        )
        self.assertTrue({"validation_issues", "unit_counts", "db_payload", "robustness"}.issubset(report))

    # Verifies --planner-only emits the planner without the report wrapper.
    def test_cli_planner_only_emits_structured_planner_json(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), str(PDF_PATH), "--planner-only"],
            capture_output=True,
            check=False,
            timeout=180,
        )

        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
        payload = json.loads(result.stdout.decode("utf-8"))
        result.stderr.decode("utf-8")

        self.assertIn("course_information", payload)
        self.assertIn("categories", payload)
        self.assertNotIn("report", payload)

    # Verifies a missing PDF returns a UTF-8 JSON error on stderr and a failure code.
    def test_cli_missing_pdf_returns_utf8_error_json_on_stderr(self):
        missing_pdf = TEST_DIR / "__missing_cli_fixture__.pdf"
        self.assertFalse(missing_pdf.exists(), f"Unexpected fixture at {missing_pdf}")

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), str(missing_pdf)],
            capture_output=True,
            check=False,
            timeout=30,
        )

        self.assertNotEqual(result.returncode, 0)
        stdout = result.stdout.decode("utf-8")
        stderr = result.stderr.decode("utf-8")
        self.assertEqual(stdout.strip(), "")
        error_payload = json.loads(stderr)
        self.assertIsInstance(error_payload.get("error"), str)
        self.assertTrue(error_payload["error"].strip())


if __name__ == "__main__":
    unittest.main()
