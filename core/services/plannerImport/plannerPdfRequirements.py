from __future__ import annotations
import re

# ============================================================
# STEP 1: Prepare requirement text and credit-point helpers
# ============================================================
# Parse an explicit credit-point value without changing decimal precision.
def _credit_points_in_line(line):
    match = re.search(r'(\d+(?:\.\d+)?)\s*(?:credit\s+point(?:s)?|cp)\b', line, re.IGNORECASE)
    if match:
        value = float(match.group(1))
        return int(value) if value.is_integer() else value
    return None

# Parse credit points after a matched requirement label.
def _credit_points_after_pos(line, start_pos):
    if start_pos is None:
        return None
    return _credit_points_in_line(str(line or '')[start_pos:])

# ============================================================
# STEP 2: Extract planner metadata
# ============================================================
# Read course, major, intake, and intake year from planner text.
def extract_metadata(text):
    meta = {}
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
    joined_lines = "\n".join(lines)
    m = re.search(r'Bachelor of ([A-Za-z ]+?)\s*[–\-]\s*([A-Za-z \n]+?)\s+BA-', text)
    if m:
        meta['course'] = 'Bachelor of ' + m.group(1).strip()
        meta['major']  = re.sub(r'\s+', ' ', m.group(2)).strip()
    if 'course' not in meta:
        m = re.search(
            r'(Bachelor of Media and Communication\s*\(\s*Social)\s*\n\s*(Media\))',
            joined_lines,
            re.IGNORECASE
        )
        if m:
            course = re.sub(r'\s+', ' ', ' '.join(m.groups())).strip()
            course = re.sub(r'\(\s*Social\s+Media\s*\)', '(Social Media)', course, flags=re.IGNORECASE)
            meta['course'] = course
            major_match = re.search(r'\(\s*([^)]+)\s*\)\s*$', course)
            meta['major'] = major_match.group(1).strip() if major_match else None
    if 'course' not in meta:
        m = re.search(
            r'(Bachelor of [^\n]*?\bwith a Major in\s+([A-Za-z][A-Za-z&/,\- ]+))',
            text,
            re.IGNORECASE
        )
        if m:
            meta['course'] = re.sub(r'\s+', ' ', m.group(1)).strip()
            meta['major'] = re.sub(r'\s+', ' ', m.group(2)).strip()
    if 'course' not in meta:
        m = re.search(r'COURSE\s+PLANNER\s+(Bachelor of [^\n]+)', text, re.IGNORECASE)
        if m:
            meta['course'] = re.sub(r'\s+', ' ', m.group(1)).strip()
            meta['major'] = None
    if meta.get('course') and meta.get('major') in (None, ''):
        business_match = re.match(r'^(Bachelor of Business)\s*\(([^)]+)\)\s*$', meta['course'], re.IGNORECASE)
        if business_match:
            meta['major'] = re.sub(r'\s+', ' ', business_match.group(2)).strip()
    if meta.get('course') and meta.get('major') in (None, ''):
        paren_values = [re.sub(r'\s+', ' ', value).strip() for value in re.findall(r'\(([^)]+)\)', meta['course'])]
        filtered = [value for value in paren_values if value and value.lower() not in {'honours', 'honors'}]
        if filtered:
            meta['major'] = filtered[-1]
    if 'course' not in meta:
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
        for idx, line in enumerate(lines):
            m = re.search(r'^(Diploma of [A-Za-z][A-Za-z&/() \-]+?)\s*[–\-]\s*([A-Za-z][A-Za-z&/() \-]+)$', line)
            if m:
                meta['course'] = re.sub(r'\s+', ' ', m.group(1)).strip()
                meta['major'] = re.sub(r'\s+', ' ', m.group(2)).strip()
                break
            if line.startswith('Diploma of '):
                meta['course'] = line.strip()
                for look_ahead in lines[idx + 1: idx + 4]:
                    major_match = re.search(r'^[A-Z]{2,5}\s*[-–]\s*(.+)$', look_ahead)
                    if major_match:
                        meta['major'] = re.sub(r'\s+', ' ', major_match.group(1)).strip()
                        break
                break
    # Improved intake extraction: look for patterns like "Semester 1 | 2022" or "Feb/Mar 2024"
    m = re.search(
        r'(Semester \d+|Feb/Mar|Aug/Sept|Winter(?:\s+Term)?|Summer(?:\s+Term)?)(?:\s*\|\s*|\s*\(|\s+|,\s*)(?:[A-Z]+\s+)?(\d{4})',
        text,
        re.IGNORECASE
    )
    if m:
        meta['intake'] = m.group(1).strip()
        meta['intakeYear'] = int(m.group(2))
    # Fallback: look for any "Intake:" label
    if 'intake' not in meta:
        m = re.search(r'Intake:\s*([^\n]+)', text, re.IGNORECASE)
        if m:
            intake_str = m.group(1).strip()
            # Parse intake_str
            if ' | ' in intake_str:
                parts = intake_str.split(' | ')
                meta['intake'] = parts[0].strip()
                if len(parts) > 1 and parts[1].isdigit():
                    meta['intakeYear'] = int(parts[1])
            else:
                meta['intake'] = intake_str
                # Try to find year in intake_str
                year_m = re.search(r'(\d{4})', intake_str)
                if year_m:
                    meta['intakeYear'] = int(year_m.group(1))
    return meta

# ============================================================
# STEP 3: Read requirement lines
# ============================================================
# This takes cleaned planner text and returns requirement counts and credit points because totals usually appear in prose rather than unit tables.
def extract_requirements(text):
    req = {}
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    joined_text = " ".join(lines)

    # ============================================================
    # STEP 4: Find requirement labels and blocks
    # ============================================================
    # Find credit points on the requirement line or the next few lines.
    def next_credit_points(line_index):
        same_line = _credit_points_in_line(lines[line_index])
        if same_line is not None:
            return same_line

        for offset in range(1, 5):
            idx = line_index + offset
            if idx >= len(lines):
                break
            found = _credit_points_in_line(lines[idx])
            if found is not None:
                return found
        return None

    requirement_boundary_re = re.compile(
        r'^(?:Year\s+(?:One|Two|Three|Four|Five|\d+)|'
        r'Semester\s+\d+|Winter\s+Term|Summer\s+Term|'
        r'General\s+Studies|Recommended\s+Elective|Minor\s*\||'
        r'Course\s+Information)\b',
        re.IGNORECASE
    )

    # Find the closest usable credit-point value around a requirement.
    def nearest_credit_points(line_index, look_back=6, look_ahead=8, upper_bound=50):
        best = None
        for idx in range(max(0, line_index - look_back), min(len(lines), line_index + look_ahead + 1)):
            value = _credit_points_in_line(lines[idx])
            if value is None:
                continue
            if upper_bound is not None and (not isinstance(value, (int, float)) or value > upper_bound):
                continue
            distance = abs(idx - line_index)
            direction_bias = 0 if idx >= line_index else 0.25
            candidate = (distance + direction_bias, value)
            if best is None or candidate[0] < best[0]:
                best = candidate
        return best[1] if best else None

    # Find credit points inside the same requirement block.
    def next_credit_points_in_requirement_block(line_index, max_lookahead=8, upper_bound=50):
        found = []
        for offset in range(0, max_lookahead + 1):
            idx = line_index + offset
            if idx >= len(lines):
                break
            if offset > 0 and requirement_boundary_re.search(lines[idx]):
                break
            value = _credit_points_in_line(lines[idx])
            if value is None:
                continue
            if upper_bound is not None and (not isinstance(value, (int, float)) or value > upper_bound):
                continue
            found.append((offset, value))
        if found:
            found.sort(key=lambda item: item[0])
            return found[0][1]
        return None

    # Find credit points after a label without borrowing preceding text.
    def following_credit_points_in_requirement_block(line_index, start_pos=None, max_lookahead=8, upper_bound=50):
        found = []
        for offset in range(0, max_lookahead + 1):
            idx = line_index + offset
            if idx >= len(lines):
                break
            if offset > 0 and requirement_boundary_re.search(lines[idx]):
                break
            if offset == 0:
                value = _credit_points_after_pos(lines[idx], start_pos)
            else:
                value = _credit_points_in_line(lines[idx])
            if value is None:
                continue
            if upper_bound is not None and (not isinstance(value, (int, float)) or value > upper_bound):
                continue
            found.append((offset, value))
        if found:
            found.sort(key=lambda item: item[0])
            return found[0][1]
        return None

    # ============================================================
    # STEP 5: Match counts and credit points
    # ============================================================
    patterns = [
        ("core", re.compile(r'(?<!\d)(\d+)\s+Core\s+Units\b', re.IGNORECASE)),
        ("major", re.compile(r'(?<!\d)(\d+)\s+[A-Za-z][A-Za-z&/() \-]*\s+(?:Major|Discipline)\s+Units\b', re.IGNORECASE)),
        ("elective", re.compile(r'(?<!\d)(\d+)\s+Elective\s+Units\b', re.IGNORECASE)),
        ("wil", re.compile(r'(?<!\d)(\d+)\s+(?:WIL\s+Placement|Industry\s+Training|Industry\s+Placement)\s+Unit(?:s)?\b', re.IGNORECASE)),
    ]

    for idx, line in enumerate(lines):
        for key, pattern in patterns:
            m = pattern.search(line)
            if not m or key in req:
                continue
            cp = next_credit_points(idx)
            if key == "wil":
                block_cp = following_credit_points_in_requirement_block(
                    idx,
                    start_pos=m.end(),
                    max_lookahead=8,
                    upper_bound=50,
                )
                if block_cp is not None:
                    cp = block_cp
                else:
                    nearest_cp = nearest_credit_points(idx, look_back=0, look_ahead=8, upper_bound=50)
                    if nearest_cp is not None:
                        cp = nearest_cp
            req[key] = {
                "count": int(m.group(1)),
                "cp": cp,
            }

    if "elective" not in req:
        for idx, line in enumerate(lines):
            m = re.search(
                r'(?<!\d)(\d+)\s+Fixed\s+Units\s*\+\s*(\d+)\s+Minor/Elective\s+Units\b',
                line,
                re.IGNORECASE
            )
            if not m:
                continue
            cp = next_credit_points(idx)
            req["elective"] = {
                "count": int(m.group(1)) + int(m.group(2)),
                "cp": cp,
            }
            break

    total_units = None
    total_units_match = re.search(r'\bmade up of\s+(\d+)\s+units\b', joined_text, re.IGNORECASE)
    if total_units_match:
        total_units = int(total_units_match.group(1))

    base_unit_cp = None
    base_unit_values = []
    for count_text, cp_text in re.findall(
        r'structured\s+set\s+of\s+(\d+)\s+units?\s+or\s+(\d+(?:\.\d+)?)\s+credit\s+points',
        joined_text,
        re.IGNORECASE
    ):
        count = int(count_text)
        cp = float(cp_text)
        if count > 0 and cp > 0:
            base_unit_values.append(cp / count)
    if base_unit_values:
        base_unit_cp = min(base_unit_values)

    # Find credit points associated with a requirement label.
    def find_requirement_cp(label_pattern, look_ahead=4):
        for idx, line in enumerate(lines):
            if not re.search(label_pattern, line, re.IGNORECASE):
                continue
            same_line_cp = _credit_points_in_line(line)
            if same_line_cp is not None:
                return same_line_cp
            block_cp = next_credit_points_in_requirement_block(idx, max_lookahead=look_ahead, upper_bound=300)
            if block_cp is not None:
                return block_cp
        return None

    # Find an explicit structured unit count for a requirement label.
    def find_structured_count(label_pattern):
        joined = joined_text
        m = re.search(
            label_pattern + r'.{0,120}?structured\s+set\s+of\s+(\d+)\s+units',
            joined,
            re.IGNORECASE
        )
        if m:
            return int(m.group(1))
        for idx, line in enumerate(lines):
            if not re.search(label_pattern, line, re.IGNORECASE):
                continue
            for next_line in lines[idx: idx + 4]:
                m = re.search(r'structured\s+set\s+of\s+(\d+)\s+units', next_line, re.IGNORECASE)
                if m:
                    return int(m.group(1))
        return None

    if "core" not in req:
        for idx, line in enumerate(lines):
            if re.search(r'\bCore\s+Units\s*\((\d+(?:\.\d+)?)\s+credit\s+points\)', line, re.IGNORECASE):
                cp = _credit_points_in_line(line)
                req["core"] = {"count": None, "cp": cp}
                break

    if "major" not in req:
        major_cp = None
        major_count = None
        for idx, line in enumerate(lines):
            if re.search(r'\bFirst\s+Major\s+Units\b', line, re.IGNORECASE):
                major_cp = _credit_points_in_line(line) or next_credit_points(idx)
            if major_count is None:
                m = re.search(r'\bstructured\s+set\s+of\s+(\d+)\s+units\b', line, re.IGNORECASE)
                if m and idx > 0 and re.search(r'\bFirst\s+Major\s+Units\b', lines[idx - 1], re.IGNORECASE):
                    major_count = int(m.group(1))
            if major_cp is not None and major_count is not None:
                req["major"] = {"count": major_count, "cp": major_cp}
                break

    if "elective" not in req:
        for idx, line in enumerate(lines):
            if re.search(r'\bComponent\s+Units\s*\((\d+(?:\.\d+)?)\s+credit\s+points\)', line, re.IGNORECASE):
                cp = _credit_points_in_line(line)
                req["elective"] = {"count": None, "cp": cp}
                break

    if "wil" not in req:
        for idx, line in enumerate(lines):
            if re.search(r'\bWork-Integrated\s+Learning\s+Placement\b', line, re.IGNORECASE):
                cp = next_credit_points_in_requirement_block(idx, max_lookahead=4, upper_bound=50)
                req["wil"] = {"count": 1, "cp": cp}
                break

    if "wil" not in req:
        for idx, line in enumerate(lines):
            if re.search(r'\b(?:WIL\s+Placement|Industry\s+Training|Industry\s+Placement|Professional\s+Experience)\b', line, re.IGNORECASE):
                if re.search(r'225\s+credit|units\s+\+|comprising', line, re.IGNORECASE):
                    continue
                if len(line.split()) > 12 and not re.search(r'Semester\s+\d+|Winter\s+Term|Summer\s+Term', line, re.IGNORECASE):
                    continue
                wil_cp = next_credit_points_in_requirement_block(idx, max_lookahead=20, upper_bound=50)
                if wil_cp is None:
                    wil_cp = nearest_credit_points(idx, look_back=8, look_ahead=20, upper_bound=50)
                if wil_cp is None:
                    wil_cp = next_credit_points(idx)
                req["wil"] = {
                    "count": 1,
                    "cp": wil_cp,
                }
                break

    if (
        "wil" in req and
        isinstance(req["wil"], dict) and
        "elective" in req and
        isinstance(req["elective"], dict) and
        req["elective"].get("count") and
        req["elective"].get("cp") and
        re.search(r'equivalent to (?:two|2) elective units|exemption to 2 electives', text, re.IGNORECASE) and
        (
            req["wil"].get("cp") is None or
            req["wil"]["cp"] > 50
        )
    ):
        per_unit_cp = req["elective"]["cp"] / req["elective"]["count"]
        req["wil"]["cp"] = int(round(per_unit_cp * 2))

    # Recover a small count immediately before a requirement label.
    def rescue_count_before_label(label_pattern, upper_bound=40):
        best = None
        for match in re.finditer(label_pattern, joined_text, re.IGNORECASE):
            window = joined_text[max(0, match.start() - 120):match.start()]
            values = [int(v) for v in re.findall(r'\b\d{1,5}\b', window)]
            candidates = [v for v in values if 0 < v <= upper_bound]
            if candidates:
                best = candidates[-1]
        return best

    major_req = req.get("major")
    if isinstance(major_req, dict):
        try:
            major_count = int(major_req.get("count"))
        except (TypeError, ValueError):
            major_count = None
        if major_count is None or major_count > 64:
            rescued = rescue_count_before_label(r'(?:Major|Discipline)\s+Units\b')
            if rescued is not None:
                major_req["count"] = rescued

    # Infer a missing count from the shared unit credit-point value.
    def fill_count_from_base(key):
        entry = req.get(key)
        if not isinstance(entry, dict):
            return
        if entry.get("count") not in (None, ""):
            return
        if base_unit_cp is None or not entry.get("cp"):
            return
        inferred = entry["cp"] / base_unit_cp
        if abs(inferred - round(inferred)) <= 0.15:
            entry["count"] = int(round(inferred))

    fill_count_from_base("core")
    fill_count_from_base("elective")

    core_cp = find_requirement_cp(r'\bCore\s+units?\b')
    if core_cp is not None:
        req.setdefault("core", {})
        req["core"]["cp"] = req["core"].get("cp") or core_cp
        if req["core"].get("count") in (None, "") and base_unit_cp:
            inferred = core_cp / base_unit_cp
            if abs(inferred - round(inferred)) <= 0.15:
                req["core"]["count"] = int(round(inferred))

    major_cp = find_requirement_cp(r'\b(?:First\s+Major|(?:Accounting\s+and\s+Finance\s+)?Discipline)\s+units?\b')
    major_count = find_structured_count(r'\bFirst\s+Major\s+Units\b')
    if major_cp is not None:
        req.setdefault("major", {})
        req["major"]["cp"] = req["major"].get("cp") or major_cp
        if major_count is not None:
            req["major"]["count"] = major_count
        elif req["major"].get("count") in (None, "") and base_unit_cp:
            inferred = major_cp / base_unit_cp
            if abs(inferred - round(inferred)) <= 0.15:
                req["major"]["count"] = int(round(inferred))

    component_cp = find_requirement_cp(r'\bComponent\s+units?\b')
    if component_cp is not None:
        req.setdefault("elective", {})
        req["elective"]["cp"] = req["elective"].get("cp") or component_cp
        if (
            req["elective"].get("count") not in (None, "") and
            base_unit_cp and
            req["elective"]["count"] < 3 and
            component_cp >= 75
        ):
            req["elective"]["count"] = None
        if req["elective"].get("count") in (None, "") and base_unit_cp:
            inferred = component_cp / base_unit_cp
            if abs(inferred - round(inferred)) <= 0.15:
                req["elective"]["count"] = int(round(inferred))

    wil_cp = find_requirement_cp(r'\bWork-Integrated\s+Learning\s+Placement\b')
    if wil_cp is not None:
        req.setdefault("wil", {})
        req["wil"]["count"] = req["wil"].get("count") or 1
        req["wil"]["cp"] = req["wil"].get("cp") or wil_cp

    if (
        "wil" in req and
        isinstance(req["wil"], dict) and
        req["wil"].get("cp") in (None, "") and
        "elective" in req and
        isinstance(req["elective"], dict) and
        req["elective"].get("count") and
        req["elective"].get("cp") and
        re.search(r'equivalent to (?:two|2) elective units|exemption to 2 electives', text, re.IGNORECASE)
    ):
        per_unit_cp = req["elective"]["cp"] / req["elective"]["count"]
        req["wil"]["cp"] = int(round(per_unit_cp * 2))

    if re.search(r'\bCore\s+Units\s*\(\s*100\s+credit\s+points\s*\)', joined_text, re.IGNORECASE) and base_unit_cp:
        req.setdefault("core", {})["cp"] = req.get("core", {}).get("cp") or 100
        req["core"]["count"] = int(round(req["core"]["cp"] / base_unit_cp))

    if re.search(r'\bComponent\s+Units\s*\(\s*75\s+credit\s+points\s*\)', joined_text, re.IGNORECASE) and base_unit_cp:
        req.setdefault("elective", {})["cp"] = req.get("elective", {}).get("cp") or 75
        req["elective"]["count"] = int(round(req["elective"]["cp"] / base_unit_cp))

    if re.search(r'\bFirst\s+Major\s+Units\s*\(\s*100\s+credit\s+points\s*\)', joined_text, re.IGNORECASE):
        major_count_match = re.search(
            r'First\s+Major\s+Units.*?structured\s+set\s+of\s+(\d+)\s+units',
            joined_text,
            re.IGNORECASE
        )
        if major_count_match:
            req["major"] = {
                "count": int(major_count_match.group(1)),
                "cp": 100,
            }

    if total_units is not None:
        known_counts = {}
        for key in ("core", "major", "elective", "wil"):
            value = req.get(key)
            if isinstance(value, dict):
                try:
                    known_counts[key] = int(value.get("count"))
                except (TypeError, ValueError):
                    pass
        missing = [key for key in ("core", "major", "elective", "wil") if key not in known_counts and key in req]
        if len(missing) == 1:
            inferred = total_units - sum(known_counts.values())
            if inferred >= 0:
                req[missing[0]]["count"] = inferred

    has_elective_requirement_text = bool(
        re.search(r'\b(?:Elective\s+Units|Minor/Elective\s+Units|Elective\s+units?)\b', joined_text, re.IGNORECASE)
    )
    has_wil_requirement_text = bool(
        re.search(r'\b(?:WIL|Work-Integrated|Work Integrated|Industry Placement|Industry Training|Professional Experience)\b', joined_text, re.IGNORECASE)
    )

    if "elective" not in req and not has_elective_requirement_text:
        req["elective"] = {"count": 0, "cp": 0}

    if (
        "wil" not in req and
        not has_wil_requirement_text and
        not has_elective_requirement_text
    ):
        req["wil"] = {"count": 0, "cp": 0}

    # ============================================================
    # STEP 6: Return metadata and requirements
    # ============================================================
    return req