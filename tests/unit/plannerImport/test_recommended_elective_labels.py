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

from plannerLayoutRefiner import _category_from_label  # noqa: E402
from plannerPdfEvidence import detect_colour_legend  # noqa: E402
from plannerPdfExtractor import _process_row_cells  # noqa: E402
from plannerPdfRequirements import extract_requirements  # noqa: E402
from plannerStructureAssembler import assemble_json  # noqa: E402


ELECTIVE_FILL = (0.855, 0.933, 0.953)
CORE_FILL = (0.776, 0.851, 0.945)


class _LegendPage:
    width = 600

    def __init__(self, label):
        self.words = []
        x = 10
        for text in label.split():
            self.words.append({"text": text, "x0": x, "x1": x + 8 * len(text), "top": 10, "bottom": 18})
            x += 8 * len(text) + 4
        self.rects = [{
            "x0": 0,
            "x1": 500,
            "top": 8,
            "bottom": 20,
            "non_stroking_color": ELECTIVE_FILL,
        }]

    def extract_words(self, **_kwargs):
        return self.words


class _Pdf:
    def __init__(self, page):
        self.pages = [page]


class RecommendedElectiveLabelTests(unittest.TestCase):
    # Verifies dynamic legend detection recognizes normal and recommended elective labels.
    def test_primary_legend_recognizes_elective_label_variants(self):
        for label in (
            "Elective Units",
            "4 Elective Units",
            "Recommended Elective Units",
            "4 Recommended Elective Units",
        ):
            with self.subTest(label=label):
                legend = detect_colour_legend(_Pdf(_LegendPage(label)))
                self.assertEqual(legend.get(ELECTIVE_FILL), "elective")

    # Verifies the layout refiner maps both recommended wording variants to elective.
    def test_layout_label_hint_recognizes_recommended_electives(self):
        for label in ("Recommended Elective Units", "4 Recommended Elective Units"):
            with self.subTest(label=label):
                self.assertEqual(_category_from_label(label), "elective")
        self.assertEqual(_category_from_label("Elective Units"), "elective")

    # Verifies the early requirement parser extracts the count and credit points.
    def test_requirement_count_accepts_recommended_elective_wording(self):
        requirements = extract_requirements("4 Recommended Elective Units (50 credit points)")

        self.assertEqual(requirements["elective"], {"count": 4, "cp": 50})

    # Verifies legend-classified electives retain semester placements without duplicate codes.
    def test_recommended_electives_keep_placements_prerequisites_and_core_category(self):
        legend = {
            ELECTIVE_FILL: "elective",
            CORE_FILL: "core",
        }
        rows = [
            ("TST20001", "Surveying", "Nil", ELECTIVE_FILL, 2, 2, None),
            ("TST40001", "Engineering Project", "250 credit points", ELECTIVE_FILL, 4, 1, "250 credit points"),
            ("TST40002", "Project Essentials", "100 credit points", ELECTIVE_FILL, 4, 1, "100 credit points"),
            ("COR20001", "Core Engineering", "COR10001", CORE_FILL, 2, 2, "COR10001"),
        ]
        units = []
        seen = set()

        for index, (code, name, prerequisite, fill, year, semester, expected_prerequisite) in enumerate(rows):
            top = 100 + index * 20
            cells = [
                (code, (0, top, 100, top + 20)),
                (name, (100, top, 300, top + 20)),
                (prerequisite, (300, top, 500, top + 20)),
            ]
            with patch("plannerPdfExtractor._get_colour_at_y", return_value=fill):
                added = _process_row_cells(
                    cells,
                    page=None,
                    row_bbox=(0, top, 500, top + 20),
                    legend=legend,
                    has_offered=False,
                    units=units,
                    seen=seen,
                    current_section=None,
                    sub_mid_y=top + 10,
                    content_right=500,
                )
            self.assertTrue(added)
            units[-1]["year_level"] = year
            units[-1]["semester"] = semester
            self.assertEqual(units[-1]["prerequisite"], expected_prerequisite)

        with patch("plannerPdfExtractor._get_colour_at_y", return_value=ELECTIVE_FILL):
            duplicate_added = _process_row_cells(
                [
                    ("TST20001", (0, 100, 100, 120)),
                    ("Surveying", (100, 100, 300, 120)),
                    ("Nil", (300, 100, 500, 120)),
                ],
                page=None,
                row_bbox=(0, 100, 500, 120),
                legend=legend,
                has_offered=False,
                units=units,
                seen=seen,
                current_section=None,
                sub_mid_y=110,
                content_right=500,
            )

        self.assertFalse(duplicate_added)

        result = assemble_json("synthetic", {}, {}, units, {})
        categories = result["categories"]
        elective_units = categories["elective_groups"]["elective"]
        core_units = categories["core_units"]
        scheduled = elective_units + core_units
        codes = [unit["unit_code"] for unit in scheduled]

        self.assertEqual(codes.count("TST20001"), 1)
        self.assertEqual(codes.count("TST40001"), 1)
        self.assertEqual(codes.count("TST40002"), 1)
        self.assertEqual(codes.count("COR20001"), 1)
        self.assertEqual(
            {unit["unit_code"]: (unit["year_level"], unit["semester"]) for unit in elective_units},
            {"TST20001": (2, 2), "TST40001": (4, 1), "TST40002": (4, 1)},
        )
        self.assertEqual(
            {unit["unit_code"]: unit["prerequisite"] for unit in elective_units},
            {"TST20001": None, "TST40001": "250 credit points", "TST40002": "100 credit points"},
        )
        self.assertEqual(core_units[0]["unit_code"], "COR20001")
        self.assertEqual(core_units[0]["prerequisite"], "COR10001")


if __name__ == "__main__":
    unittest.main()
