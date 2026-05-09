import re
import pdfplumber

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
# This takes two RGB tuples and returns numeric distance because category detection depends on nearest-colour matching across slightly different PDF palettes.
def _colour_dist(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


# This takes raw pdfplumber colour value and returns three-channel RGB tuple because PDFs encode colours inconsistently, so comparisons need one stable shape.
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


# This takes raw colour and optional tag map and returns semantic debug tag because tagged-text inspection needs human-readable colour labels.
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


# This takes pdfplumber page and returns rectangle colour/position records because legend detection must connect text to its actual filled background.
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


# This takes word bbox and rectangle bbox and returns boolean containment because matching words to fills avoids guessing category from nearby colours.
def _word_inside_rect(word, rect, tolerance=1.0):
    return (
        word.get("x0", 0) >= rect["x0"] - tolerance and
        word.get("x1", 0) <= rect["x1"] + tolerance and
        word.get("top", 0) >= rect["top"] - tolerance and
        word.get("bottom", 0) <= rect["bottom"] + tolerance
    )


# This takes one word and page rectangles and returns background colour and tag because debug extraction traces why a word was classified.
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


# This takes PDF path and returns positioned words with colour tags because this helps inspect colour-based extraction failures.
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


# This takes words from one visual line and returns tagged text line because tag switches reveal category changes without losing reading order.
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


# This takes tagged word records and returns page-ordered tagged text because grouped lines are easier to compare with the original PDF.
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


# This takes PDF path and returns colour-tagged debug text because this exposes PDF background evidence without affecting app JSON.
def extract_tagged_text_from_pdf(file_path, colour_map=None, tolerance=0.05):
    word_entries = extract_words_with_background_tags(file_path, colour_map=colour_map, tolerance=tolerance)
    return build_tagged_text_from_words(word_entries)


# This takes page and row midpoint and returns dominant fill colour because row backgrounds carry category meaning more reliably than text labels.
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


# This takes page and row bbox and returns row background colour because table rows classify units by their fill colour.
def _get_row_colour(page, row_bbox, content_right=None):
    mid_y = (row_bbox[1] + row_bbox[3]) / 2
    return _get_colour_at_y(page, mid_y, content_right=content_right)


# This takes page words and width and returns right edge of planner table content because excluding sidebars prevents unrelated codes from merging into rows.
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


# This takes row words and returns words with split unit codes repaired because PDF kerning can split one unit code across tokens.
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


# This takes words from a PDF table row and returns logical sub-rows because some PDFs collapse several visual rows into one table row.
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


# This takes row words and cell bboxes and returns reconstructed text cells because column recovery is needed when pdfplumber merges or misses cells.
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
# This takes open pdfplumber PDF and returns colour-to-category legend because in-document colours are more reliable than hardcoded defaults.
def detect_colour_legend(pdf):
    detected_legend = {}

    # This takes detected colour and category label and returns updated legend because near-duplicate conflicting colours should not destabilise classification.
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


# This takes page words and returns year/semester header records because unit rows often inherit context from nearby headings.
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


# This takes header records and table bbox and returns closest year or semester because tables often omit repeated context in each row.
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


# This takes combined prerequisite/offered text and returns separate prerequisite and offered-in values because PDFs often place both in one cell.
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


def _normalise_semester_number(value):
    sem = int(value)
    return 1 if sem % 2 == 1 else 2


# This takes row colour and legend and returns category label or None because tolerance handles small colour drift between PDFs.
def match_category(colour, legend, tolerance=0.11):
    if not colour or not legend:
        return None
    best_label, best_dist = None, float('inf')
    for known, label in legend.items():
        d = _colour_dist(colour, known)
        if d < best_dist:
            best_dist, best_label = d, label
    return best_label if best_dist <= tolerance else None


# This takes free-text title and returns fallback code-like slug because title-only WIL rows still need a stable identifier.
def _slugify_unit_title(text):
    return re.sub(r'[^A-Z0-9]+', '_', re.sub(r'\s+', ' ', text.upper()).strip()).strip('_')


# This takes unit text and returns a WIL-style boolean because text evidence is the fallback when colour or category detection is weak.
def _looks_like_wil_text(text):
    return bool(re.search(
        r'work-?integrated|industry\s+training|industry\s+placement|professional\s+experience|internship|wil',
        text or '',
        re.IGNORECASE
    ))


# This takes planner text and code and returns a nearby WIL note because WIL prerequisites often live below the main table row.
def _extract_wil_note_for_code(planner_text, code):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return None

    note_parts = []
    found = False
    for idx, line in enumerate(lines):
        line_upper = line.upper()
        if code not in line_upper:
            continue
        lead_match = re.match(rf'^\s*(?:[â€¢\-]\s*)?([A-Z]{{3}}\d{{3,5}})(?:{UNIT_MARKER_RE})?\b', line_upper)
        if not lead_match or lead_match.group(1) != code or code not in line_upper:
            continue
        if not re.search(r'work-?integrated|industry\s+training|industry\s+placement|professional\s+experience|internship|wil|exemption to \d+ electives', line, re.IGNORECASE):
            continue
        found = True
        cleaned = re.sub(rf'^.*?\b{re.escape(code)}(?:{UNIT_MARKER_RE})?\s*', '', line, flags=re.IGNORECASE).strip(' -•')
        if cleaned:
            note_parts.append(cleaned)
        for next_line in lines[idx + 1: idx + 4]:
            if re.search(r'\b[A-Z]{3}\d{3,5}\b', next_line) and code not in next_line.upper():
                break
            if re.search(r'work-?integrated|industry\s+training|industry\s+placement|professional\s+experience|internship|wil|exemption to \d+ electives|optional', next_line, re.IGNORECASE):
                cleaned_next = re.sub(rf'^\s*{re.escape(code)}(?:{UNIT_MARKER_RE})?\s*', '', next_line, flags=re.IGNORECASE)
                cleaned_next = re.sub(r'^[•\-]+\s*', '', cleaned_next).strip()
                if cleaned_next:
                    note_parts.append(cleaned_next)
            else:
                break
        if note_parts:
            break
    if not found or not note_parts:
        return None
    merged = ' - '.join(dict.fromkeys(part.strip(' -') for part in note_parts if part.strip(' -')))
    return re.sub(r'\s+', ' ', merged).strip(' -')


# This takes planner text and a WIL code and returns a cleaned WIL name and prerequisite because WIL rows often mix the title with enrolment notes.
def _extract_wil_context_for_code(planner_text, code):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return None, None

    for idx, line in enumerate(lines):
        line_upper = line.upper()
        lead_match = re.match(rf'^\s*(?:[â€¢\-]\s*)?([A-Z]{{3}}\d{{3,5}})(?:{UNIT_MARKER_RE})?\b', line_upper)
        if not lead_match or lead_match.group(1) != code:
            continue

        base = re.sub(rf'^\s*(?:[â€¢\-]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\s*[-:]*\s*', '', line, flags=re.IGNORECASE).strip(' -')
        base = re.sub(
            r'(Completing\s+Work-Integrated\s+Learning\s+Internship\s+\(equivalent to\s+\d+\s+elective)\b.*$',
            r'\1 units)',
            base,
            flags=re.IGNORECASE
        )
        base = re.sub(r'\s+Introductory Seminar\b.*$', '', base, flags=re.IGNORECASE).strip(' -')
        if not _looks_like_wil_text(base):
            continue

        continuation = []
        for next_line in lines[idx + 1: idx + 5]:
            if re.match(rf'^\s*(?:[â€¢\-]\s*)?[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', next_line, re.IGNORECASE):
                break
            cleaned_next = re.sub(r'^\s*(?:Optional\s*[â€¢\-]?\s*|[â€¢\-]\s*)', '', next_line, flags=re.IGNORECASE).strip()
            if not cleaned_next:
                continue
            if re.search(r'students need to complete at least \d+ units|wil placement can be taken in year|work-?integrated|internship placement|completing\s+wil|exemption to \d+ electives', cleaned_next, re.IGNORECASE):
                continuation.append(cleaned_next)

        if re.search(r'equivalent to \d+\s+elective\s*$', base, re.IGNORECASE):
            base = base + ' units)'

        if re.search(r'exemption to \d+ electives', base, re.IGNORECASE):
            name_parts = [base]
            for part in continuation:
                if part not in name_parts:
                    name_parts.append(part)
            return ' - '.join(name_parts), None

        prereq_parts = []
        for part in continuation:
            lower = part.lower()
            if 'students need to complete' in lower:
                match = re.search(r'(Students need to complete at least \d+ units to enrol(?:l)?)', part, re.IGNORECASE)
                prereq_parts.append(match.group(1) if match else part)
                continue
            if 'wil placement can be taken in year' in lower or 'internship placement' in lower:
                match = re.search(r'((?:WIL internship placement|WIL placement) can be taken in Year\s+(?:One|Two|Three|Four|Five|\d+))', part, re.IGNORECASE)
                prereq_parts.append(match.group(1) if match else part)
        prereq = '; '.join(dict.fromkeys(prereq_parts)) if prereq_parts else None
        return base, prereq

    return None, None


# This takes raw table text and returns single-spaced text because regex recovery needs predictable spacing and separators.
def _normalise_table_text(text):
    return re.sub(r'\s+', ' ', (text or '').replace('|', ' ')).strip()


COURSE_INFO_NOISE_RE = re.compile(
    r'\b(?:Course Information|Core units?|First Major units?|Component units?|Credit Points?|Course)\b.*$',
    re.IGNORECASE
)
NAME_ONLY_TO_RE = re.compile(r'\b(?:only to take if|and pass the units as a)\b.*$', re.IGNORECASE)
MINOR_INVALID_SECTION_RE = re.compile(
    r'combination of|elective units?\s*/\s*second-major|structured set|credit points?|course information|component units?|project\s*/\s*minor|co-major|second-major',
    re.IGNORECASE
)
SIDEBAR_FOOTER_NOISE_RE = re.compile(
    r'Academic Integrity|Training Module|Ministry of Education|recommended for completion|first semester\s*\(Note:|course information|credit points consisting of|students are required|award of their degree|Malaysian students:\s*Must take|International students:\s*Must|prerequisite for the award of|COMPULSORY,\s*non-|credit unit\.|complete as part of your Course|undertake this unit as a refresher|achieve a score of at least|comprised of 10 questions|is compulsory for all engineering students|program\s*\(International and',
    re.IGNORECASE
)


# This takes unit code with planner symbols and returns bare code because matching duplicates should ignore prescribed/honours markers.
def _strip_unit_markers(text):
    return re.sub(rf'{UNIT_MARKER_RE}$', '', str(text or '').strip().upper())


# This takes extracted name candidate and returns cleaned unit name because table noise like Nil, credit points, and term labels should not become names.
def _clean_candidate_name(name):
    name = _normalise_table_text(name)
    name = re.sub(r'\s*\([^()]*\)', '', name)
    name = re.sub(r'\bPrescribed\s+Elective\^?\b', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'\bPrescribed\b$', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'\bPrescribed\b.*\bElective\b.*$', '', name, flags=re.IGNORECASE).strip()
    name = name.replace('^', '').strip()
    name = COURSE_INFO_NOISE_RE.sub('', name).strip()
    name = re.sub(r'\bGeneral Studies\s*/?\s*Mata Pelajaran Umum\b.*$', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'\(\s*only to.*$', '', name, flags=re.IGNORECASE).strip()
    name = NAME_ONLY_TO_RE.sub('', name).strip()
    name = re.sub(r'\bN[Ii][Ll]\b$', '', name).strip(' -|,')
    name = re.sub(r'\b\d+(?:\.\d+)?\s*credit\s+points?\b$', '', name, flags=re.IGNORECASE).strip(' -|,')
    name = re.sub(r'\s+Semester\s+\d+\b.*$', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'\s+(?:Summer|Winter)\s+Term\b.*$', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'\s+(?:Feb/Mar|Aug/Sept)(?:\s+only)?\b.*$', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'\b(?:Degree, Diploma and Foundation|NEW Cohorts pursuing Degree|commencing study period|recommended for optimal alignment with|recommended for completion|a refresher|achieve score of at least 90%|online module that)\b.*$', '', name, flags=re.IGNORECASE).strip(' -|,')
    name = re.sub(r'\s+Elective\s+\d+\b.*$', '', name, flags=re.IGNORECASE).strip()
    return name


# This takes extracted MPU title candidate and returns cleaned MPU name because MPU rows often bleed Nil, [OR], and student-note text into neighbouring titles.
def _clean_mpu_name(name):
    name = _clean_candidate_name(name)
    if not name:
        return name
    name = re.sub(r'\s*\((?:Malaysian|International).*$', '', name, flags=re.IGNORECASE).strip(' -|,')
    name = re.sub(r'\s*\($', '', name).strip(' -|,')
    name = re.sub(r'\s*\bN[Ii][Ll]\b.*$', '', name).strip(' -|,')
    name = re.sub(r'\s*\[\s*OR\s*\].*$', '', name, flags=re.IGNORECASE).strip(' -|,')
    name = re.sub(
        r'\s+\b(?:Malaysian|International)\s+students?\b.*$',
        '',
        name,
        flags=re.IGNORECASE,
    ).strip(' -|,')
    name = re.sub(
        r'\s+\b(?:students?\s+who\s+do\s+not|students?\s+only)\b.*$',
        '',
        name,
        flags=re.IGNORECASE,
    ).strip(' -|,')
    words = name.split()
    if len(words) >= 4:
        half = len(words) // 2
        if len(words) % 2 == 0 and words[:half] == words[half:]:
            name = ' '.join(words[:half])
    name = re.sub(r'\b(\w+(?:\s+\w+){1,6})\s+\1\b', r'\1', name, flags=re.IGNORECASE)
    return _clean_candidate_name(name)


# This takes extracted MPU title candidate and returns corruption status because known MPU noise should trigger recovery from cleaner nearby evidence.
def _looks_corrupted_mpu_name(name):
    name = _normalise_table_text(name)
    if not name:
        return True
    if name.startswith('('):
        return True
    if re.search(r'\bN[Ii][Ll]\b|\[\s*OR\s*\]', name, re.IGNORECASE):
        return True
    if re.search(r'\b(?:Malaysian|International)\b', name, re.IGNORECASE):
        return True
    if re.search(r'\($', name):
        return True
    if re.search(r'Bahasa Melayu credit\)', name, re.IGNORECASE):
        return True
    if re.search(r'Students?\)', name, re.IGNORECASE):
        return True
    words = name.split()
    if len(words) >= 4:
        half = len(words) // 2
        if len(words) % 2 == 0 and words[:half] == words[half:]:
            return True
    return False


# This takes MPU code plus nearby source text and returns canonical MPU name because stable titles should win over wrapped-row contamination.
def _canonical_mpu_name(code, source_text=''):
    code = str(code or '').strip().upper()
    text = _normalise_table_text(source_text)
    if code in ('MPU3272', 'MPU3273'):
        return 'Integrity and Anti-Corruption'
    if code == 'MPU3212':
        return 'Bahasa Kebangsaan A'
    if code in ('MPU3182', 'MPU3183'):
        return 'Penghayatan Etika dan Peradaban'
    if code in ('MPU3192', 'MPU3193'):
        return 'Philosophy and Current Issues'
    if code in ('MPU3412', 'MPU2412'):
        return 'Service Learning'
    if code in ('MPU3142', 'MPU3143'):
        if re.search(r'Bahasa Melayu Komunikasi 2', text, re.IGNORECASE):
            return 'Bahasa Melayu Komunikasi 2'
        return 'Malay Language Communication 2'
    if code == 'MPU2272':
        return 'Kursus Integriti dan Anti Rasuah'
    if code == 'MPU2212':
        return 'Bahasa Kebangsaan A'
    if code == 'MPU2182':
        return 'Penghayatan Etika dan Peradaban'
    if code == 'MPU2132':
        return 'Malay Language Communication 1'
    return None


# This takes extracted prerequisite candidate and returns nullable prerequisite because nil/noise should become None in the app schema.
def _clean_candidate_prereq(prereq):
    prereq = _normalise_table_text(prereq)
    if re.match(r'^N[Ii][Ll]\b', prereq):
        return None
    if re.match(r'^\s*Concurrent\b', prereq, re.IGNORECASE):
        prereq = re.sub(r'^\s*Concurrent\b\s*', 'Concurrent ', prereq, flags=re.IGNORECASE)
    prereq = re.sub(r'\bPrescribed\s+Elective\^?\b', '', prereq, flags=re.IGNORECASE).strip()
    prereq = re.sub(r'\bPrescribed\b', '', prereq, flags=re.IGNORECASE).strip()
    prereq = re.sub(r'^\s*(?:Course Information|Core units?|First Major units?|Component units?|Course)\b.*$', '', prereq, flags=re.IGNORECASE).strip()
    prereq = prereq.replace('^', '').strip()
    prereq = re.sub(r'\(\s*only to take if[^)]*\)', '', prereq, flags=re.IGNORECASE).strip()
    prereq = prereq.strip(' -|,')
    prereq = re.sub(
        r'^([A-Z]{3}\d{3,5})\s+(\d+(?:\.\d+)?\s*c(?:redit\s+points?|p|ps))$',
        r'\1 & \2',
        prereq,
        flags=re.IGNORECASE
    )
    prereq = re.sub(
        r'^\s*(\d+(?:\.\d+)?)\s+\1\s+(credit\s+points?)\s*$',
        r'\1 \2',
        prereq,
        flags=re.IGNORECASE
    )
    prereq = re.sub(r'([A-Z]{3}\d{3,5})/\s+([A-Z]{3}\d{3,5})', r'\1/\2', prereq)
    prereq = re.sub(r'\bN[Ii][Ll]\s+(?:Feb/Mar|Aug/Sept)(?:\s+only|\s*&\s*Aug/Sept)?\b.*$', 'Nil', prereq, flags=re.IGNORECASE).strip()
    prereq = re.sub(r'\b(?:Feb/Mar|Aug/Sept)(?:\s+only)?\b.*$', '', prereq, flags=re.IGNORECASE).strip(' -|,')
    prereq = re.sub(r'\b(?:online module that|articulating from Foundation Studies|are expected to undertake this unit as|recommended for completion|award of their degree|their degree\.|questions and|quiz comprised of)\b.*$', '', prereq, flags=re.IGNORECASE).strip(' -|,;')
    if re.match(r'^N[Ii][Ll]$', prereq):
        return None
    return prereq or None


# This takes collapsed row text and returns parsed code, name, and prerequisite because some PDFs lose column boundaries entirely.
def _parse_compact_code_row(row_text):
    row_text = _normalise_table_text(row_text)
    match = re.match(rf'^(?P<code>[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?)\s+(?P<body>.+)$', row_text)
    if not match:
        return None, None, None

    code = _strip_unit_markers(match.group('code'))
    body = match.group('body').strip()
    split_match = re.search(
        r'\b(?:[A-Z]{3}\d{3,5}\b|\d+(?:\.\d+)?\s*credit\s+points?\b|\d+(?:\.\d+)?cp\b|N[Ii][Ll]\b|Co-req\s*:?)',
        body,
        re.IGNORECASE
    )
    if not split_match:
        return code, _clean_candidate_name(body), None

    title = _clean_candidate_name(body[:split_match.start()])
    prereq = _clean_candidate_prereq(body[split_match.start():])
    if title:
        return code, title, prereq
    return code, None, prereq


# This takes name candidate and returns quality score because cleaner names should win over long noisy row fragments.
def _name_quality_score(name):
    name = _normalise_table_text(name)
    if not name:
        return -10
    penalties = 0
    if re.search(r'\bSemester\s+\d+\b|\b(?:Summer|Winter)\s+Term\b|\b\d{4}\b', name, re.IGNORECASE):
        penalties += 6
    if re.search(r'\bcredit\s+points?\b', name, re.IGNORECASE):
        penalties += 4
    if re.search(r'\bPrescribed Elective\b', name, re.IGNORECASE) or COURSE_INFO_NOISE_RE.search(name):
        penalties += 8
    if re.search(r'\bregistered for the\b|\bcourses will be\b|\bundertake this unit\b', name, re.IGNORECASE):
        penalties += 4
    if re.search(r'\b(?:only to take if|and pass the units as a)\b', name, re.IGNORECASE):
        penalties += 6
    if re.search(r'\b(?:and|or|for|of|to|in|with|the)\s*$', name, re.IGNORECASE):
        penalties += 5
    if len(name.split()) > 12:
        penalties += 2
    return len(name) - penalties


# This takes current and candidate names and returns preferred name because extraction combines multiple evidence sources without overwriting good data.
def _prefer_cleaner_name(current, candidate):
    candidate = _clean_candidate_name(candidate)
    current = _clean_candidate_name(current)
    if not candidate:
        return current
    if not current:
        return candidate
    if candidate == current:
        return current
    if current.startswith(candidate) and len(current) > len(candidate):
        if re.search(r'\b(?:and|or|for|of|to|in|with|the|air|indigenous|services|forces|data)\s*$', candidate, re.IGNORECASE):
            return current
        if _name_quality_score(candidate) + 4 >= _name_quality_score(current):
            return candidate
        return current
    if _name_quality_score(candidate) > _name_quality_score(current):
        return candidate
    return current


# This takes row text plus current fields and returns recovered title because credit-point text can split names from prerequisites.
def _recover_split_title_before_cp(row_text, code, current_name, current_prereq):
    row_text = _normalise_table_text(row_text)
    code = str(code or '').strip().upper()
    current_name = _clean_candidate_name(current_name)
    current_prereq = _clean_candidate_prereq(current_prereq)
    if not row_text or not code or not current_name or not current_prereq:
        return current_name
    if not re.search(r'\b(?:and|or|for|of|to|in|with|the)\s*$', current_name, re.IGNORECASE):
        return current_name

    match = re.match(
        rf'^{re.escape(code)}[*#]?\s+(?P<prefix>.+?)\s+(?P<prcode>[A-Z]{{3}}\d{{3,5}})\s+(?P<mid>.+?)\s+(?P<cp>\d+(?:\.\d+)?\s*(?:c(?:redit\s+points?|p|ps)))\b',
        row_text,
        re.IGNORECASE,
    )
    if not match:
        return current_name

    prereq_code = match.group('prcode').upper()
    mid = _clean_candidate_name(match.group('mid'))
    cp_text = _clean_candidate_prereq(match.group('cp'))
    if not mid or not cp_text or _looks_like_sidebar_footer_noise(mid):
        return current_name

    if len(mid.split()) > 4:
        return current_name
    if not re.match(r'^[A-Z][A-Za-z0-9&/\- ]+$', mid):
        return current_name

    current_codes = re.findall(r'\b[A-Z]{3}\d{3,5}\b', current_prereq or '')
    if prereq_code not in current_codes:
        return current_name
    if not re.search(r'\b\d+(?:\.\d+)?\s*(?:c(?:redit\s+points?|p|ps))\b', current_prereq, re.IGNORECASE):
        return current_name

    return _clean_candidate_name(f'{current_name} {mid}')


# This takes row text plus current fields and returns recovered title because malformed rows can place title text after prereq tokens.
def _recover_trailing_title_after_prereq(row_text, code, current_name, current_prereq):
    row_text = _normalise_table_text(row_text)
    code = str(code or '').strip().upper()
    current_name = _clean_candidate_name(current_name)
    current_prereq = _clean_candidate_prereq(current_prereq)
    if not row_text or not code or not current_name:
        return current_name

    tail = None
    if current_prereq:
        if re.match(r'^N[Ii][Ll]\b', str(current_prereq), re.IGNORECASE):
            nil_match = re.match(rf'^{re.escape(code)}(?:{UNIT_MARKER_RE})?\s+.+?\s+N[Ii][Ll]\s+(?P<tail>.+)$', row_text)
            if nil_match:
                tail = nil_match.group('tail').strip()
        else:
            prereq_pos = row_text.upper().find(str(current_prereq).upper())
            if prereq_pos >= 0:
                tail = row_text[prereq_pos + len(str(current_prereq)):].strip()
    else:
        nil_match = re.match(rf'^{re.escape(code)}(?:{UNIT_MARKER_RE})?\s+.+?\s+N[Ii][Ll]\s+(?P<tail>.+)$', row_text)
        if nil_match:
            tail = nil_match.group('tail').strip()

    if not tail:
        return current_name
    if _looks_like_sidebar_footer_noise(tail):
        return current_name

    tail = re.sub(r'\b(?:complete as part of your Course|credit unit\.|award of their degree|their degree\.|students must take.*|prerequisite for the award of.*)\b.*$', '', tail, flags=re.IGNORECASE).strip(' -|,')
    if re.match(r'^(?:Term|Elective\s+\d+)$', tail, re.IGNORECASE):
        return current_name
    if not tail or len(tail.split()) > 4:
        return current_name
    if not re.match(r'^[A-Z][A-Za-z0-9&/\- ]+$', tail):
        return current_name
    if re.search(r'\bfor\s*$', current_name, re.IGNORECASE) and len(tail.split()) > 1:
        tail = tail.split()[0]
    elif (
        not re.search(r'\b(?:and|or|for|of|to|in|with|the|air|indigenous|services|forces|data)\s*$', current_name, re.IGNORECASE) and
        len(tail.split()) > 2
    ):
        return current_name
    return _clean_candidate_name(f'{current_name} {tail}')


# This takes row text plus current fields and returns recovered title because merged name/prereq rows need boundary repair.
def _recover_title_around_prereq(row_text, code, current_name, current_prereq):
    row_text = _normalise_table_text(row_text)
    code = str(code or '').strip().upper()
    current_name = _clean_candidate_name(current_name)
    current_prereq = _clean_candidate_prereq(current_prereq)
    if not row_text or not code or not current_name or not current_prereq:
        return current_name
    prereq_pos = row_text.upper().find(str(current_prereq).upper())
    if prereq_pos < 0:
        return current_name

    prefix = re.sub(rf'^{re.escape(code)}(?:{UNIT_MARKER_RE})?\s*', '', row_text[:prereq_pos], flags=re.IGNORECASE).strip()
    suffix = row_text[prereq_pos + len(str(current_prereq)):].strip()
    prefix = _clean_candidate_name(prefix)
    suffix = _clean_candidate_name(suffix)
    if not prefix or not suffix:
        return current_name
    if re.match(r'^(?:Term|Elective\s+\d+)$', suffix, re.IGNORECASE):
        return current_name
    if _looks_like_sidebar_footer_noise(suffix) or len(suffix.split()) > 5:
        return current_name
    if not re.match(r'^[A-Z][A-Za-z0-9&/,\-: ]+$', suffix):
        return current_name
    if re.search(r'\bfor\s*$', prefix, re.IGNORECASE) and len(suffix.split()) > 1:
        suffix = suffix.split()[0]
    if current_name in (prefix, suffix) or current_name.startswith(prefix) or current_name.endswith(suffix):
        return _clean_candidate_name(f'{prefix} {suffix}')
    return current_name


# This takes extracted name and returns reordered display name because known WIL patterns can appear backwards after PDF extraction.
def _normalise_reordered_name(name):
    name = _clean_candidate_name(name)
    if not name:
        return name
    repeated_edge = re.match(r'^(\w+)\s+(.+)\s+\1$', name, re.IGNORECASE)
    if repeated_edge:
        return _clean_candidate_name(f"{repeated_edge.group(2)} {repeated_edge.group(1)}")
    reordered_connector = re.match(
        r'^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\s+(.+\b(?:and|or|for|with))$',
        name
    )
    if reordered_connector and len(reordered_connector.group(2).split()) >= 3:
        return _clean_candidate_name(f"{reordered_connector.group(2)} {reordered_connector.group(1)}")
    return name


# This takes code, current prerequisite, and row text and returns safer prerequisite because code-only prereqs need repair without stealing unit names.
def _repair_code_style_prereq_from_row(code, current_prereq, combined_row):
    current = _normalise_table_text(current_prereq)
    combined = _normalise_table_text(combined_row)
    if not combined:
        return current_prereq
    marker_split = re.split(rf'\s{UNIT_MARKER_RE}\s*[A-Z]{{3}}\d{{3,5}}\b', combined, maxsplit=1, flags=re.IGNORECASE)
    if marker_split:
        combined = marker_split[0].strip()
    codes = [c.rstrip('@#') for c in re.findall(r'\b[A-Z]{3}\d{3,5}@?#?\b', combined)]
    codes = [c for c in codes if c != str(code or '').strip().upper()]
    codes = list(dict.fromkeys(codes))
    current_codes = [c.rstrip('@#') for c in re.findall(r'\b[A-Z]{3}\d{3,5}@?#?\b', current)]
    current_codes = list(dict.fromkeys(current_codes))
    if codes and re.search(r'\bPrescribed\b|\^', current, re.IGNORECASE):
        if "/" in combined or "/" in current:
            return "/".join(codes)
        if re.search(r'\band\b', current, re.IGNORECASE) and not re.search(r'\bOR\b', current, re.IGNORECASE):
            return " and ".join(codes)
        if "&" in combined or "&" in current:
            return " & ".join(codes)
        return " OR ".join(codes) if re.search(r"\bOR\b", current, re.IGNORECASE) else " and ".join(codes)
    if not codes or len(codes) <= len(current_codes):
        return current_prereq
    current_noise = current.replace('*', ' ')
    current_noise = re.sub(r'\b(?:OR|AND|Co-req:)\b', ' ', current_noise, flags=re.IGNORECASE)
    current_noise = re.sub(r'[,&/;()]', ' ', current_noise)
    current_noise = re.sub(r'\b[A-Z]{3}\d{3,5}@?#?\b', ' ', current_noise)
    current_noise = re.sub(r'\s+', ' ', current_noise).strip()
    is_code_connector_only = current_noise == ""
    if current and not (_looks_like_truncated_prereq(current) or is_code_connector_only):
        return current_prereq

    trailing_code_match = re.search(r'([&/])\s*([A-Z]{3}\d{3,5})\s*$', combined, re.IGNORECASE)
    if (
        current and trailing_code_match and current_codes and
        len(codes) == len(current_codes) + 1 and
        codes[:-1] == current_codes and
        trailing_code_match.group(2).upper() == codes[-1]
    ):
        connector = trailing_code_match.group(1)
        spacer = "" if connector == "/" else " "
        return current.rstrip() + spacer + connector + codes[-1]

    if current and _looks_like_truncated_prereq(current) and current_noise:
        current_tail = current.rstrip()
        if "/" in combined:
            suffix = "/".join(codes)
        elif "&" in combined and not re.search(r"\bOR\b", combined, re.IGNORECASE):
            suffix = " & ".join(codes)
        else:
            suffix = " OR ".join(codes)
        if current_tail.endswith("&"):
            joiner = " "
        elif current_tail.endswith(("/", "+")):
            joiner = ""
        else:
            joiner = " "
        return current_tail + joiner + suffix

    if "/" in combined:
        connector = "/"
    elif "&" in combined and not re.search(r"\bOR\b", combined, re.IGNORECASE):
        connector = " & "
    elif re.search(r"\bAND\b", combined, re.IGNORECASE) and not re.search(r"\bOR\b", combined, re.IGNORECASE):
        connector = " AND "
    else:
        connector = " OR " if re.search(r"\bOR\b|/", combined, re.IGNORECASE) else " & "
    if connector == "/":
        return "/".join(codes)
    return connector.join(codes)


# This takes one prerequisite-like text value and returns a truncation boolean because partial extraction fragments should not overwrite fuller prerequisite evidence.
def _looks_like_truncated_prereq(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    return bool(re.search(
        r'(?:[&/+]|(?:\bAND\b|\bOR\b)|\bCo-req:\b)\s*$',
        text,
        re.IGNORECASE
    ))


# This takes continuation line and returns boolean because code-only lines should extend prerequisites, not names.
def _looks_like_code_only_continuation(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    if not re.search(r'\b[A-Z]{3}\d{3,5}\b', text):
        return False
    return bool(re.match(r'^[A-Z0-9/&+,\-\s]+$', text))


# This takes row text and returns evidence quality score because richer row evidence should beat header/sidebar noise.
def _row_text_quality_score(text):
    text = _normalise_table_text(text)
    if not text:
        return -100
    score = len(text)
    if '(pre-req:' in text.lower():
        score += 30
    if re.search(r'\bPrescribed\s+Elective\^?\b', text, re.IGNORECASE):
        score += 12
    if re.search(r'work-?integrated|internship placement|students need to complete at least', text, re.IGNORECASE):
        score += 10
    if re.search(r'\bCourse Information\b|\bCredit Points\b|\bCore units?\b|\bFirst Major units?\b|\bComponent units?\b', text, re.IGNORECASE):
        score -= 20
    if re.search(r'International students: Must|take and pass the units as a|their degree', text, re.IGNORECASE):
        score -= 18
    if re.search(r'\bqueries\b$', text, re.IGNORECASE):
        score -= 8
    return score


# This takes planner text and code and returns merged row context because fallback text recovery needs lines around the unit code.
def _extract_combined_row_for_code(planner_text, code, max_follow=3):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return None

    lead_re = re.compile(rf'^\s*(?:[^\w\s]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    next_code_re = re.compile(rf'^\s*(?:[^\w\s]\s*)?[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    stop_re = re.compile(
        r'^\s*(?:Semester\s+\d+|Winter\s+Term|Summer\s+Term|Year\s+(?:One|Two|Three|Four|Five|\d+)|Notes?)\b',
        re.IGNORECASE
    )
    continuation_re = re.compile(
        r'^(?:[&/+]|(?:and|or|co-req:)\b|[A-Z]{3}\d{3,5}\b|Training\b|units\)|Prescribed\b|Elective\^?\b)',
        re.IGNORECASE
    )
    wil_follow_re = re.compile(
        r'students need to complete|wil placement|internship placement|internship as a prerequisite|work-?integrated|industry training|exemption to \d+ electives|completing\s+wil',
        re.IGNORECASE
    )

    candidates = []
    for idx, line in enumerate(lines):
        if not lead_re.match(line):
            continue
        parts = [line]
        appended_follow = 0
        for next_line in lines[idx + 1: idx + 1 + max_follow + 4]:
            if not next_line or stop_re.match(next_line):
                break
            if _looks_like_sidebar_footer_noise(next_line):
                continue
            if next_code_re.match(next_line):
                leading_code = re.match(rf'^\s*(?:[^\w\s]\s*)?([A-Z]{{3}}\d{{3,5}})(?:{UNIT_MARKER_RE})?\b', next_line, re.IGNORECASE)
                if _looks_like_truncated_prereq(' '.join(parts)) and _looks_like_code_only_continuation(next_line):
                    parts.append(next_line)
                    appended_follow += 1
                    if appended_follow >= max_follow:
                        break
                    continue
                if (
                    leading_code and
                    _looks_like_truncated_prereq(' '.join(parts)) and
                    leading_code.group(1).upper() != code
                ):
                    parts.append(leading_code.group(1).upper())
                    break
                if re.match(r'^\s*[&/+]\s*[A-Z]{3}\d{3,5}\b', next_line, re.IGNORECASE):
                    parts.append(next_line)
                    appended_follow += 1
                    if appended_follow >= max_follow:
                        break
                    continue
                break
            if continuation_re.match(next_line) or wil_follow_re.search(next_line):
                current_row_text = ' '.join(parts)
                row_is_wil_like = bool(re.search(
                    r'completing\s+work-?integrated\s+learning|industry(?:\s+training|\s+placement)?|professional\s+experience|internship as a prerequisite|wil placement',
                    current_row_text,
                    re.IGNORECASE
                ))
                if wil_follow_re.search(next_line) and not row_is_wil_like:
                    break
                parts.append(next_line)
                appended_follow += 1
                if appended_follow >= max_follow:
                    break
                continue
            if (
                len(next_line.split()) <= 4 and
                not re.search(r'\b(?:Course Information|Credit Points?|Core units?|First Major units?|Component units?|Minor|General Studies)\b', next_line, re.IGNORECASE) and
                not _looks_like_sidebar_footer_noise(next_line) and
                not re.match(r'^[a-z]+$', next_line)
            ):
                parts.append(next_line)
                appended_follow += 1
                if appended_follow >= max_follow:
                    break
                continue
            break
        candidates.append(' '.join(parts))
    if not candidates:
        return None
    return max(candidates, key=_row_text_quality_score)


# This takes planner text plus a unit code and returns nearby raw lines because final MPU recovery needs short-range context around wrapped unit rows.
def _extract_nearby_lines_for_code(planner_text, code, look_back=2, look_ahead=2):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return None
    lead_re = re.compile(rf'^\s*(?:[^\w\s]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    stop_re = re.compile(
        r'^\s*(?:Semester\s+\d+|Winter\s+Term|Summer\s+Term|Year\s+(?:One|Two|Three|Four|Five|\d+)|Unit Code|Notes?)\b',
        re.IGNORECASE,
    )
    for idx, line in enumerate(lines):
        if not lead_re.match(line):
            continue
        parts = []
        for prev in lines[max(0, idx - look_back):idx]:
            if prev and not stop_re.match(prev) and not re.search(r'\b[A-Z]{3}\d{3,5}\b', prev):
                parts.append(prev)
        parts.append(line)
        for nxt in lines[idx + 1: idx + 1 + look_ahead]:
            if nxt and not stop_re.match(nxt) and not re.search(r'^\s*(?:[^\w\s]\s*)?[A-Z]{3}\d{3,5}\b', nxt, re.IGNORECASE):
                parts.append(nxt)
        return ' '.join(parts).strip()
    return None


# This takes planner text and code and returns year/semester context because table extraction can miss inherited headers.
def _extract_header_context_for_code(planner_text, code):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return None, None

    year_map = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5}
    candidate_indices = []
    for idx, line in enumerate(lines):
        if not re.match(rf'^\s*(?:[^\w\s]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\b', line, re.IGNORECASE):
            continue
        score = _row_text_quality_score(line)
        if _looks_like_sidebar_footer_noise(line):
            score -= 30
        if re.search(r'\bis compulsory\b|\bcompulsory\b.*\bengineering students\b', line, re.IGNORECASE):
            score -= 25
        if re.search(r'\bProfessional Experience\b|\bFinal Year Capstone\b|\bProject\b|\bEngineering\b', line, re.IGNORECASE):
            score += 8
        candidate_indices.append((score, idx))

    if not candidate_indices:
        return None, None

    _, best_idx = max(candidate_indices, key=lambda item: item[0])
    year_value = None
    semester_value = None
    for prev in range(best_idx, -1, -1):
        prev_line = lines[prev]
        year_match = re.match(r'^Year\s+(One|Two|Three|Four|Five|\d+)\b', prev_line, re.IGNORECASE)
        if year_value is None and year_match:
            token = year_match.group(1).upper()
            year_value = year_map.get(token, int(token) if token.isdigit() else None)
        sem_match = SEMESTER_ROW_RE.match(prev_line)
        if semester_value is None and sem_match:
            semester_value = _normalise_semester_number(sem_match.group(1))
        term_match = TERM_ROW_RE.match(prev_line)
        if semester_value is None and term_match:
            semester_value = 4 if 'winter' in term_match.group(1).lower() else 3
        if year_value is not None and semester_value is not None:
            return year_value, semester_value

    return year_value, semester_value


# This takes planner text and code and returns marker-near-code boolean because prescribed markers only matter when attached to the unit.
def _has_prescribed_marker_near_code(planner_text, code, max_follow=8):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return False

    lead_re = re.compile(rf'^\s*(?:[^\w\s]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    next_code_re = re.compile(rf'^\s*(?:[^\w\s]\s*)?[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    saw_prescribed = False
    saw_elective = False

    for idx, line in enumerate(lines):
        if not lead_re.match(line):
            continue
        window = lines[idx: idx + 1 + max_follow]
        window_text = ' '.join(window)
        for offset, next_line in enumerate(window):
            if (
                offset > 0 and next_code_re.match(next_line) and
                not re.search(r'\b(?:and|or|co-req:)\b', window_text, re.IGNORECASE)
            ):
                break
            if re.search(r'\bPrescribed\b', next_line, re.IGNORECASE):
                saw_prescribed = True
            if re.search(r'\bElective\^?\b', next_line, re.IGNORECASE):
                saw_elective = True
            if saw_prescribed and saw_elective:
                return True
        break

    return False


# This takes planner text and code and returns catalog-section boolean because catalog entries should not always become planned units.
def _appears_in_catalog_elective_section(planner_text, code, look_back=4):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code or not re.search(r'\bPrescribed\b', str(planner_text or ''), re.IGNORECASE):
        return False

    lead_re = re.compile(rf'^\s*(?:[^\w\s]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    header_re = re.compile(r'(?:Design|Media|Communication|Motion|Marketing|Minor).*Electives?$', re.IGNORECASE)
    for idx, line in enumerate(lines):
        if not lead_re.match(line):
            continue
        for prev in range(max(0, idx - look_back), idx):
            prev_line = lines[prev]
            if header_re.search(prev_line):
                return True
    return False


# This takes combined WIL row and returns clean WIL name because enrolment notes should not pollute the unit title.
def _extract_clean_wil_name(combined_row):
    text = _normalise_table_text(combined_row)
    if not text:
        return None
    text = re.sub(r'\s*\([^()]*\)', '', text)
    text = re.sub(r'\s*-\s*[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\*?', '', text)
    text = re.sub(
        r'(Completing\s+Work-Integrated\s+Learning\s+Internship\s+\(equivalent to\s+\d+\s+elective)\b.*$',
        r'\1 units)',
        text,
        flags=re.IGNORECASE
    )
    if re.search(r'\bIndustry\s+Training\b', text, re.IGNORECASE):
        return 'Industry Training'
    if re.search(r'\bIndustry\b.*?\bTraining\b.*?\binternship as a prerequisite to graduate\b', text, re.IGNORECASE):
        return 'Industry Training'
    m = re.search(
        r'(Completing\s+Work-Integrated\s+Learning\s+Internship\s+\(equivalent to\s+\d+\s+elective)(?:\s+\w+){0,10}\s+(units\))',
        text,
        re.IGNORECASE
    )
    if m:
        return re.sub(r'\s+', ' ', (m.group(1) + ' ' + m.group(2))).strip()
    m = re.search(
        r'(Completing\s+Work-Integrated\s+Learning\s+Internship(?:\s+\(equivalent to\s+\d+\s+elective\s+units\))?)',
        text,
        re.IGNORECASE
    )
    if m:
        return re.sub(r'\s+', ' ', m.group(1)).strip()
    m = re.search(r'(Work[- ]Integrated Learning Placement(?:\s+Unit)?)', text, re.IGNORECASE)
    if m:
        return re.sub(r'\s+', ' ', m.group(1)).strip()
    return None


# This takes combined WIL row and returns clean WIL prerequisite because the app needs WIL conditions separated from the title.
def _extract_clean_wil_prereq(combined_row):
    text = _normalise_table_text(combined_row)
    if not text:
        return None
    polluted_sentence = re.search(
        r'(Students need to complete \d+\s+months).*?\bTraining\b.*?(internship as a prerequisite to graduate)',
        text,
        re.IGNORECASE
    )
    if polluted_sentence:
        return re.sub(r'\s+', ' ', polluted_sentence.group(1) + ' ' + polluted_sentence.group(2)).strip()
    full_sentence = re.search(
        r'(Students need to complete .*? internship as a prerequisite to graduate)',
        text,
        re.IGNORECASE
    )
    if full_sentence:
        return re.sub(r'\s+', ' ', full_sentence.group(1)).strip()
    parts = []
    units_match = re.search(r'(Students need to complete at least \d+ units to enrol(?:l)?)', text, re.IGNORECASE)
    if units_match:
        parts.append(units_match.group(1))
    placement_match = re.search(
        r'((?:WIL internship placement|WIL placement) can be taken in Year\s+(?:One|Two|Three|Four|Five|\d+))',
        text,
        re.IGNORECASE
    )
    if placement_match:
        parts.append(placement_match.group(1))
    if parts:
        return '; '.join(dict.fromkeys(parts))
    return None


# This takes planner text and code and returns project suffix because project A/B names can be split away from the code row.
def _extract_project_suffix_for_code(planner_text, code):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
    code = str(code or '').strip().upper()
    if not code:
        return None
    lead_re = re.compile(rf'^\s*(?:[•\-]\s*)?{re.escape(code)}(?:{UNIT_MARKER_RE})?\b', re.IGNORECASE)
    for idx, line in enumerate(lines):
        if not lead_re.match(line):
            continue
        for next_line in lines[idx + 1: idx + 4]:
            if re.search(r'\bProject(?:\s+[A-Z])?\b$', next_line, re.IGNORECASE):
                return re.sub(r'\s+', ' ', next_line).strip()
            if re.match(rf'^\s*(?:[•\-]\s*)?[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', next_line, re.IGNORECASE):
                break
        break
    return None


# ---------------------------
# STEP 2: Text + metadata + requirements
# ---------------------------
# This takes PDF path and returns joined page text because metadata and requirement parsing need a plain-text evidence source.
def extract_text_from_pdf(file_path):
    pages = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text.strip())

    return "\n\n".join(pages)


# This takes raw extracted text and returns normalised text because predictable line breaks make regex extraction stable.
def clean_text(text):
    return re.sub(r'\n+', '\n', re.sub(r'\r', '', text)).strip()


# This takes cleaned planner text and returns course, major, intake, and year because planner layouts vary between bachelor and diploma templates.
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


# This takes cleaned planner text and returns requirement counts and credit points because totals usually appear in prose rather than unit tables.
def extract_requirements(text):
    req = {}
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    joined_text = " ".join(lines)

    # This takes one text line and returns credit-point value or None because requirement totals can be on the same line as labels.
    def credit_points_in_line(line):
        m = re.search(r'(\d+(?:\.\d+)?)\s*(?:credit\s+point(?:s)?|cp)\b', line, re.IGNORECASE)
        if m:
            value = float(m.group(1))
            return int(value) if value.is_integer() else value
        return None

    # This takes requirement line index and returns nearby credit-point value because PDFs often wrap count and CP text onto adjacent lines.
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

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
    def nearby_credit_points(line_index, max_lookahead=8):
        found = []
        for offset in range(0, max_lookahead + 1):
            idx = line_index + offset
            if idx >= len(lines):
                break
            value = credit_points_in_line(lines[idx])
            if value is not None:
                found.append(value)
        return found

    requirement_boundary_re = re.compile(
        r'^(?:Year\s+(?:One|Two|Three|Four|Five|\d+)|'
        r'Semester\s+\d+|Winter\s+Term|Summer\s+Term|'
        r'General\s+Studies|Recommended\s+Elective|Minor\s*\||'
        r'Course\s+Information)\b',
        re.IGNORECASE
    )

    # This takes requirement line index and search window and returns closest valid CP because wIL requirement text may be separated from its CP value.
    def nearest_credit_points(line_index, look_back=6, look_ahead=8, upper_bound=50):
        best = None
        for idx in range(max(0, line_index - look_back), min(len(lines), line_index + look_ahead + 1)):
            value = credit_points_in_line(lines[idx])
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

    # This takes requirement line index and returns cP within the same logical block because stopping at boundaries avoids borrowing another section's CP.
    def next_credit_points_in_requirement_block(line_index, max_lookahead=8, upper_bound=50):
        found = []
        for offset in range(0, max_lookahead + 1):
            idx = line_index + offset
            if idx >= len(lines):
                break
            if offset > 0 and requirement_boundary_re.search(lines[idx]):
                break
            value = credit_points_in_line(lines[idx])
            if value is None:
                continue
            if upper_bound is not None and (not isinstance(value, (int, float)) or value > upper_bound):
                continue
            found.append((offset, value))
        if found:
            found.sort(key=lambda item: item[0])
            return found[0][1]
        return None

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
                block_cp = next_credit_points_in_requirement_block(idx, max_lookahead=8, upper_bound=50)
                if block_cp is not None:
                    cp = block_cp
                else:
                    nearest_cp = nearest_credit_points(idx, look_back=2, look_ahead=8, upper_bound=50)
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

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
    def find_requirement_cp(label_pattern, look_ahead=4):
        for idx, line in enumerate(lines):
            if not re.search(label_pattern, line, re.IGNORECASE):
                continue
            same_line_cp = credit_points_in_line(line)
            if same_line_cp is not None:
                return same_line_cp
            block_cp = next_credit_points_in_requirement_block(idx, max_lookahead=look_ahead, upper_bound=300)
            if block_cp is not None:
                return block_cp
        return None

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
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
                cp = credit_points_in_line(line)
                req["core"] = {"count": None, "cp": cp}
                break

    if "major" not in req:
        major_cp = None
        major_count = None
        for idx, line in enumerate(lines):
            if re.search(r'\bFirst\s+Major\s+Units\b', line, re.IGNORECASE):
                major_cp = credit_points_in_line(line) or next_credit_points(idx)
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
                cp = credit_points_in_line(line)
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

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
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

    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
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

    return req


# ---------------------------
# STEP 3: Unit extraction
# ---------------------------
# This takes reconstructed row cells and row evidence and returns unit candidate, section marker, or False because one row may be data, heading, continuation, or noise.
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
    code_inline_name = None
    for idx, (t, bbox) in enumerate(cells):
        tok = t.split()[0].strip() if t.split() else ''
        if CODE_RE.match(tok) and bbox[0] < 100:
            code     = _strip_unit_markers(tok)
            code_pos = idx
            code_inline_name = t[len(tok):].strip(' -')
            break

    if code:
        prefix_before_code = row_text.split(code, 1)[0].strip(' |')
        if prefix_before_code and re.search(
            r'(Semester\s+\d+|Winter\s+Term|Summer\s+Term|Year\s+(?:One|Two|Three|Four|Five|\d+)|Feb/Mar|Aug/Sep|Aug/Sept|\b\d{4}\b)',
            prefix_before_code,
            re.IGNORECASE
        ):
            return False

    if not code:
        # Continuation: extend last unit's name or prereq
        if units:
            last = units[-1]
            if re.search(r'\b[A-Z]{3}\d{3,5}\b', row_text) and not row_text.startswith(last.get('code', '')):
                return False
            if (
                _looks_like_wil_text(row_text) and
                last.get('category') not in ('wil', 'mpu')
            ):
                return False
            if last['code'].startswith('MPU') and not has_offered:
                extra_parts = []
                for nc_text, nc_bbox in cells:
                    if not nc_bbox or len(nc_text) <= 1:
                        continue
                    if SKIP_ROW_RE.match(nc_text):
                        continue
                    extra_parts.append(nc_text)
                if extra_parts:
                    last['name'] = _clean_mpu_name((last['name'] + ' ' + ' '.join(extra_parts)).strip())
            elif not has_offered:
                colour = (_get_colour_at_y(page, sub_mid_y, content_right=content_right)
                          if sub_mid_y is not None else
                          _get_row_colour(page, row_bbox, content_right=content_right))
                if match_category(colour, legend) == last['category']:
                    row_continuation = ' '.join(
                        nc_text.strip() for nc_text, nc_bbox in cells
                        if nc_bbox and len(nc_text.strip()) > 1 and not SKIP_ROW_RE.match(nc_text)
                    ).strip()
                    if (last.get('name') or '').strip().endswith('Industry') and row_continuation.startswith('Training'):
                        last['name'] = 'Industry Training'
                        last['category'] = 'wil'
                        remainder = row_continuation[len('Training'):].strip(' -')
                        if remainder:
                            last['prerequisite'] = (
                                (last.get('prerequisite') or '') + ' ' + remainder
                            ).strip()
                        return False
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
                        if (last.get('name') or '').strip().endswith('Industry') and nc_text.strip() == 'Training':
                            last['name'] = (last['name'] + ' Training').strip()
                            last['category'] = 'wil'
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
    if code_inline_name:
        name = code_inline_name
    for idx in range(code_pos + 1, len(cells)):
        t = cells[idx][0].strip()
        if len(t) > 2:
            if code_inline_name and t.startswith('-'):
                continue
            tokens, trimmed = t.split(), []
            for tok in tokens:
                if CODE_RE.match(tok) and trimmed:
                    break
                trimmed.append(tok)
            if not name:
                name = ' '.join(trimmed).strip()
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
    if code_inline_name and prereq_raw is None:
        desc_parts = []
        for idx in range(code_pos + 1, len(cells)):
            t = cells[idx][0].strip()
            if len(t) > 1:
                desc_parts.append(t.strip('- ').strip())
        if desc_parts:
            prereq_raw = ' '.join(desc_parts)

    # Category from colour (restricted to content area to avoid sidebar bleed)
    colour   = (_get_colour_at_y(page, sub_mid_y, content_right=content_right)
                if sub_mid_y is not None else
                _get_row_colour(page, row_bbox, content_right=content_right))
    category = match_category(colour, legend)

    is_prescribed = bool(name and '*' in name)
    name_clean    = (name or '').replace('*', '').strip()
    if name_clean.startswith('- '):
        name_clean = name_clean[2:].strip()
    if re.search(r'\bPrescribed\s+Elective\^?\b', row_text, re.IGNORECASE):
        is_prescribed = True
        name_clean = re.sub(r'\bPrescribed\s+Elective\^?\b', '', name_clean, flags=re.IGNORECASE).strip(' -|,')

    prereq = prereq_raw.strip() if prereq_raw else None
    offered = None
    if prereq is not None:
        prereq, offered = _split_prereq_and_offered(prereq)
    prereq = _clean_candidate_prereq(prereq)

    combined_wil_text = re.sub(r'\s+', ' ', ' '.join(
        part for part in (row_text, name_clean or '', prereq or '')
        if part
    )).strip()
    internship_match = re.search(
        r'(Students need to complete .*?(?:-\s*)?(?:Training\s+)?internship as a prerequisite to graduate)',
        combined_wil_text,
        re.IGNORECASE
    )

    if (
        re.search(r'industry\s+training', combined_wil_text, re.IGNORECASE) or
        re.search(r'work integrated learning|work-?integrated learning|wil placement|exemption to \d+ electives', combined_wil_text, re.IGNORECASE) or
        (
            (name_clean or '').startswith('Industry') and
            internship_match
        )
    ):
        category = 'wil'
        if re.search(r'work integrated learning|work-?integrated learning', combined_wil_text, re.IGNORECASE):
            name_clean = 'Work Integrated Learning Placement'
            prereq = None
        else:
            name_clean = 'Industry Training'
        if internship_match:
            prereq = internship_match.group(1).strip()
        else:
            desc_match = re.search(r'industry\s+training\s+(.*)$', row_text, re.IGNORECASE)
            if desc_match:
                desc = re.sub(r'\s+', ' ', desc_match.group(1)).strip(' -')
                if desc:
                    prereq = desc

    if code.startswith('MPU'):
        category = 'mpu'
    elif (
        code.startswith('ICT') or
        re.search(r'industry\s+training', row_text, re.IGNORECASE) or
        re.search(r'industry\s+training|work integrated learning|work-?integrated learning|wil placement|exemption to \d+ electives', name_clean or '', re.IGNORECASE)
    ) and (
        category == 'wil' or
        re.search(r'work-?integrated|industry\s+training|WIL|placement|exemption to \d+ electives', row_text, re.IGNORECASE) or
        re.search(r'work-?integrated|industry\s+training|WIL|placement|exemption to \d+ electives', name_clean or '', re.IGNORECASE)
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


# This takes PDF path and returns deterministic units with year/semester/category context because the structure service needs raw facts before schema normalisation.
def extract_units_with_structure(pdf_path):
    units = []
    seen = set()
    current_section = None
    planner_text = clean_text(extract_text_from_pdf(pdf_path))
    honours_mode = '(Honours)' in planner_text
    diploma_mode = bool(re.search(r'\bDiploma of\b', planner_text, re.IGNORECASE))
    business_accounting_mode = bool(
        re.search(r'Bachelor of Business\s*\(Accounting\)', planner_text, re.IGNORECASE)
    )
    design_mode = bool(
        re.search(r'Bachelor of Design\b', planner_text, re.IGNORECASE)
    )
    requirements = extract_requirements(planner_text)
    elective_target_count = requirements.get('elective', {}).get('count')
    engineering_mode = bool(
        re.search(r'Bachelor of Engineering\b', planner_text, re.IGNORECASE)
    )
    mpu_name_fallbacks = {
        'MPU2272': 'Kursus Integriti dan Anti Rasuah (Malaysian & International students)',
        'MPU2212': 'Bahasa Kebangsaan A (Malaysian students who do not have SPM Bahasa Melayu credit)',
        'MPU2182': 'Penghayatan Etika dan Peradaban (Malaysian Students Only)',
        'MPU2132': 'Malay Language Communication 1 (International Students Only)',
    }

    # This takes unit code and returns existing unit dict or None because fallback rows should enrich existing units instead of duplicating them.
    def find_unit(code):
        return next((u for u in units if u.get('code') == code), None)

    # This takes row text and returns boolean because repeated headers and prose should not become unit data.
    def row_contains_header_noise(text):
        return bool(re.search(
            r'^\|?\s*(?:Semester\s+\d+|Winter\s+Term|Summer\s+Term)|\bregistered for the\b|\bcourses will be\b|\bundertake this unit\b',
            text or '',
            re.IGNORECASE
        ))

    # This takes row text and category and returns core-support boolean because fallback category repair needs text evidence when colour is missing.
    def row_supports_core(row_text, category):
        if category == 'core':
            return True
        return bool(re.search(r'\bFoundation\s+Studies\b', row_text or '', re.IGNORECASE))

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
                table_year = _closest_header_value(headers, 'year', table.bbox, max_vertical_gap=140)
                current_semester = _closest_header_value(headers, 'semester', table.bbox, max_vertical_gap=140)
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
                            current_semester = _normalise_semester_number(sem_match.group(1))
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
                        row_year = _closest_header_value(headers, 'year', row_obj.bbox, max_vertical_gap=180) or table_year
                        row_semester = _closest_header_value(headers, 'semester', row_obj.bbox, max_vertical_gap=180) or current_semester

                        result = _process_row_cells(
                            cells, page, row_obj.bbox, legend, has_offered,
                            units, seen, current_section,
                            sub_mid_y=sub_mid_y, content_right=right
                        )

                        if isinstance(result, str) and result.startswith("section:"):
                            current_section = result.replace("section:", "")
                            continue

                        if result is True and units:
                            units[-1]['year_level'] = row_year
                            units[-1]['semester'] = row_semester
                            prereq = units[-1].get('prerequisite')
                            if prereq and re.search(r'([&/])\s*$', prereq):
                                extras = []
                                for w in sorted(row_words_all, key=lambda x: (x['top'], x['x0'])):
                                    raw_token = w['text'].strip()
                                    token = raw_token.upper()
                                    if re.match(r'^/(?:[A-Z]{3}\d{3,5})(?:/(?:[A-Z]{3}\d{3,5}))*$', token):
                                        extras.append(raw_token)
                                        continue
                                    if re.match(r'^(?:[A-Z]{3}\d{3,5})/(?:[A-Z]{3}\d{3,5})(?:/(?:[A-Z]{3}\d{3,5}))*$', token):
                                        if token not in prereq.upper():
                                            extras.append(raw_token)
                                        continue
                                    if CODE_RE.match(token) and token != units[-1]['code'] and token not in prereq:
                                        extras.append(raw_token)
                                if extras:
                                    rebuilt = prereq
                                    for extra in extras:
                                        if extra.startswith('/'):
                                            rebuilt += extra
                                        else:
                                            if rebuilt.endswith('&') and not rebuilt.endswith('& '):
                                                rebuilt += ' '
                                            rebuilt += ' ' + extra
                                    units[-1]['prerequisite'] = rebuilt.strip()

                if diploma_mode or business_accounting_mode or design_mode or engineering_mode:
                    fallback_semester = _closest_header_value(headers, 'semester', table.bbox, max_vertical_gap=140)
                    fallback_year = _closest_header_value(headers, 'year', table.bbox, max_vertical_gap=140)
                    fallback_rows = table.extract() or []
                    for row_obj, raw_row in zip(table.rows, fallback_rows):
                        cleaned = [_normalise_table_text(cell) for cell in (raw_row or [])]
                        non_empty = [cell for cell in cleaned if cell]
                        if not non_empty:
                            continue
                        row_text = ' '.join(non_empty).strip()
                        row_year = _closest_header_value(headers, 'year', row_obj.bbox, max_vertical_gap=180) or fallback_year
                        row_semester = _closest_header_value(headers, 'semester', row_obj.bbox, max_vertical_gap=180) or fallback_semester
                        bbox_words = [
                            w for w in words
                            if w['bottom'] >= row_obj.bbox[1] - 1 and w['top'] <= row_obj.bbox[3] + 1
                            and w['x0'] >= tx0 - 2 and w['x0'] < right
                        ]
                        bbox_row_text = ' '.join(w['text'] for w in sorted(bbox_words, key=lambda x: (x['top'], x['x0']))).strip()
                        sem_match = SEMESTER_ROW_RE.match(row_text)
                        if sem_match:
                            fallback_semester = _normalise_semester_number(sem_match.group(1))
                            continue
                        term_match = TERM_ROW_RE.match(row_text)
                        if term_match:
                            fallback_semester = 4 if 'winter' in term_match.group(1).lower() else 3
                            continue
                        if SKIP_ROW_RE.match(non_empty[0]):
                            continue

                        code = None
                        title = None
                        prereq = None
                        category = None
                        code_token = non_empty[0].split()[0].strip() if non_empty[0].split() else ''
                        if CODE_RE.match(code_token):
                            code = _strip_unit_markers(code_token)
                            prefix_before_code = bbox_row_text.split(code, 1)[0].strip(' |') if code in bbox_row_text else ''
                            if prefix_before_code and re.search(
                                r'(Semester\s+\d+|Winter\s+Term|Summer\s+Term|Year\s+(?:One|Two|Three|Four|Five|\d+)|Feb/Mar|Aug/Sep|Aug/Sept|\b\d{4}\b)',
                                prefix_before_code,
                                re.IGNORECASE
                            ):
                                continue
                            if len(non_empty) == 1:
                                _, title, prereq = _parse_compact_code_row(non_empty[0])
                            else:
                                title = _clean_candidate_name(non_empty[1] if len(non_empty) > 1 else '')
                                prereq = _clean_candidate_prereq(non_empty[-1] if len(non_empty) > 2 else None)
                            colour = _get_row_colour(page, row_obj.bbox, content_right=right)
                            category = match_category(colour, legend)
                        elif (
                            row_year is not None and
                            re.match(r'^(Industry\s+Training|Industry\s+Placement|Professional\s+Experience|WIL\s+Placement)\b', non_empty[0], re.IGNORECASE)
                        ):
                            title = _clean_candidate_name(non_empty[0])
                            code = _slugify_unit_title(title)
                            prereq_candidates = [_clean_candidate_prereq(cell) for cell in non_empty[1:]]
                            prereq_candidates = [cell for cell in prereq_candidates if cell]
                            prereq = prereq_candidates[0] if prereq_candidates else None
                            category = 'wil'

                        if not code or not title:
                            continue

                        if code.startswith('MPU'):
                            category = 'mpu'
                        elif _looks_like_wil_text(' '.join(part for part in [title, prereq] if part)):
                            category = 'wil'
                        elif category is None and row_supports_core(row_text, category):
                            category = 'core'

                        existing = find_unit(code)
                        if existing:
                            row_has_explicit_nil = bool(re.search(r'\bN[Ii][Ll]\b', row_text))
                            if title:
                                existing['name'] = _prefer_cleaner_name(existing.get('name'), title)
                            if prereq and (not existing.get('prerequisite') or row_contains_header_noise(existing.get('name'))):
                                existing['prerequisite'] = prereq
                            elif prereq is None and row_has_explicit_nil:
                                existing['prerequisite'] = None
                            if existing.get('category') in (None, '-', 'elective') and category:
                                if existing.get('category') != 'elective' or category in ('core', 'wil', 'major'):
                                    existing['category'] = category
                            if existing.get('year_level') is None and row_year is not None:
                                existing['year_level'] = row_year
                            if (existing.get('semester') is None or existing.get('category') == 'wil') and row_semester is not None:
                                existing['semester'] = row_semester
                            continue

                        if row_contains_header_noise(row_text) and not code.startswith('MPU'):
                            continue

                        seen.add(code)
                        units.append({
                            'code': code,
                            'name': title,
                            'prerequisite': prereq,
                            'offered_in': None,
                            'category': category,
                            'is_prescribed': False,
                            'section': current_section,
                            'year_level': row_year,
                            'semester': row_semester,
                        })

    deduped = []
    seen_keys = set()
    planner_text_single = re.sub(r'\s+', ' ', planner_text)
    for u in units:
        combined_row = _extract_combined_row_for_code(planner_text, u.get('code'))
        ctx_year, ctx_semester = _extract_header_context_for_code(planner_text, u.get('code'))
        has_prescribed_marker = _has_prescribed_marker_near_code(planner_text, u.get('code'))
        in_catalog_elective_section = _appears_in_catalog_elective_section(planner_text, u.get('code'))
        if isinstance(u.get('prerequisite'), str) and re.search(r'\bN[Ii][Ll]\b', u['prerequisite'].strip()):
            u['prerequisite'] = None
        if isinstance(u.get('prerequisite'), str):
            u['prerequisite'] = re.sub(
                r'^([A-Z]{3}\d{3,5})\s+(\d+(?:\.\d+)?\s*c(?:redit\s+points?|p|ps))$',
                r'\1 & \2',
                u['prerequisite'],
                flags=re.IGNORECASE
            )
        if isinstance(u.get('name'), str) and u['name'].endswith(' Nil') and u.get('prerequisite') is None:
            u['name'] = u['name'][:-4].rstrip()
        if (
            (has_prescribed_marker or in_catalog_elective_section) and
            not str(u.get('code', '')).startswith('MPU') and
            u.get('category') in (None, 'elective', 'prescribed_elective')
        ):
            u['category'] = 'prescribed_elective'
            u['name'] = _clean_candidate_name(u.get('name'))
            u['prerequisite'] = _clean_candidate_prereq(u.get('prerequisite'))
        if combined_row:
            row_code, row_title, row_prereq = _parse_compact_code_row(combined_row)
            if re.search(r'\bN[Ii][Ll]\b', combined_row) and re.search(r'credit points?\)|COMPULSORY, non-|credit unit\.', combined_row, re.IGNORECASE):
                row_prereq = None
                if re.search(r'\bN[Ii][Ll]\b', combined_row):
                    u['prerequisite'] = None
            recovered_row_title = _recover_split_title_before_cp(
                combined_row,
                u.get('code'),
                row_title or u.get('name'),
                u.get('prerequisite') or row_prereq,
            )
            recovered_row_title = _recover_trailing_title_after_prereq(
                combined_row,
                u.get('code'),
                recovered_row_title or row_title or u.get('name'),
                u.get('prerequisite') or row_prereq,
            )
            recovered_row_title = _recover_title_around_prereq(
                combined_row,
                u.get('code'),
                recovered_row_title or row_title or u.get('name'),
                u.get('prerequisite') or row_prereq,
            )
            if recovered_row_title:
                row_title = recovered_row_title
            row_has_prescribed_marker = bool(re.search(r'\bPrescribed\s+Elective\^?\b', combined_row, re.IGNORECASE))
            current_code_count = len(re.findall(r'\b[A-Z]{3}\d{3,5}\b', str(u.get('prerequisite') or '')))
            repaired_code_prereq = _repair_code_style_prereq_from_row(
                u.get('code'),
                u.get('prerequisite'),
                combined_row,
            )
            repaired_code_count = len(re.findall(r'\b[A-Z]{3}\d{3,5}\b', str(repaired_code_prereq or '')))
            has_connector_led_code = bool(re.search(r'[&/+]\s*[A-Z]{3}\d{3,5}\b', combined_row or '', re.IGNORECASE))
            if row_title:
                if (
                    not u.get('name') or
                    row_contains_header_noise(u.get('name')) or
                    str(u.get('name') or '').startswith(row_title) or
                    str(row_title).startswith(str(u.get('name') or '')) or
                    _name_quality_score(row_title) > _name_quality_score(str(u.get('name') or '')) + 2
                ):
                    u['name'] = _prefer_cleaner_name(u.get('name'), row_title)
            if combined_row and '(pre-req:' in combined_row.lower() and isinstance(u.get('name'), str):
                u['name'] = re.sub(r'\s*\(pre-req:\s*$', '', u['name'], flags=re.IGNORECASE).strip()
            if (
                repaired_code_prereq and
                repaired_code_prereq != u.get('prerequisite') and
                not re.search(r'\bN[Ii][Ll]\b', combined_row or '') and
                  (
                      not u.get('prerequisite') or
                      _looks_like_truncated_prereq(u.get('prerequisite')) or
                      current_code_count == 0 or
                      (has_connector_led_code and repaired_code_count > current_code_count)
                  )
              ):
                  u['prerequisite'] = repaired_code_prereq
            if row_prereq and not re.match(r'^N[Ii][Ll]\b', row_prereq) and (
                not u.get('prerequisite') or
                _looks_like_truncated_prereq(u.get('prerequisite'))
            ):
                if (
                    not re.search(r'\b(?:questions?\b|quiz\b|module\b|week\s+\d+|commencing study period)\b', row_prereq, re.IGNORECASE) and
                    not _looks_like_sidebar_footer_noise(row_prereq)
                ):
                    u['prerequisite'] = row_prereq
            if (
                isinstance(u.get('prerequisite'), str) and
                '(pre-req:' in combined_row.lower() and
                '+' in combined_row and
                re.fullmatch(r'(?:[A-Z]{3}\d{3,5})(?:\s*&\s*[A-Z]{3}\d{3,5})+', u['prerequisite'])
            ):
                u['prerequisite'] = ' and '.join(part.strip() for part in u['prerequisite'].split('&'))
            if (row_has_prescribed_marker or in_catalog_elective_section) and not str(u.get('code', '')).startswith('MPU'):
                u['category'] = 'prescribed_elective'
                u['name'] = _clean_candidate_name(u.get('name'))
                u['prerequisite'] = _clean_candidate_prereq(u.get('prerequisite'))
            wil_name_from_row = _extract_clean_wil_name(combined_row)
            wil_prereq_from_row = _extract_clean_wil_prereq(combined_row)
            explicit_wil_row = bool(
                re.search(
                    r'completing\s+work-?integrated\s+learning|industry\s+training|industry\s+placement|professional\s+experience|internship as a prerequisite|wil placement',
                    combined_row,
                    re.IGNORECASE
                )
            )
            if wil_name_from_row and (
                u.get('category') == 'wil' or
                _looks_like_wil_text(u.get('name')) or
                _looks_like_wil_text(u.get('prerequisite')) or
                explicit_wil_row and str(u.get('code', '')).startswith(('ICT', 'BUS', 'CSS', 'EAT'))
            ):
                u['category'] = 'wil'
                u['name'] = wil_name_from_row
            if wil_prereq_from_row and (
                u.get('category') == 'wil' or explicit_wil_row
            ):
                u['prerequisite'] = wil_prereq_from_row
        if honours_mode:
            if isinstance(u.get('name'), str):
                u['name'] = u['name'].replace('*', '').strip()
            u['is_prescribed'] = False
            if u.get('category') == 'prescribed_elective':
                u['category'] = 'elective'
            if (
                u.get('year_level') == 1 and
                u.get('category') == 'major' and
                str(u.get('code', '')).startswith(('ENG', 'COS', 'MTH', 'PHY'))
            ):
                u['category'] = 'core'
        if (
            isinstance(u.get('name'), str) and
            u['name'].startswith('Industry') and
            'internship as a prerequisite to graduate' in u['name'].lower()
        ):
            combined_prereq = re.sub(r'\s+', ' ', ' '.join(
                part for part in [u.get('prerequisite'), u.get('name')]
                if part
            )).strip()
            internship_match = re.search(
                r'(Students need to complete .*?(?:-\s*)?(?:Training\s+)?internship as a prerequisite to graduate)',
                combined_prereq,
                re.IGNORECASE
            )
            u['category'] = 'wil'
            u['name'] = 'Industry Training'
            if 'internship as a prerequisite to graduate' in combined_prereq.lower():
                u['prerequisite'] = 'Students need to complete 3 months internship as a prerequisite to graduate'
            elif internship_match:
                u['prerequisite'] = internship_match.group(1).replace('- Training ', ' ').strip()
        if u.get('category') == 'wil' and isinstance(u.get('prerequisite'), str):
            wil_phrase = re.search(
                r'(Students need to complete .*? internship as a prerequisite(?:\s+to)?(?:\s+\w+){0,4}\s+graduate)',
                planner_text_single,
                re.IGNORECASE
            )
            if wil_phrase and (
                u['prerequisite'].endswith(' prerequisite to') or
                'graduate' not in u['prerequisite'].lower()
            ):
                phrase = re.sub(r'\bYear\s+(?:One|Two|Three|Four|Five|\d+)\b', '', wil_phrase.group(1), flags=re.IGNORECASE)
                u['prerequisite'] = re.sub(r'\s+', ' ', phrase).strip()
            elif u['prerequisite'].strip().lower().endswith('prerequisite to'):
                u['prerequisite'] = u['prerequisite'].strip() + ' graduate'
            graduate_cut = re.search(r'^(.*?\bgraduate)\b', u['prerequisite'], re.IGNORECASE)
            if graduate_cut:
                u['prerequisite'] = graduate_cut.group(1).strip()
        if u.get('code') in mpu_name_fallbacks:
            fallback_name = mpu_name_fallbacks[u['code']]
            current_name = str(u.get('name') or '')
            has_other_mpu_title = any(
                other_name != fallback_name and other_name in current_name
                for other_name in mpu_name_fallbacks.values()
            )
            if (
                not current_name or
                len(current_name) < len(fallback_name) or
                _looks_corrupted_mpu_name(current_name) or
                has_other_mpu_title
            ):
                u['name'] = fallback_name
        if (
            ctx_year is not None and
            u.get('year_level') is None and
            u.get('category') in ('core', 'major', 'wil', 'prescribed_elective')
        ):
            u['year_level'] = ctx_year
        if (
            ctx_semester is not None and
            (u.get('semester') is None or u.get('category') == 'wil') and
            u.get('category') in ('core', 'major', 'wil', 'prescribed_elective')
        ):
            u['semester'] = ctx_semester
        if u.get('category') == 'elective' and u.get('offered_in'):
            u['year_level'] = None
            u['semester'] = None
        if u.get('year_level') is None and isinstance(u.get('semester'), int) and u['semester'] > 0:
            u['year_level'] = max(1, (u['semester'] + 1) // 2)
        if str(u.get('code', '')).startswith('MPU') and isinstance(u.get('name'), str):
            u['name'] = re.sub(r'\s+Semester\s+[A-Za-z/]+\s+\d{4}.*$', '', u['name']).strip()
            u['name'] = re.sub(
                r'\b(?:Year\s+(?:One|Two|Three|Four|Five|\d+)|Optional|WIL placement|Students\s+\w+)\b.*$',
                '',
                u['name'],
                flags=re.IGNORECASE
            ).strip(' -')
            u['name'] = _clean_mpu_name(u['name'])
        if isinstance(u.get('name'), str):
            if re.search(r'\bConcurrent\b$', u['name'], re.IGNORECASE):
                u['name'] = re.sub(r'\s*\bConcurrent\b$', '', u['name'], flags=re.IGNORECASE).strip()
                if isinstance(u.get('prerequisite'), str) and not re.match(r'^\s*Concurrent\b', u['prerequisite'], re.IGNORECASE):
                    u['prerequisite'] = ('Concurrent ' + u['prerequisite']).strip()
            project_suffix = _extract_project_suffix_for_code(planner_text, u.get('code'))
            if project_suffix and not re.search(rf'\b{re.escape(project_suffix)}\b$', u['name'], re.IGNORECASE):
                u['name'] = (u['name'] + ' ' + project_suffix).strip()
            if re.search(rf'\b[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', u['name']) and not str(u.get('code', '')).startswith('MPU'):
                other_code_match = re.search(rf'\b([A-Z]{{3}}\d{{3,5}})(?:{UNIT_MARKER_RE})?\b', u['name'])
                if other_code_match and other_code_match.group(1) != str(u.get('code', '')).upper():
                    u['name'] = u['name'].split(other_code_match.group(1), 1)[0].strip(' -')
            u['name'] = re.sub(r'\b(?:All commencing students|Business courses will be automatically|required to complete a quiz.*|Students are encouraged.*|they want to enrol.*)\b.*$', '', u['name'], flags=re.IGNORECASE).strip(' -')
            u['name'] = re.sub(r'\s+\d+(?:\.\d+)?\s*CPs?\b.*$', '', u['name'], flags=re.IGNORECASE).strip(' -')
            u['name'] = re.sub(r'\s+Introductory Seminar\b.*$', '', u['name'], flags=re.IGNORECASE).strip(' -')
            u['name'] = re.sub(r'\s+Training Module\b.*$', '', u['name'], flags=re.IGNORECASE).strip(' -')
            seminar_tail = re.search(
                r'^(.*?Professional Experience.*?)(?:#?\s*Introductory Seminar.*)$',
                u['name'],
                re.IGNORECASE
            )
            if seminar_tail:
                u['name'] = seminar_tail.group(1).strip()
            u['name'] = re.sub(r'\b(\w+)(?:\s+\1)+\b', r'\1', u['name']).replace('*', '').strip()
            u['name'] = _normalise_reordered_name(u['name'])
            u['name'] = re.sub(r'\s*-\s*Design$', '', u['name'], flags=re.IGNORECASE).strip()
            if len(u['name'].split()) >= 3 and re.search(r'\b[a-z]{3,}\b$', u['name']) and not re.search(r'\b(?:and|or|of|in|to|for|with)\b$', u['name']):
                u['name'] = re.sub(r'\s+[a-z]{3,}$', '', u['name']).strip()
            u['name'] = re.sub(
                r'^([A-Za-z&/()]+)\s+Professional Experience in$',
                r'Professional Experience in \1',
                u['name']
            ).strip()
            u['name'] = re.sub(r'\bEolution\b', 'Evolution', u['name']).strip()
            u['name'] = _clean_candidate_name(u['name'])
            if str(u.get('code', '')).startswith('MPU'):
                nearby_mpu_text = _extract_nearby_lines_for_code(planner_text, u.get('code'))
                canonical_mpu_name = _canonical_mpu_name(
                    u.get('code'),
                    ' '.join(part for part in [nearby_mpu_text or '', combined_row or '', u.get('name') or ''] if part),
                )
                if canonical_mpu_name and (
                    len(u['name']) < len(canonical_mpu_name) or
                    _looks_corrupted_mpu_name(u['name']) or
                    canonical_mpu_name in mpu_name_fallbacks.values()
                ):
                    u['name'] = canonical_mpu_name
        if isinstance(u.get('prerequisite'), str):
            u['prerequisite'] = re.sub(r'\b(?:All commencing students|Business courses will be automatically)\b.*$', '', u['prerequisite'], flags=re.IGNORECASE).strip(' -')
            u['prerequisite'] = re.sub(r'^(\d+(?:\.\d+)?\s*Credit\s+Points?)\b.*?(?:Elective\s+\d+.*|award of their degree.*)$', r'\1', u['prerequisite'], flags=re.IGNORECASE)
            repeated_cp = re.match(r'^(\d+(?:\.\d+)?\s*CPs?)\b.*\b\1$', u['prerequisite'], re.IGNORECASE)
            if repeated_cp:
                u['prerequisite'] = repeated_cp.group(1)
            u['prerequisite'] = re.sub(r'^\s*(\d+(?:\.\d+)?)\s+\1\s+(credit\s+points?)\s*$', r'\1 \2', u['prerequisite'], flags=re.IGNORECASE)
            u['prerequisite'] = re.sub(r'([A-Z]{3}\d{3,5})/\s+([A-Z]{3}\d{3,5})', r'\1/\2', u['prerequisite'])
            if re.match(r'^Elective(?:\b.*)?$', u['prerequisite'], re.IGNORECASE):
                u['prerequisite'] = None
            elif (
                u.get('category') != 'wil' and
                not re.search(r'\b(?:[A-Z]{3}\d{3,5}|\d+(?:\.\d+)?\s*c(?:p|ps|redit\s+points?))\b', u['prerequisite'], re.IGNORECASE)
            ):
                u['prerequisite'] = None
        wil_name, wil_prereq = _extract_wil_context_for_code(planner_text, u.get('code'))
        wil_note = _extract_wil_note_for_code(planner_text, u.get('code'))
        if u.get('category') == 'wil' and wil_name:
            u['category'] = 'wil'
            current_name = str(u.get('name') or '')
            better_wil_name = (
                not current_name or
                re.search(r'\b(?:Students need|articulating from Foundation Studies|expected to undertake|online module)\b', current_name, re.IGNORECASE) or
                (
                    re.search(r'\b(Completing|exemption to \d+ electives)\b', wil_name, re.IGNORECASE) and
                    not re.search(r'\b(Completing|exemption to \d+ electives)\b', current_name, re.IGNORECASE)
                ) or
                (
                    re.search(r'^Work Integrated Learning\b.*\bunits\)$', current_name, re.IGNORECASE) and
                    re.search(r'\b(Completing|Internship|exemption to \d+ electives)\b', wil_name, re.IGNORECASE)
                )
            )
            if better_wil_name:
                u['name'] = wil_name
            else:
                u['name'] = _prefer_cleaner_name(u.get('name'), wil_name)
            is_exemption_style = bool(re.search(
                r'^Completing\s+Work-Integrated\s+Learning|exemption to \d+ electives',
                ' '.join(part for part in [wil_name or '', current_name or '']).strip(),
                re.IGNORECASE
            ))
            if re.search(r'equivalent to \d+ elective', current_name, re.IGNORECASE) and not better_wil_name:
                u['name'] = current_name
            if is_exemption_style and wil_prereq:
                u['prerequisite'] = wil_prereq
            elif is_exemption_style and re.search(r'^Completing\s+Work-Integrated\s+Learning', str(u.get('name') or ''), re.IGNORECASE):
                u['prerequisite'] = None
            elif wil_prereq:
                u['prerequisite'] = wil_prereq
        if u.get('category') == 'wil':
            lines = [re.sub(r'\s+', ' ', line).strip() for line in str(planner_text or '').splitlines()]
            code_upper = str(u.get('code') or '').upper()
            for idx, line in enumerate(lines):
                if code_upper not in line.upper():
                    continue
                gathered = []
                for next_line in lines[idx + 1: idx + 6]:
                    if re.match(r'^\s*(?:Semester\s+\d+|Winter\s+Term|Summer\s+Term|Year\s+(?:One|Two|Three|Four|Five|\d+)|Unit Code|Notes?)\b', next_line, re.IGNORECASE):
                        break
                    cleaned_next = re.sub(r'^\s*[^\w\s]?\s*', '', next_line).strip()
                    if cleaned_next:
                        gathered.append(cleaned_next)
                note_text = ' '.join(gathered)
                note_parts = []
                must_match = re.search(r'(Students need to complete at least \d+ units to enrol(?:l)?)', note_text, re.IGNORECASE)
                year_match = re.search(r'((?:WIL internship placement|WIL placement) can be taken in Year\s+(?:One|Two|Three|Four|Five|\d+))', note_text, re.IGNORECASE)
                if must_match:
                    note_parts.append(must_match.group(1))
                if year_match:
                    note_parts.append(re.sub(r'^WIL placement', 'WIL internship placement', year_match.group(1), flags=re.IGNORECASE))
                if note_parts:
                    existing_parts = [part.strip() for part in str(u.get('prerequisite') or '').split(';') if part.strip()]
                    # This takes internal planner import values and returns helper result because this keeps extraction, normalisation, or validation logic readable in one place.
                    def normalised_wil_part(value):
                        value = re.sub(r'\bYear\s+3\b', 'Year Three', value, flags=re.IGNORECASE)
                        return re.sub(r'\s+', ' ', value).strip().lower()
                    merged_parts = existing_parts[:]
                    seen_wil_parts = {normalised_wil_part(part) for part in merged_parts}
                    for part in note_parts:
                        key = normalised_wil_part(part)
                        if key not in seen_wil_parts:
                            merged_parts.append(re.sub(r'\bYear\s+3\b', 'Year Three', part, flags=re.IGNORECASE))
                            seen_wil_parts.add(key)
                    u['prerequisite'] = '; '.join(dict.fromkeys(merged_parts))
                break
        if u.get('category') == 'wil' and not u.get('prerequisite') and wil_note:
            note_parts = []
            must_match = re.search(r'(Students need to complete at least \d+ units to enrol(?:l)?)', wil_note, re.IGNORECASE)
            year_match = re.search(r'((?:WIL internship placement|WIL placement) can be taken in Year\s+(?:One|Two|Three|Four|Five|\d+))', wil_note, re.IGNORECASE)
            if must_match:
                note_parts.append(must_match.group(1))
            if year_match:
                note_parts.append(re.sub(r'^WIL placement', 'WIL internship placement', year_match.group(1), flags=re.IGNORECASE))
            if note_parts:
                u['prerequisite'] = '; '.join(dict.fromkeys(note_parts))
        if business_accounting_mode:
            code_prefix = str(u.get('code', ''))[:3].upper()
            if code_prefix in ('ACC', 'FIN', 'LAW') and u.get('category') in (None, 'elective'):
                u['category'] = 'major'
            if code_prefix in ('BUS', 'INF', 'MGT', 'MKT', 'ECO') and u.get('year_level') == 1 and u.get('semester') in (1, 2) and u.get('category') is None:
                u['category'] = 'core'
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

    if diploma_mode and "major" not in requirements and elective_target_count:
        major_only_units = [
            u for u in deduped
            if u.get('category') == 'major' and not str(u.get('code', '')).startswith('MPU')
        ]
        current_elective_count = len([u for u in deduped if u.get('category') == 'elective'])
        needed = max(elective_target_count - current_elective_count, 0)
        for u in major_only_units:
            if needed <= 0:
                break
            u['category'] = 'elective'
            needed -= 1

    if elective_target_count:
        current_elective_count = len([u for u in deduped if u.get('category') == 'elective'])
        needed = max(elective_target_count - current_elective_count, 0)
        if needed > 0:
            for u in deduped:
                if needed <= 0:
                    break
                if u.get('category') is None and not str(u.get('code', '')).startswith('MPU'):
                    u['category'] = 'elective'
                    needed -= 1

    for u in deduped:
        if not str(u.get('code', '')).startswith('MPU'):
            continue
        nearby_mpu_text = _extract_nearby_lines_for_code(planner_text, u.get('code'))
        canonical_mpu_name = _canonical_mpu_name(
            u.get('code'),
            ' '.join(part for part in [nearby_mpu_text or '', str(u.get('name') or '')] if part),
        )
        if canonical_mpu_name:
            u['name'] = canonical_mpu_name

    return deduped


# This takes PDF path and returns deterministic unit list because this is the public extractor entrypoint used by the app pipeline.
def extract_units(pdf_path):
    return extract_units_with_structure(pdf_path)


# This takes raw section header and returns canonical section name because minor/elective groups need stable display labels.
def _normalise_section_name(name):
    name = _normalise_table_text(name)
    name = re.sub(r'^\s*Minor\s*\|\s*', '', name, flags=re.IGNORECASE)
    return name


# This takes planner text and returns broad planner family because elective/minor pages use course-family-specific layouts.
def identify_planner_family(text):
    text = _normalise_table_text(text or "")
    if re.search(r'Bachelor of Computer Science', text, re.IGNORECASE):
        return "CS"
    if re.search(r'Bachelor of Design', text, re.IGNORECASE):
        return "DESIGN"
    if re.search(r'Bachelor of Business', text, re.IGNORECASE):
        return "BUSINESS"
    if re.search(r'Bachelor of Media and Communication', text, re.IGNORECASE):
        return "MEDIA"
    return "GENERIC"


# This takes possible heading and returns boolean because minor groups should start only on real section headers.
def _looks_like_minor_section_header(name):
    raw_name = str(name or "")
    original = _normalise_table_text(name)
    if re.match(r'^\s*Minor\s*\|', raw_name, re.IGNORECASE):
        return True
    section_name = _normalise_section_name(name)
    if not section_name or section_name.lower() == "minor":
        return False
    if MINOR_INVALID_SECTION_RE.search(section_name):
        return False
    if '/' in original and not re.search(r'Minor/Elective\s*$', section_name, re.IGNORECASE):
        return False
    return bool(
        re.match(r'^\s*Advanced\s+Minor\b', section_name, re.IGNORECASE) or
        re.search(r'\bMinor/Elective\s*$', section_name, re.IGNORECASE) or
        re.search(r'\bMinor\s*$', section_name, re.IGNORECASE)
    )


# This takes possible heading and returns boolean because section changes determine where elective codes are grouped.
def _looks_like_section_header(name):
    section_name = _normalise_section_name(name)
    if not section_name:
        return False
    return bool(
        re.search(r'\bRecommended\s+Elective', section_name, re.IGNORECASE) or
        _looks_like_minor_section_header(name) or
        re.search(r'\bDesign\s+Electives?\b', section_name, re.IGNORECASE)
    )


# This takes page text and returns boolean because inline minor parsing should run only on listing pages.
def _has_minor_listing_context(page_text):
    return bool(
        re.search(r'\bMinor\s*/\s*Elective\s+Listing\b', page_text, re.IGNORECASE) or
        re.search(r'\bDesign\s+and\s+Arts\s+Electives\b', page_text, re.IGNORECASE)
    )


# This takes text line and returns boolean because inline collection must stop before swallowing the next planner section.
def _is_minor_section_terminator(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    return bool(
        re.search(r'^\s*Notes?\b', text, re.IGNORECASE) or
        re.search(r'^\s*Year\s+(One|Two|Three|Four|\d+)\b', text, re.IGNORECASE) or
        re.search(r'^\s*Semester\s+\d+\b', text, re.IGNORECASE) or
        re.search(r'^\s*(Winter|Summer)\s+Term\b', text, re.IGNORECASE) or
        re.search(r'Recommended\s+Elective\s+Units', text, re.IGNORECASE)
    )


# This takes a raw minor heading and returns a display-ready minor name because UI grouping should use one consistent label per minor.
def _canonical_minor_section_name(text):
    raw_text = str(text or "")
    original = _normalise_table_text(text)
    cleaned = _normalise_section_name(text)
    if (
        re.match(r'^\s*Minor(?:\s*\||\s+)', raw_text, re.IGNORECASE) or
        re.match(r'^\s*Minor(?:\s*\||\s+)', original, re.IGNORECASE)
    ):
        cleaned = re.sub(r'^\s*Minor(?:\s*\||\s+)\s*', '', cleaned, flags=re.IGNORECASE).strip()
        if cleaned and not re.search(r'\bMinor\b', cleaned, re.IGNORECASE):
            return (cleaned + " Minor").strip()
    return cleaned


# This takes text near page edges and returns boolean because sidebar/footer labels are not elective units.
def _looks_like_sidebar_footer_noise(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    return bool(SIDEBAR_FOOTER_NOISE_RE.search(text))


# This takes section row text and code and returns unit entry because minor/elective groups need names and prereqs, not just codes.
def _section_unit_entry_from_row_text(row_text, code):
    row_text = _normalise_table_text(row_text)
    code = _strip_unit_markers(code)
    unit_name = None
    prerequisite = None

    prereq_match = re.match(
        rf'^{re.escape(code)}(?:{UNIT_MARKER_RE})?\s+(.*?)\s*\(pre-req:\s*(.*?)\)\s*$',
        row_text,
        re.IGNORECASE,
    )
    if prereq_match:
        unit_name = _clean_candidate_name(prereq_match.group(1))
        prerequisite = _clean_candidate_prereq(prereq_match.group(2))
    else:
        parsed_code, parsed_name, parsed_prereq = _parse_compact_code_row(row_text)
        if parsed_code == code:
            unit_name = _clean_candidate_name(parsed_name)
            prerequisite = _clean_candidate_prereq(parsed_prereq)
        else:
            trimmed = re.sub(rf'^\s*{re.escape(code)}(?:{UNIT_MARKER_RE})?\s*', '', row_text, flags=re.IGNORECASE).strip()
            unit_name = _clean_candidate_name(trimmed)
            prerequisite = None

    return {
        "unit_code": code,
        "unit_name": unit_name,
        "prerequisite": prerequisite,
        "offered_in": None,
    }



# ---------------------------
# STEP 4: Elective section grouping
# ---------------------------
# This takes PDF path and returns elective/minor group mapping because many elective options live outside the main study plan table.
def extract_elective_sections(file_path):
    sections = {}
    current  = 'Recommended Elective Units'
    planner_text = clean_text(extract_text_from_pdf(file_path))
    planner_family = identify_planner_family(planner_text)

    with pdfplumber.open(file_path) as pdf:
        legend = detect_colour_legend(pdf)

        for page in pdf.pages:
            page_words  = page.extract_words(x_tolerance=3, y_tolerance=3)
            right_bound = _detect_content_right(page_words, page.width)
            page_text_all = ' '.join(w['text'] for w in sorted(page_words, key=lambda x: (x['top'], x['x0'])))
            minor_listing_mode = _has_minor_listing_context(page_text_all)

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
                        if minor_listing_mode and _looks_like_minor_section_header(first):
                            current = _canonical_minor_section_name(first)
                            continue

                        code = None
                        for t, bbox in cells:
                            tok = t.split()[0].strip() if t.split() else ''
                            if CODE_RE.match(tok) and bbox[0] < 100:
                                code = tok.upper()
                                break
                        if not code or code.startswith('MPU'):
                            continue

                        row_text = ' '.join(t for t, _ in cells if t.strip())
                        entry = _section_unit_entry_from_row_text(row_text, code)
                        colour = (_get_colour_at_y(page, sub_mid_y, content_right=right)
                                  if sub_mid_y else
                                  _get_row_colour(page, row_obj.bbox, content_right=right))
                        section_is_minor = bool(re.search(r'\bminor\b', current, re.IGNORECASE))
                        if match_category(colour, legend) == 'elective' or section_is_minor:
                            sections.setdefault(current, [])
                            if not any(item.get("unit_code") == entry["unit_code"] for item in sections[current]):
                                sections[current].append(entry)

            line_buckets = {}
            for w in page_words:
                line_y = round(float(w.get('top', 0)) / 3) * 3
                line_buckets.setdefault(line_y, []).append(w)

            ordered_lines = []
            for line_y in sorted(line_buckets):
                words = sorted(line_buckets[line_y], key=lambda item: item['x0'])
                text = _normalise_table_text(' '.join(w['text'] for w in words))
                if text:
                    ordered_lines.append((line_y, text))

            cs_inline_minor_mode = planner_family == "CS"
            if not minor_listing_mode and not cs_inline_minor_mode:
                continue

            page_current = current
            collecting_inline_minor = False
            for _, text in ordered_lines:
                if cs_inline_minor_mode and re.search(r'^\s*Minor(?:\s*\||\s+)', text, re.IGNORECASE):
                    page_current = _canonical_minor_section_name(text)
                    collecting_inline_minor = True
                    continue

                if _looks_like_section_header(text):
                    page_current = _canonical_minor_section_name(text)
                    collecting_inline_minor = False
                    continue

                if collecting_inline_minor and _is_minor_section_terminator(text):
                    collecting_inline_minor = False
                    page_current = current
                    continue

                code_match = re.match(rf'^([A-Z]{{3}}\d{{3,5}})(?:{UNIT_MARKER_RE})?\b', text)
                if not code_match:
                    continue

                code = code_match.group(1).upper()
                if code.startswith('MPU'):
                    continue

                section_is_minor = collecting_inline_minor or bool(re.search(r'\bminor\b', page_current, re.IGNORECASE))
                is_recommended_elective = bool(re.search(r'Recommended\s+Elective|Design\s+Electives?', page_current, re.IGNORECASE))
                if not (section_is_minor or is_recommended_elective):
                    continue

                entry = _section_unit_entry_from_row_text(text, code)
                sections.setdefault(page_current, [])
                if not any(item.get("unit_code") == entry["unit_code"] for item in sections[page_current]):
                    sections[page_current].append(entry)

    return sections
