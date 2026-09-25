from __future__ import annotations
import re
# ============================================================
# STEP 1: Prepare colour values
# ============================================================
UNIT_MARKER_RE = r'[*#†]+'

CODE_RE = re.compile(rf'^[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?$')

SEMESTER_ROW_RE = re.compile(
    r'^\s*Semester\s+(\d+)(?:\s*\|\s*(Feb/Mar|Aug/Sept|Mar|Winter(?:\s+Term)?|Summer(?:\s+Term)?)\s+(\d{4}))?.*$',
    re.IGNORECASE
)

TERM_ROW_RE = re.compile(
    r'^\s*(Summer(?:\s+Term)?|Winter(?:\s+Term)?)(?:\s*\|\s*[^|]+)?(?:\s+\d{4})?.*$',
    re.IGNORECASE
)

SKIP_ROW_RE = re.compile(
    r'^\s*$|'
    r'Unit\s*Code|Unit\s*Name|Pre-?requisites|Offered\s*in|'
    r'Semester\s*[\d|]|Winter\s*Term|Summer\s*Term|'
    r'Year\s+(?:One|Two|Three|\d)|'
    r'Recommended\s*Elective|Minor\s*\||'
    r'^Notes$|^Elective\s+\d+$',
    re.IGNORECASE
)

PREREQ_WORD_RE = re.compile(
    r'^([A-Z]{3}\d{3,5}|N[Ii][Ll]|NIL|\d+(?:\.\d+)?\s*cp|\d+(?:\.\d+)?\s*CP|\(CR\)|Co-req:|&|/|-)$'
)

DEFAULT_COLOUR_LEGEND = {
    (0.776, 0.851, 0.945): 'core',
    (0.992, 0.914, 0.851): 'major',
    (0.839, 0.89, 0.737): 'elective',
    (0.8, 0.753, 0.851): 'elective',
    (0.698, 0.631, 0.78): 'wil',
}

# Measure the distance between two RGB colours.
def _colour_dist(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5

# Convert a PDF colour value into a comparable RGB tuple.
def _normalise_rgb(colour):
    if colour is None:
        return None
    if isinstance(colour, (int, float)):
        value = round(float(colour), 3)
        return (value, value, value)
    if isinstance(colour, (tuple, list)):
        if not colour:
            return None
        values = [round(float(v), 3) for v in list(colour)[:3]]
        if len(values) == 1:
            return (values[0], values[0], values[0])
        if len(values) == 2:
            return (values[0], values[1], values[1])
        return tuple(values)
    return None

# ============================================================
# STEP 2: Read PDF word and position evidence
# ============================================================
# Read rectangle and fill evidence from one PDF page.
def extract_rectangles_from_page(page):
    rectangles = []
    for rect in page.rects:
        colour = _normalise_rgb(rect.get("non_stroking_color"))
        rectangles.append({
            "x0": rect.get("x0", 0),
            "x1": rect.get("x1", 0),
            "top": rect.get("top", 0),
            "bottom": rect.get("bottom", 0),
            "colour": colour,
            "area": max((rect.get("x1", 0) - rect.get("x0", 0)), 0) * max((rect.get("bottom", 0) - rect.get("top", 0)), 0),
        })
    return rectangles

# Check whether a word lies inside a rectangle.
def _word_inside_rect(word, rect, tolerance=1.0):
    return (
        word.get("x0", 0) >= rect["x0"] - tolerance and
        word.get("x1", 0) <= rect["x1"] + tolerance and
        word.get("top", 0) >= rect["top"] - tolerance and
        word.get("bottom", 0) <= rect["bottom"] + tolerance
    )

# Read the widest filled rectangle crossing a vertical position.
def _get_colour_at_y(page, mid_y, content_right=None):
    best, best_w = None, -1
    for r in page.rects:
        if (r.get('fill') and
                isinstance(r.get('non_stroking_color'), (tuple, list)) and
                r['top'] <= mid_y <= r['bottom'] and
                (content_right is None or r['x0'] < content_right)):
            w = r['x1'] - r['x0']
            if w > best_w:
                best_w, best = w, r['non_stroking_color']
    if best:
        return tuple(best)
    # Fallback: all rects
    for r in page.rects:
        if (r.get('fill') and
                isinstance(r.get('non_stroking_color'), (tuple, list)) and
                r['top'] <= mid_y <= r['bottom']):
            w = r['x1'] - r['x0']
            if w > best_w:
                best_w, best = w, r['non_stroking_color']
    return tuple(best) if best else None

# Find the background colour for a row bounding box.
def _get_row_colour(page, row_bbox, content_right=None):
    mid_y = (row_bbox[1] + row_bbox[3]) / 2
    return _get_colour_at_y(page, mid_y, content_right=content_right)

# Estimate the right edge of the main planner content.
def _detect_content_right(page_words, page_width):
    content_zone = page_width * 0.65
    max_x = 0
    for w in page_words:
        if w['x0'] >= content_zone:
            continue
        if PREREQ_WORD_RE.match(w['text']) and w['x0'] > 150:
            if w['x1'] > max_x:
                max_x = w['x1']
    return (max_x + 10) if max_x > 0 else content_zone

# ============================================================
# STEP 3: Rebuild rows and cells
# ============================================================
# Join unit-code fragments that were split across adjacent PDF words.
def merge_split_codes(words):
    merged = []
    i = 0
    while i < len(words):
        w = words[i]['text']
        if (i + 1 < len(words) and
            re.match(r'^[A-Z]$', w) and
            re.match(r'^[A-Z]{2}\d{3,5}$', words[i+1]['text'])):
            merged_text = w + words[i+1]['text']
            # Approximate bbox: use first word's start and second's end
            merged_word = {
                'text': merged_text,
                'x0': words[i]['x0'],
                'x1': words[i+1]['x1'],
                'top': words[i]['top'],
                'bottom': words[i]['bottom']
            }
            merged.append(merged_word)
            i += 2
        else:
            merged.append(words[i])
            i += 1
    return merged

# Split words into visual rows using their vertical positions.
def _split_merged_row(row_words, y_tol=8):
    if not row_words:
        return []
    sorted_words = sorted(row_words, key=lambda w: (w['top'], w['x0']))
    sorted_words = merge_split_codes(sorted_words)
    sub_rows, current = [], [sorted_words[0]]
    for w in sorted_words[1:]:
        prev_mid = (current[-1]['top'] + current[-1]['bottom']) / 2
        curr_mid = (w['top'] + w['bottom']) / 2
        if abs(curr_mid - prev_mid) <= y_tol:
            current.append(w)
        else:
            sub_rows.append(current)
            current = [w]
    sub_rows.append(current)
    return sub_rows

# Assign words to the available table cells.
def _words_to_cells(sub_words, cell_bboxes):
    sub_words = merge_split_codes(sub_words)
    valid_cells = [c for c in cell_bboxes if c and (c[2] - c[0]) >= 8]

    # Full-width merged row: detect columns from word x-gaps
    if len(valid_cells) == 1 and (valid_cells[0][2] - valid_cells[0][0]) > 150:
        c = valid_cells[0]
        row_x0 = c[0]
        sorted_sub = sorted(sub_words, key=lambda w: w['x0'])
        code_end = sorted_sub[0]['x1'] + 2 if sorted_sub else row_x0 + 50
        # Detect prereq column start from largest x-gap between name words
        name_words_list = [w for w in sorted_sub if w['x0'] > code_end]
        prereq_start = row_x0 + 200
        for i in range(1, len(name_words_list)):
            gap = name_words_list[i]['x0'] - name_words_list[i - 1]['x1']
            if gap > 15:
                prereq_start = name_words_list[i]['x0']
                break
        code_w, name_w, prereq_w = [], [], []
        for w in sorted_sub:
            if w['x0'] <= code_end:
                code_w.append(w['text'])
            elif w['x0'] < prereq_start:
                name_w.append(w['text'])
            else:
                prereq_w.append(w['text'])
        result = []
        if code_w:
            result.append((' '.join(code_w), c))
        if name_w:
            result.append((' '.join(name_w), (row_x0 + 50, c[1], prereq_start, c[3])))
        if prereq_w:
            result.append((' '.join(prereq_w), (prereq_start, c[1], c[2], c[3])))
        return result

    buckets = {i: [] for i in range(len(cell_bboxes))}
    overflow_prereq = []
    for w in sub_words:
        wmid = (w['x0'] + w['x1']) / 2
        assigned = False
        for ci, c in enumerate(cell_bboxes):
            if c and c[0] <= wmid <= c[2]:
                buckets[ci].append(w['text'])
                assigned = True
                break
        if not assigned:
            if w['x0'] > 150:
                placed = False
                for ci in range(len(cell_bboxes) - 1, -1, -1):
                    if cell_bboxes[ci] is not None and cell_bboxes[ci][0] > 150:
                        buckets[ci].append(w['text'])
                        placed = True
                        break
                if not placed:
                    overflow_prereq.append(w['text'])

    result = []
    for ci, c in enumerate(cell_bboxes):
        if c is None:
            continue
        x0, top, x1, bottom = c
        if x1 - x0 < 8:
            continue
        text = re.sub(r'\s+', ' ', ' '.join(buckets[ci])).strip()
        if text:
            result.append((text, c))

    if overflow_prereq:
        ref = [c for c in cell_bboxes if c]
        if ref:
            result.append((
                re.sub(r'\s+', ' ', ' '.join(overflow_prereq)).strip(),
                (200, ref[0][1], 400, ref[0][3])
            ))
    return result

# ============================================================
# STEP 4: Detect the planner colour legend
# ============================================================
# Learn category colours from explicit legend rows in the PDF.
def detect_colour_legend(pdf):
    detected_legend = {}

    # Keep near-duplicate legend colours from creating conflicting mappings.
    def register_colour(raw_colour, label, conflict_tol=0.012):
        colour = _normalise_rgb(raw_colour)
        if not colour:
            return
        for known, known_label in detected_legend.items():
            if _colour_dist(colour, known) <= conflict_tol:
                if known_label == label:
                    return
                # Keep the explicit in-document legend label when two near-identical
                # shades are detected with conflicting meanings.
                return
        detected_legend[colour] = label

    PATTERNS = [
        (r'(?:\d+\s+)?Core\s+Units(?:\s*\(|\b)', 'core', 'widest'),
        (r'(?:\d+\s+)?(?:First\s+Major|(?:\w[\w\s]*\s+)?(?:Major|Discipline))\s+Units(?:\s*\(|\b)', 'major', 'widest'),
        (r'(?:(?:\d+\s+)?Elective\s+Units|(?:\d+\s+)?Component\s+Units|(?:\d+\s+)?Fixed\s+Units\s*\+\s*\d+\s+Minor/Elective\s+Units)', 'elective', 'widest'),
        (r'(?:Work-Integrated\s+Learning\s+Placement|\d+\s+(?:WIL\s+Placement|Industry\s+Training|Industry\s+Placement)\s+Unit(?:s)?)', 'wil_sidebar', 'narrowest'),
        (r'General\s+Studies|MPU', 'mpu', 'narrowest'),
    ]

    for page in pdf.pages:
        rectangles = extract_rectangles_from_page(page)
        words = page.extract_words(x_tolerance=1, y_tolerance=3)
        half  = page.width / 2
        lines = {}
        for w in words:
            key = round((w['top'] + w['bottom']) / 2 / 3) * 3
            lines.setdefault(key, []).append(w)

        for key, lw in lines.items():
            lw = sorted(lw, key=lambda w: w['x0'])
            line_text = ' '.join(w['text'] for w in lw)
            if re.match(rf'^\s*(?:[^\w\s]\s*)?[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', line_text, re.IGNORECASE):
                continue

            for pattern, label, strategy in PATTERNS:
                if not re.search(pattern, line_text, re.IGNORECASE):
                    continue
                mid_y = key
                matching_rects = [
                    rect for rect in rectangles
                    if rect['top'] <= mid_y <= rect['bottom'] and
                    any(_word_inside_rect(word, rect, tolerance=2.0) for word in lw)
                ]
                if strategy == 'widest':
                    best, best_metric = None, -1
                    candidate_rects = matching_rects or [
                        rect for rect in rectangles
                        if rect['top'] <= mid_y <= rect['bottom']
                    ]
                    for rect in candidate_rects:
                        w = rect['x1'] - rect['x0']
                        if w > best_metric:
                            best_metric, best = w, rect['colour']
                else:
                    best, best_metric = None, float('inf')
                    candidate_rects = [
                        rect for rect in (matching_rects or rectangles)
                        if rect['x0'] > half and rect['top'] <= mid_y <= rect['bottom']
                    ]
                    for rect in candidate_rects:
                        w = rect['x1'] - rect['x0']
                        if w < best_metric:
                            best_metric, best = w, rect['colour']

                if best:
                    colour = tuple(best)
                    # WIL sidebar colour → register as elective (it's the same shade)
                    actual_label = 'wil' if label == 'wil_sidebar' else label
                    register_colour(colour, actual_label)

        # Detect real WIL colour from WIL/Industry Training unit rows
        if 'wil' not in detected_legend.values():
            for w in page.extract_words(x_tolerance=3, y_tolerance=3):
                if (CODE_RE.match(w['text']) and w['text'].startswith('ICT')) or re.search(r'Industry\s+Training', w['text'], re.IGNORECASE):
                    mid_y = (w['top'] + w['bottom']) / 2
                    c = _get_colour_at_y(page, mid_y)
                    if c:
                        register_colour(c, 'wil')

        if len(detected_legend) >= 3:
            break

    legend = dict(detected_legend)
    for colour, label in DEFAULT_COLOUR_LEGEND.items():
        if any(_colour_dist(colour, known) <= 0.012 for known in legend):
            continue
        legend[colour] = label

    return legend

# ============================================================
# STEP 5: Find year and semester headings
# ============================================================
# Extract year, semester, and special-term headers from page words.
def _extract_line_headers(words):
    lines = {}
    for w in words:
        key = round((w['top'] + w['bottom']) / 2 / 3) * 3
        lines.setdefault(key, []).append(w)

    headers = []
    year_pattern = re.compile(r'^\s*Year\s+(One|Two|Three|Four|Five|\d+)\b', re.IGNORECASE)
    year_map = {'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5}

    for key, line_words in lines.items():
        ordered = sorted(line_words, key=lambda x: x['x0'])
        line_text = ' '.join(w['text'] for w in ordered).strip()
        if not line_text:
            continue

        y_match = year_pattern.search(line_text)
        if y_match:
            year_token = y_match.group(1).title()
            year_value = year_map.get(year_token)
            if year_value is None and year_token.isdigit():
                year_value = int(year_token)
            if year_value is not None:
                headers.append({
                    'type': 'year',
                    'value': year_value,
                    'top': key,
                    'x0': min(w['x0'] for w in ordered),
                    'x1': max(w['x1'] for w in ordered),
                })

        s_match = SEMESTER_ROW_RE.match(line_text)
        if s_match:
            headers.append({
                'type': 'semester',
                'value': _normalise_semester_number(s_match.group(1)),
                'top': key,
                'x0': min(w['x0'] for w in ordered),
                'x1': max(w['x1'] for w in ordered),
            })
            continue

        t_match = TERM_ROW_RE.match(line_text)
        if t_match:
            term = t_match.group(1).lower()
            headers.append({
                'type': 'semester',
                'value': 4 if 'winter' in term else 3,
                'top': key,
                'x0': min(w['x0'] for w in ordered),
                'x1': max(w['x1'] for w in ordered),
            })

    return headers

# Find the closest compatible header above a table region.
def _closest_header_value(headers, header_type, table_bbox, max_vertical_gap=80, below_tolerance=18):
    tx0, ttop, tx1, _ = table_bbox
    best_value = None
    best_score = None

    for header in headers:
        if header['type'] != header_type or header['top'] > ttop + below_tolerance:
            continue

        vertical_gap = abs(ttop - header['top'])
        if vertical_gap > max_vertical_gap:
            continue

        overlap = min(tx1, header['x1']) - max(tx0, header['x0'])
        horizontal_penalty = 0 if overlap > 0 else min(abs(header['x0'] - tx1), abs(header['x1'] - tx0))
        score = (vertical_gap, horizontal_penalty)

        if best_score is None or score < best_score:
            best_score = score
            best_value = header['value']

    return best_value

# Convert a displayed semester number to the stored semester value.
def _normalise_semester_number(value):
    sem = int(value)
    return 1 if sem % 2 == 1 else 2

# ============================================================
# STEP 6: Match visual evidence to categories
# ============================================================
# Match one observed fill colour to the nearest legend category.
def match_category(colour, legend, tolerance=0.11):
    if not colour or not legend:
        return None
    best_label, best_dist = None, float('inf')
    for known, label in legend.items():
        d = _colour_dist(colour, known)
        if d < best_dist:
            best_dist, best_label = d, label
    return best_label if best_dist <= tolerance else None