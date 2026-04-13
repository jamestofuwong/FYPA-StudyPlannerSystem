import re
import pdfplumber

CODE_RE = re.compile(r'^[A-Z]{3}\d{4,5}$')
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
    r'^([A-Z]{3}\d{4,5}|N[Ii][Ll]|NIL|\d+cp|\d+CP|Co-req:|&|/|-)$'
)

DEFAULT_COLOUR_LEGEND = {
    (0.776, 0.851, 0.945): 'core',
    (0.992, 0.914, 0.851): 'major',
    (0.839, 0.89, 0.737): 'elective',
    (0.8, 0.753, 0.851): 'elective',
    (0.698, 0.631, 0.78): 'wil',
}

DEFAULT_TAG_COLOUR_MAP = {
    (1.0, 0.0, 0.0): "CORE",
    (0.0, 0.5, 0.0): "ELECTIVE",
    (0.776, 0.851, 0.945): "CORE",
    (0.992, 0.914, 0.851): "MAJOR",
    (0.839, 0.89, 0.737): "ELECTIVE",
    (0.8, 0.753, 0.851): "ELECTIVE",
    (0.698, 0.631, 0.78): "WIL",
    (1.0, 1.0, 1.0): "GENERAL",
}


# ---------------------------
# HELPERS
# ---------------------------
def _colour_dist(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


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


def colour_to_tag(colour, colour_map=None, tolerance=0.05):
    rgb = _normalise_rgb(colour)
    if rgb is None:
        return None

    colour_map = colour_map or DEFAULT_TAG_COLOUR_MAP
    best_tag = None
    best_dist = float("inf")
    for known_rgb, tag in colour_map.items():
        dist = _colour_dist(rgb, known_rgb)
        if dist < best_dist:
            best_dist = dist
            best_tag = tag
    if best_dist <= tolerance:
        return best_tag
    return None


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


def _word_inside_rect(word, rect, tolerance=1.0):
    return (
        word.get("x0", 0) >= rect["x0"] - tolerance and
        word.get("x1", 0) <= rect["x1"] + tolerance and
        word.get("top", 0) >= rect["top"] - tolerance and
        word.get("bottom", 0) <= rect["bottom"] + tolerance
    )


def find_background_for_word(word, rectangles, colour_map=None, tolerance=0.05):
    containing_rects = [rect for rect in rectangles if _word_inside_rect(word, rect)]
    if containing_rects:
        containing_rects.sort(key=lambda rect: (rect["area"], rect["top"], rect["x0"]))
        colour = containing_rects[0]["colour"]
    else:
        colour = (1.0, 1.0, 1.0)

    tag = colour_to_tag(colour, colour_map=colour_map, tolerance=tolerance)
    if colour is None or colour == (1.0, 1.0, 1.0) or tag is None:
        tag = "GENERAL"
    return colour, tag


def extract_words_with_background_tags(file_path, colour_map=None, tolerance=0.05):
    entries = []
    with pdfplumber.open(file_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            rectangles = extract_rectangles_from_page(page)
            words = page.extract_words(x_tolerance=3, y_tolerance=3, keep_blank_chars=False)
            for word in words:
                text = (word.get("text") or "").strip()
                if not text:
                    continue
                colour, tag = find_background_for_word(word, rectangles, colour_map=colour_map, tolerance=tolerance)
                entries.append({
                    "page": page_number,
                    "text": text,
                    "x0": word.get("x0", 0),
                    "x1": word.get("x1", 0),
                    "top": word.get("top", 0),
                    "bottom": word.get("bottom", 0),
                    "doctop": word.get("doctop", word.get("top", 0)),
                    "rgb": colour,
                    "tag": tag,
                })
    return entries


def _build_tagged_line(words, gap_threshold=3.5):
    if not words:
        return ""

    parts = []
    current_tag = None
    prev_x1 = None

    for word in words:
        text = word["text"]
        tag = word.get("tag") or "GENERAL"
        x0 = word.get("x0", 0)

        if prev_x1 is not None and x0 - prev_x1 > gap_threshold and parts and not parts[-1].endswith(" "):
            parts.append(" ")

        if tag != current_tag:
            current_tag = tag
            if tag:
                if parts and not parts[-1].endswith(" "):
                    parts.append(" ")
                parts.append(f"[{tag}] ")

        parts.append(text)
        prev_x1 = word.get("x1", x0)

    line = "".join(parts)
    line = re.sub(r"\s+", " ", line).strip()
    line = re.sub(r"(\[[A-Z_]+\]\s+)+", lambda m: m.group(0).strip() + " ", line)
    return line


def build_tagged_text_from_words(word_entries, line_bucket=3):
    lines = {}
    for entry in word_entries:
        key = (entry["page"], round(entry["doctop"] / line_bucket) * line_bucket)
        lines.setdefault(key, []).append(entry)

    output = []
    for key in sorted(lines):
        line_words = sorted(lines[key], key=lambda item: item["x0"])
        line = _build_tagged_line(line_words)
        if line:
            output.append(line)
    return "\n".join(output)


def extract_tagged_text_from_pdf(file_path, colour_map=None, tolerance=0.05):
    word_entries = extract_words_with_background_tags(file_path, colour_map=colour_map, tolerance=tolerance)
    return build_tagged_text_from_words(word_entries)


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


def _get_row_colour(page, row_bbox, content_right=None):
    mid_y = (row_bbox[1] + row_bbox[3]) / 2
    return _get_colour_at_y(page, mid_y, content_right=content_right)


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


def merge_split_codes(words):
    merged = []
    i = 0
    while i < len(words):
        w = words[i]['text']
        if (i + 1 < len(words) and
            re.match(r'^[A-Z]$', w) and
            re.match(r'^[A-Z]{2}\d{4,5}$', words[i+1]['text'])):
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


# ---------------------------
# STEP 1: Colour legend detection
# ---------------------------
def detect_colour_legend(pdf):
    legend = dict(DEFAULT_COLOUR_LEGEND)
    PATTERNS = [
        (r'\d+\s+Core\s+Units',              'core',        'widest'),
        (r'\d+\s+\w[\w\s]*\s+Major\s+Units', 'major',       'widest'),
        (r'\d+\s+Elective\s+Units',           'elective',    'widest'),
        (r'\d+\s+WIL\s+Placement\s+Units',    'wil_sidebar', 'narrowest'),
    ]

    for page in pdf.pages:
        words = page.extract_words(x_tolerance=1, y_tolerance=3)
        half  = page.width / 2
        lines = {}
        for w in words:
            key = round((w['top'] + w['bottom']) / 2 / 3) * 3
            lines.setdefault(key, []).append(w)

        for key, lw in lines.items():
            lw = sorted(lw, key=lambda w: w['x0'])
            line_text = ' '.join(w['text'] for w in lw)

            for pattern, label, strategy in PATTERNS:
                if not re.search(pattern, line_text, re.IGNORECASE):
                    continue
                mid_y = key
                if strategy == 'widest':
                    best, best_metric = None, -1
                    for r in page.rects:
                        if (r.get('fill') and
                                isinstance(r.get('non_stroking_color'), (tuple, list)) and
                                r['top'] <= mid_y <= r['bottom']):
                            w = r['x1'] - r['x0']
                            if w > best_metric:
                                best_metric, best = w, r['non_stroking_color']
                else:
                    best, best_metric = None, float('inf')
                    for r in page.rects:
                        if (r.get('fill') and
                                isinstance(r.get('non_stroking_color'), (tuple, list)) and
                                r['top'] <= mid_y <= r['bottom'] and
                                r['x0'] > half):
                            w = r['x1'] - r['x0']
                            if w < best_metric:
                                best_metric, best = w, r['non_stroking_color']

                if best:
                    colour = tuple(best)
                    # WIL sidebar colour → register as elective (it's the same shade)
                    actual_label = 'elective' if label == 'wil_sidebar' else label
                    legend[colour] = actual_label

        # Detect real WIL colour from ICT-prefix unit rows
        if 'wil' not in legend.values():
            for w in page.extract_words(x_tolerance=3, y_tolerance=3):
                if re.match(r'^ICT\d{5}$', w['text']):
                    mid_y = (w['top'] + w['bottom']) / 2
                    c = _get_colour_at_y(page, mid_y)
                    if c:
                        legend[c] = 'wil'

        if len(legend) >= 3:
            break

    return legend


def _extract_line_headers(words):
    lines = {}
    for w in words:
        key = round((w['top'] + w['bottom']) / 2 / 3) * 3
        lines.setdefault(key, []).append(w)

    headers = []
    year_pattern = re.compile(r'^\s*Year\s+(One|Two|Three|\d+)\b', re.IGNORECASE)
    year_map = {'One': 1, 'Two': 2, 'Three': 3}

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
                'value': int(s_match.group(1)),
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


def _split_prereq_and_offered(text):
    if not text:
        return None, None

    text = re.sub(r'\s+', ' ', text).strip()
    offered_pat = re.compile(
        r'((?:Feb/Mar|Aug/Sept|Semester\s+[12])'
        r'(?:\s*&\s*(?:(?:Feb/Mar|Aug/Sept)|(?:Semester\s+)?[12]))?'
        r'(?:\s+only)?)$',
        re.IGNORECASE
    )

    m = offered_pat.search(text)
    if not m:
        if re.match(r'^N[Ii][Ll]$', text):
            return None, None
        return text, None

    offered = m.group(1).strip()
    prereq = text[:m.start()].strip()

    if re.match(r'^N[Ii][Ll]$', prereq):
        prereq = None

    return prereq or None, offered


def match_category(colour, legend, tolerance=0.04):
    if not colour or not legend:
        return None
    best_label, best_dist = None, float('inf')
    for known, label in legend.items():
        d = _colour_dist(colour, known)
        if d < best_dist:
            best_dist, best_label = d, label
    return best_label if best_dist <= tolerance else None


# ---------------------------
# STEP 2: Text + metadata + requirements
# ---------------------------
def extract_text_from_pdf(file_path):
    pages = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text.strip())

    return "\n\n".join(pages)


def clean_text(text):
    return re.sub(r'\n+', '\n', re.sub(r'\r', '', text)).strip()


def extract_metadata(text):
    meta = {}
    m = re.search(r'Bachelor of ([A-Za-z ]+?)\s*[–\-]\s*([A-Za-z \n]+?)\s+BA-', text)
    if m:
        meta['course'] = 'Bachelor of ' + m.group(1).strip()
        meta['major']  = re.sub(r'\s+', ' ', m.group(2)).strip()
    # Improved intake extraction: look for patterns like "Semester 1 | 2022" or "Feb/Mar 2024"
    m = re.search(r'(Semester \d+|Feb/Mar|Aug/Sept|Winter|Summer)(?:\s*\|\s*|\s+)(\d{4})', text, re.IGNORECASE)
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


def extract_requirements(text):
    """
    Extract unit counts and credit points from Course Information section.
    Returns dict like:
      { 'core': {'count': 8, 'cp': 100}, 'major': {...}, ... }
    """
    req = {}
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]

    def credit_points_in_line(line):
        m = re.search(r'(\d+)\s+credit\s+points', line, re.IGNORECASE)
        if m:
            return int(m.group(1))
        return None

    def next_credit_points(line_index):
        same_line = credit_points_in_line(lines[line_index])
        if same_line is not None:
            return same_line

        for offset in range(1, 5):
            idx = line_index + offset
            if idx >= len(lines):
                break
            found = credit_points_in_line(lines[idx])
            if found is not None:
                return found
        return None

    patterns = [
        ("core", re.compile(r'(?<!\d)(\d+)\s+Core\s+Units\b', re.IGNORECASE)),
        ("major", re.compile(r'(?<!\d)(\d+)\s+[A-Za-z][A-Za-z&/() \-]*\s+Major\s+Units\b', re.IGNORECASE)),
        ("elective", re.compile(r'(?<!\d)(\d+)\s+Elective\s+Units\b', re.IGNORECASE)),
        ("wil", re.compile(r'(?<!\d)(\d+)\s+WIL\s+Placement\s+Units\b', re.IGNORECASE)),
    ]

    for idx, line in enumerate(lines):
        for key, pattern in patterns:
            m = pattern.search(line)
            if not m or key in req:
                continue
            req[key] = {
                "count": int(m.group(1)),
                "cp": next_credit_points(idx),
            }

    return req


# ---------------------------
# STEP 3: Unit extraction
# ---------------------------
def _process_row_cells(cells, page, row_bbox, legend, has_offered,
                       units, seen, current_section,
                       sub_mid_y=None, content_right=None):
    if not cells:
        return False

    first_text = cells[0][0].strip()
    row_text = ' '.join(t for t, _ in cells).strip()

    if re.search(r'Recommended\s+Elective', first_text, re.IGNORECASE):
        return 'section:Recommended Elective Units'
    if re.match(r'Minor\s*\|', first_text, re.IGNORECASE):
        return 'section:' + re.sub(r'\s+', ' ', first_text).strip()
    if SKIP_ROW_RE.match(first_text):
        return False

    # Find unit code (must be in left code column, x0 < 100)
    code = code_pos = None
    for idx, (t, bbox) in enumerate(cells):
        tok = t.split()[0].strip() if t.split() else ''
        if CODE_RE.match(tok) and bbox[0] < 100:
            code     = tok.upper()
            code_pos = idx
            break

    if not code:
        # Continuation: extend last unit's name or prereq
        if units:
            last = units[-1]
            if not last['code'].startswith('MPU') and not has_offered:
                colour = (_get_colour_at_y(page, sub_mid_y, content_right=content_right)
                          if sub_mid_y is not None else
                          _get_row_colour(page, row_bbox, content_right=content_right))
                if match_category(colour, legend) == last['category']:
                    for nc_text, nc_bbox in cells:
                        if not nc_bbox or len(nc_text) <= 1:
                            continue
                        if SKIP_ROW_RE.match(nc_text):
                            continue
                        if re.match(r'^N[Ii][Ll]$', nc_text.strip()):
                            continue
                        if (nc_text in (last['name'] or '') or
                                nc_text in (last['prerequisite'] or '')):
                            continue
                        if nc_bbox[0] > 150:
                            last['prerequisite'] = (
                                (last['prerequisite'] or '') + ' ' + nc_text
                            ).strip()
                            break
                        else:
                            last['name'] = (last['name'] + ' ' + nc_text).strip()
        return False

    # Name
    name = name_pos = None
    for idx in range(code_pos + 1, len(cells)):
        t = cells[idx][0].strip()
        if len(t) > 2:
            tokens, trimmed = t.split(), []
            for tok in tokens:
                if CODE_RE.match(tok) and trimmed:
                    break
                trimmed.append(tok)
            name     = ' '.join(trimmed).strip()
            name_pos = idx
            break

    # Prereq
    prereq_raw = None
    if name_pos is not None:
        tail_parts = []
        for idx in range(name_pos + 1, len(cells)):
            t = cells[idx][0].strip()
            if len(t) > 1:
                tail_parts.append(t)
        if tail_parts:
            prereq_raw = ' '.join(tail_parts)

    # Category from colour (restricted to content area to avoid sidebar bleed)
    colour   = (_get_colour_at_y(page, sub_mid_y, content_right=content_right)
                if sub_mid_y is not None else
                _get_row_colour(page, row_bbox, content_right=content_right))
    category = match_category(colour, legend)

    is_prescribed = bool(name and '*' in name)
    name_clean    = (name or '').replace('*', '').strip()
    if name_clean.startswith('- '):
        name_clean = name_clean[2:].strip()

    prereq = prereq_raw.strip() if prereq_raw else None
    offered = None
    if prereq is not None:
        prereq, offered = _split_prereq_and_offered(prereq)

    if code.startswith('MPU'):
        category = 'mpu'
    elif code.startswith('ICT') and (
        category == 'wil' or
        re.search(r'work-?integrated|WIL', row_text, re.IGNORECASE) or
        re.search(r'work-?integrated|WIL', name_clean or '', re.IGNORECASE)
    ):
        category = 'wil'
    elif category == 'elective' and is_prescribed:
        category = 'prescribed_elective'

    if code in seen:
        existing = next((u for u in reversed(units) if u.get('code') == code), None)
        if existing:
            row_has_explicit_nil = bool(re.search(r'\bN[Ii][Ll]\b', row_text))
            if existing.get('name') and existing['name'].endswith(' Nil') and not prereq:
                existing['name'] = existing['name'][:-4].rstrip()
            if name_clean and (not existing.get('name') or len(name_clean) > len(existing['name'])):
                existing['name'] = name_clean
            if prereq and not existing.get('prerequisite'):
                existing['prerequisite'] = prereq
            elif prereq is None and row_has_explicit_nil:
                existing['prerequisite'] = None
            if offered and not existing.get('offered_in'):
                existing['offered_in'] = offered
            if existing.get('category') in (None, '-') and category:
                existing['category'] = category
            if existing.get('section') is None and current_section is not None:
                existing['section'] = current_section
        return False
    seen.add(code)

    units.append({
        'code':          code,
        'name':          name_clean,
        'prerequisite':  prereq,
        'offered_in':    offered,
        'category':      category,
        'is_prescribed': is_prescribed,
        'section':       current_section,
    })
    return True


def extract_units_with_structure(pdf_path):
    units = []
    seen = set()
    current_section = None

    with pdfplumber.open(pdf_path) as pdf:
        legend = detect_colour_legend(pdf)

        for page in pdf.pages:
            words = page.extract_words(x_tolerance=3, y_tolerance=3)
            headers = _extract_line_headers(words)
            right_bound = _detect_content_right(words, page.width)

            for table in page.find_tables():
                tx0, _, tx1, _ = table.bbox
                table_margin = 80
                table_words = [
                    w for w in words
                    if table.bbox[1] - 2 <= w['top'] <= table.bbox[3] + 2
                    and tx0 - 2 <= w['x0'] <= tx1 + table_margin
                ]
                table_text = ' '.join(w['text'] for w in sorted(table_words, key=lambda x: (x['top'], x['x0'])))
                table_right = max([tx1] + [w['x1'] for w in table_words]) + 5 if table_words else tx1
                right = table_right if re.search(r'\bOffered\s+in\b', table_text, re.IGNORECASE) else (
                    min(right_bound, tx1) if tx1 > right_bound else right_bound
                )
                table_year = _closest_header_value(headers, 'year', table.bbox)
                current_semester = _closest_header_value(headers, 'semester', table.bbox)
                has_offered = False

                for row_obj in table.rows:
                    ytop = row_obj.bbox[1] - 1
                    ybottom = row_obj.bbox[3] + 1

                    row_words_all = [
                        w for w in words
                        if w['bottom'] >= ytop and w['top'] <= ybottom
                        and w['x0'] >= tx0 - 2 and w['x0'] < right
                    ]

                    for sub_words in _split_merged_row(row_words_all):
                        cells = _words_to_cells(sub_words, row_obj.cells)
                        if not cells:
                            continue

                        first_text = cells[0][0].strip()
                        row_text = ' '.join(t for t, _ in cells).strip()
                        sem_match = SEMESTER_ROW_RE.match(row_text)
                        if sem_match:
                            current_semester = int(sem_match.group(1))
                            continue

                        term_match = TERM_ROW_RE.match(row_text)
                        if term_match:
                            current_semester = 4 if 'winter' in term_match.group(1).lower() else 3
                            continue

                        if re.match(r'^Elective\s+\d+$', row_text, re.IGNORECASE):
                            units.append({
                                'code': '-',
                                'name': row_text,
                                'prerequisite': None,
                                'offered_in': None,
                                'category': 'elective',
                                'is_prescribed': False,
                                'section': current_section,
                                'year_level': table_year,
                                'semester': current_semester,
                            })
                            continue

                        if re.search(r'\bOffered\s+in\b', row_text, re.IGNORECASE):
                            has_offered = True
                            continue

                        sub_mid_y = sum(
                            (w['top'] + w['bottom']) / 2 for w in sub_words
                        ) / len(sub_words)

                        result = _process_row_cells(
                            cells, page, row_obj.bbox, legend, has_offered,
                            units, seen, current_section,
                            sub_mid_y=sub_mid_y, content_right=right
                        )

                        if isinstance(result, str) and result.startswith("section:"):
                            current_section = result.replace("section:", "")
                            continue

                        if result is True and units:
                            units[-1]['year_level'] = table_year
                            units[-1]['semester'] = current_semester
                            prereq = units[-1].get('prerequisite')
                            if prereq and re.search(r'([&/])\s*$', prereq):
                                extras = []
                                for w in sorted(row_words_all, key=lambda x: (x['top'], x['x0'])):
                                    token = w['text'].strip().upper()
                                    if CODE_RE.match(token) and token != units[-1]['code'] and token not in prereq:
                                        extras.append(token)
                                if extras:
                                    units[-1]['prerequisite'] = (prereq + ' ' + ' '.join(extras)).strip()

    deduped = []
    seen_keys = set()
    for u in units:
        if isinstance(u.get('prerequisite'), str) and re.match(r'^N[Ii][Ll]$', u['prerequisite'].strip()):
            u['prerequisite'] = None
        if isinstance(u.get('name'), str) and u['name'].endswith(' Nil') and u.get('prerequisite') is None:
            u['name'] = u['name'][:-4].rstrip()
        key = (
            u.get('code'),
            u.get('name'),
            u.get('category'),
            u.get('year_level'),
            u.get('semester'),
            u.get('section'),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(u)

    return deduped


def extract_units(pdf_path):
    return extract_units_with_structure(pdf_path)



# ---------------------------
# STEP 4: Elective section grouping
# ---------------------------
def extract_elective_sections(file_path):
    sections = {}
    current  = 'Recommended Elective Units'

    with pdfplumber.open(file_path) as pdf:
        legend = detect_colour_legend(pdf)

        for page in pdf.pages:
            page_words  = page.extract_words(x_tolerance=3, y_tolerance=3)
            right_bound = _detect_content_right(page_words, page.width)

            for table in page.find_tables():
                tx0, _, tx1, _ = table.bbox
                table_margin = 80
                table_words = [
                    w for w in page_words
                    if table.bbox[1] - 2 <= w['top'] <= table.bbox[3] + 2
                    and tx0 - 2 <= w['x0'] <= tx1 + table_margin
                ]
                table_text = ' '.join(w['text'] for w in sorted(table_words, key=lambda x: (x['top'], x['x0'])))
                table_right = max([tx1] + [w['x1'] for w in table_words]) + 5 if table_words else tx1
                right = table_right if re.search(r'\bOffered\s+in\b', table_text, re.IGNORECASE) else (
                    min(right_bound, tx1) if tx1 > right_bound else right_bound
                )

                for row_obj in table.rows:
                    ytop    = row_obj.bbox[1] - 1
                    ybottom = row_obj.bbox[3] + 1
                    row_words_all = [
                        w for w in page_words
                        if w['bottom'] >= ytop and w['top'] <= ybottom
                        and w['x0'] >= tx0 - 2 and w['x0'] < right
                    ]

                    for sub_words in _split_merged_row(row_words_all):
                        cells = _words_to_cells(sub_words, row_obj.cells)
                        if not cells:
                            continue
                        sub_mid_y = (sum((w['top'] + w['bottom']) / 2 for w in sub_words)
                                     / len(sub_words)) if sub_words else None
                        first = cells[0][0].strip()

                        if re.search(r'Recommended\s+Elective', first, re.IGNORECASE):
                            current = 'Recommended Elective Units'
                            continue
                        if re.match(r'Minor\s*\|', first, re.IGNORECASE):
                            current = re.sub(r'\s+', ' ', first).strip()
                            continue

                        code = None
                        for t, bbox in cells:
                            tok = t.split()[0].strip() if t.split() else ''
                            if CODE_RE.match(tok) and bbox[0] < 100:
                                code = tok.upper()
                                break
                        if not code or code.startswith('MPU'):
                            continue

                        colour = (_get_colour_at_y(page, sub_mid_y, content_right=right)
                                  if sub_mid_y else
                                  _get_row_colour(page, row_obj.bbox, content_right=right))
                        if match_category(colour, legend) == 'elective':
                            sections.setdefault(current, [])
                            if code not in sections[current]:
                                sections[current].append(code)

    return sections


def _display_value(value):
    if value is None:
        return "null"
    return str(value)


def format_extracted_planner(pdf_path):
    raw_text = extract_text_from_pdf(pdf_path)
    cleaned_text = clean_text(raw_text)
    metadata = extract_metadata(cleaned_text)
    requirements = extract_requirements(cleaned_text)
    units = extract_units(pdf_path)

    lines = []
    stem = re.sub(r"\.pdf$", "", pdf_path.split("\\")[-1], flags=re.IGNORECASE)
    lines.append(stem.upper())
    lines.append("Course: " + _display_value(metadata.get("course")))
    lines.append("Major: " + _display_value(metadata.get("major")))

    intake = metadata.get("intake")
    intake_year = metadata.get("intakeYear")
    if intake or intake_year:
        lines.append("Intake: " + _display_value(intake) + ", Year: " + _display_value(intake_year))
    else:
        lines.append("Intake: null, Year: null")

    def req_line(label):
        req = requirements.get(label, {})
        return (
            label.capitalize()
            + ": count="
            + _display_value(req.get("count"))
            + ", cp="
            + _display_value(req.get("cp"))
        )

    lines.append("Requirements:")
    lines.append("  " + req_line("core"))
    lines.append("  " + req_line("major"))
    lines.append("  " + req_line("elective"))
    lines.append("  " + req_line("wil"))

    headers = [
        ("YEAR", 4),
        ("SEMESTER", 8),
        ("CATEGORY", 20),
        ("CODE", 9),
        ("NAME", 60),
        ("PREREQUISITE", 50),
        ("OFFERED_IN", 24),
        ("PRESCRIBED", 10),
    ]

    def row_line(char="-"):
        return char * 210

    def format_row(values):
        cells = []
        for (label, width), value in zip(headers, values):
            text = _display_value(value)
            if len(text) > width:
                text = text[: width - 3] + "..."
            cells.append(text.ljust(width))
        return " | ".join(cells)

    lines.append("")
    lines.append(row_line())
    lines.append(format_row([label for label, _ in headers]))
    lines.append(row_line())

    for unit in units:
        lines.append(format_row([
            unit.get("year_level"),
            unit.get("semester"),
            unit.get("category"),
            unit.get("code"),
            unit.get("name"),
            unit.get("prerequisite"),
            unit.get("offered_in"),
            "yes" if unit.get("is_prescribed") else "no",
        ]))

    return "\n".join(lines)


# ---------------------------
# MAIN (standalone test)
# ---------------------------
if __name__ == "__main__":
    import sys
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "test/planner1.pdf"
    formatted = format_extracted_planner(pdf_path)
    safe_text = formatted.encode("cp1252", errors="replace").decode("cp1252")
    print(safe_text)
