import sys
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

from plannerLayoutRefiner import CODE_RE as LAYOUT_CODE_RE, _normalise_code  # noqa: E402
from plannerPdfEvidence import CODE_RE as EVIDENCE_CODE_RE  # noqa: E402
from plannerPdfExtractor import extract_units_with_structure  # noqa: E402
from plannerPdfTextFallback import CODE_ROW_RE  # noqa: E402
from plannerPdfTextRules import (  # noqa: E402
    _clean_candidate_prereq,
    _repair_code_style_prereq_from_row,
    _recover_split_title_before_cp,
    _strip_unit_markers,
)
from plannerStructureAssembler import CODE_TOKEN_RE  # noqa: E402


class _FakeRow:
    bbox = (0, 100, 500, 120)
    cells = [(0, 100, 100, 120), (100, 100, 300, 120), (300, 100, 500, 120)]


class _FakeTable:
    bbox = (0, 80, 500, 160)
    rows = [_FakeRow()]


class _FakePage:
    width = 600

    def __init__(self, code):
        self.code_word = {
            "text": code,
            "x0": 10,
            "x1": 90,
            "top": 102,
            "bottom": 112,
        }

    def extract_words(self, **_kwargs):
        return [self.code_word]

    def find_tables(self):
        return [_FakeTable()]


class _FakePdf:
    def __init__(self, page):
        self.pages = [page]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class UnitCodeMarkerTests(unittest.TestCase):
    # Verifies supported suffix markers normalize to the bare unit code everywhere.
    def test_shared_and_fallback_patterns_accept_and_strip_terminal_markers(self):
        cases = (
            ("CEE30004@", "CEE30004"),
            ("PEH20002&", "PEH20002"),
            ("MME30002@", "MME30002"),
            ("MTH20010*", "MTH20010"),
            ("EAT20008#", "EAT20008"),
            ("COS20007\u2020", "COS20007"),
        )

        for marked, normalized in cases:
            with self.subTest(marked=marked):
                self.assertIsNotNone(EVIDENCE_CODE_RE.fullmatch(marked))
                self.assertIsNotNone(CODE_TOKEN_RE.fullmatch(marked))
                self.assertIsNotNone(LAYOUT_CODE_RE.fullmatch(marked))
                self.assertEqual(_normalise_code(marked), normalized)
                self.assertEqual(_strip_unit_markers(marked), normalized)

    # Verifies PDFText row parsing accepts an attached terminal marker.
    def test_pdftext_row_pattern_accepts_marked_code(self):
        match = CODE_ROW_RE.match("CEE30004@ Process Heat Transfer CEE20002")

        self.assertIsNotNone(match)
        self.assertEqual(_strip_unit_markers(match.group("code")), "CEE30004")

    # Verifies split-title recovery accepts the shared terminal marker set.
    def test_split_title_recovery_accepts_marked_code(self):
        recovered = _recover_split_title_before_cp(
            "COS30000@ Engineering and COS10001 Systems 100 credit points",
            "COS30000",
            "Engineering and",
            "COS10001 & 100 credit points",
        )

        self.assertEqual(recovered, "Engineering and Systems")

    # Verifies prerequisite ampersands are preserved rather than treated as code markers.
    def test_prerequisite_ampersand_is_preserved(self):
        prerequisite = "CEE20002 & CEE20003"

        self.assertEqual(_strip_unit_markers(prerequisite), prerequisite)
        self.assertEqual(_clean_candidate_prereq(prerequisite), prerequisite)
        self.assertIsNone(EVIDENCE_CODE_RE.fullmatch("CEE20002&CEE20003"))
        self.assertIsNone(CODE_TOKEN_RE.fullmatch(prerequisite))
        self.assertEqual(
            _repair_code_style_prereq_from_row(
                "COS10000",
                None,
                "COS10000 Example CEE20002 & CEE20003",
            ),
            prerequisite,
        )

    # Verifies primary row extraction keeps marked unit codes and their row placement.
    def test_primary_rows_normalize_markers_and_keep_year_semester(self):
        cases = (
            ("CEE30004@", "Process Heat Transfer", "CEE20002", "CEE30004"),
            ("PEH20002&", "Food Science", "CHE10001/CEE20005", "PEH20002"),
        )
        planner_context = {
            "honours_mode": False,
            "diploma_mode": False,
            "business_accounting_mode": False,
            "design_mode": False,
            "engineering_mode": False,
            "requirements": {},
            "elective_target_count": None,
        }

        for raw_code, name, prerequisite, expected_code in cases:
            with self.subTest(raw_code=raw_code):
                page = _FakePage(raw_code)
                cells = [
                    (raw_code, (10, 100, 90, 120)),
                    (name, (100, 100, 300, 120)),
                    (prerequisite, (300, 100, 500, 120)),
                ]
                with (
                    patch("plannerPdfExtractor.extract_text_from_pdf", return_value=""),
                    patch("plannerPdfExtractor._detect_planner_context", return_value=planner_context),
                    patch("plannerPdfExtractor.pdfplumber.open", return_value=_FakePdf(page)),
                    patch("plannerPdfExtractor.detect_colour_legend", return_value={}),
                    patch("plannerPdfExtractor._extract_line_headers", return_value=[]),
                    patch("plannerPdfExtractor._detect_content_right", return_value=600),
                    patch("plannerPdfExtractor._split_merged_row", side_effect=lambda words: [words]),
                    patch("plannerPdfExtractor._words_to_cells", return_value=cells),
                    patch(
                        "plannerPdfExtractor._closest_header_value",
                        side_effect=lambda _headers, kind, *_args, **_kwargs: 3 if kind == "year" else 2,
                    ),
                    patch("plannerPdfExtractor._get_colour_at_y", return_value=None),
                    patch("plannerPdfExtractor._get_row_colour", return_value=None),
                ):
                    units = extract_units_with_structure("marker-test.pdf")

                self.assertEqual(len(units), 1)
                self.assertEqual(units[0]["code"], expected_code)
                self.assertEqual(units[0]["year_level"], 3)
                self.assertEqual(units[0]["semester"], 2)


if __name__ == "__main__":
    unittest.main()
