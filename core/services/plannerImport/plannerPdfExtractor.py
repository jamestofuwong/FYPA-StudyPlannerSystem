import re
import pdfplumber
from plannerPdfRequirements import extract_requirements
from plannerPdfEvidence import (
    CODE_RE,
    SEMESTER_ROW_RE,
    SKIP_ROW_RE,
    TERM_ROW_RE,
    UNIT_MARKER_RE,
    _closest_header_value,
    _detect_content_right,
    _extract_line_headers,
    _get_colour_at_y,
    _get_row_colour,
    _normalise_semester_number,
    _split_merged_row,
    _words_to_cells,
    detect_colour_legend,
    match_category,
)
from plannerPdfTextRules import (
    clean_text,
    _appears_in_catalog_elective_section,
    _canonical_minor_section_name,
    _clean_candidate_name,
    _clean_candidate_prereq,
    _clean_mpu_name,
    _extract_clean_wil_name,
    _extract_clean_wil_prereq,
    _extract_combined_row_for_code,
    _extract_header_context_for_code,
    _extract_project_suffix_for_code,
    _extract_wil_context_for_code,
    _extract_wil_note_for_code,
    _has_minor_listing_context,
    _has_prescribed_marker_near_code,
    _is_minor_section_terminator,
    _looks_like_minor_section_header,
    _looks_like_section_header,
    _looks_like_sidebar_footer_noise,
    _looks_like_truncated_prereq,
    _looks_like_wil_text,
    _name_quality_score,
    _normalise_reordered_name,
    _normalise_table_text,
    _parse_compact_code_row,
    _prefer_cleaner_name,
    _recover_split_title_before_cp,
    _recover_title_around_prereq,
    _recover_trailing_title_after_prereq,
    _repair_code_style_prereq_from_row,
    _section_unit_entry_from_row_text,
    _slugify_unit_title,
    _split_prereq_and_offered,
    _strip_unit_markers,
    identify_planner_family,
)

# ============================================================
# STEP 1: Read PDF text
# ============================================================
# This takes PDF path and returns joined page text because metadata and requirement parsing need a plain-text evidence source.
def extract_text_from_pdf(file_path):
    pages = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text.strip())

    return "\n\n".join(pages)

# ============================================================
# STEP 2: Detect planner context
# ============================================================
# Detect the planner modes and requirement values shared by the table passes.
def _detect_planner_context(planner_text):
    requirements = extract_requirements(planner_text)
    return {
        'honours_mode': '(Honours)' in planner_text,
        'diploma_mode': bool(re.search(r'\bDiploma of\b', planner_text, re.IGNORECASE)),
        'business_accounting_mode': bool(
            re.search(r'Bachelor of Business\s*\(Accounting\)', planner_text, re.IGNORECASE)
        ),
        'design_mode': bool(
            re.search(r'Bachelor of Design\b', planner_text, re.IGNORECASE)
        ),
        'engineering_mode': bool(
            re.search(r'Bachelor of Engineering\b', planner_text, re.IGNORECASE)
        ),
        'requirements': requirements,
        'elective_target_count': requirements.get('elective', {}).get('count'),
    }

# Return whether a continuation row contains a code anchored at the table's left/code-column boundary rather than inside a later cell such as prerequisite.
def _has_code_column_anchor(cells, row_bbox):
    if not row_bbox:
        return False
    row_left = float(row_bbox[0])
    row_width = max(float(row_bbox[2]) - row_left, 1.0)
    left_tolerance = max(2.0, row_width * 0.02)
    code_cells = []
    for text, bbox in cells:
        if not bbox or not re.search(r'\b[A-Z]{3}\d{3,5}\b', str(text or ''), re.IGNORECASE):
            continue
        if abs(float(bbox[0]) - row_left) <= left_tolerance:
            return True
        code_cells.append(bbox)

    # A mixed name-plus-code fragment is still a row boundary. Pure prerequisite-cell continuations normally contain only the later cell.
    for code_bbox in code_cells:
        if any(
            other_bbox and other_bbox is not code_bbox and
            float(other_bbox[0]) < float(code_bbox[0]) and
            str(other_text or '').strip()
            for other_text, other_bbox in cells
        ):
            return True
    return False

# Return whether the current prerequisite still needs continuation text.
def _prerequisite_is_incomplete(text):
    text = str(text or '').strip()
    if not text:
        return False
    if _looks_like_truncated_prereq(text):
        return True
    if text.count('(') > text.count(')') or text.count('[') > text.count(']'):
        return True
    return bool(re.search(
        r'\b(?:any\s+of\s+these|one\s+of|including)\s*:?\s*$',
        text,
        re.IGNORECASE,
    ))

# Keep prerequisite text before a new advisory sentence in a wrapped row.
def _prerequisite_continuation_piece(row_text, current_prerequisite):
    row_text = str(row_text or '').strip()
    if not row_text:
        return None
    advisory = re.search(
        r'\bStudents?\s+(?:are|is|need|needs|must|should|can|may)\b',
        row_text,
        re.IGNORECASE,
    )
    if not advisory:
        return row_text
    prefix = row_text[:advisory.start()].strip(' -|,')
    if prefix and _prerequisite_is_incomplete(current_prerequisite):
        completed = f'{current_prerequisite} {prefix}'.strip()
        if (
            completed.count('(') >= completed.count(')') and
            completed.count('[') >= completed.count(']') and
            re.search(r'\d+(?:\.\d+)?\s*(?:cp|cps|credit\s+points?)', completed, re.IGNORECASE)
        ):
            return prefix
    return None

# Mixed continuation cells indicate that wrapped text crossed a column boundary.
def _has_mixed_continuation_cells(cells):
    return sum(1 for text, bbox in cells if bbox and str(text or '').strip()) > 1

# Apply continuation text to the previous unit when the row has no new code.
def _process_continuation_row(
    cells, row_text, page, row_bbox, legend, has_offered, units,
    sub_mid_y=None, content_right=None,
):
    # Continuation: extend last unit's name or prereq
    if units:
        last = units[-1]
        if last.get('_continuation_stopped'):
            return False
        if _has_code_column_anchor(cells, row_bbox):
            return False
        if (
            _looks_like_wil_text(row_text) and
            last.get('category') not in ('wil', 'mpu')
        ):
            return False
        if last.get('category') != 'wil':
            if _has_mixed_continuation_cells(cells):
                advisory_seen = bool(re.search(
                    r'\bStudents?\s+(?:are|is|need|needs|must|should|can|may)\b',
                    row_text,
                    re.IGNORECASE,
                ))
                continuation_piece = _prerequisite_continuation_piece(
                    row_text,
                    last.get('prerequisite'),
                )
                if advisory_seen:
                    last['_continuation_stopped'] = True
                if continuation_piece is None:
                    return False
                if continuation_piece != row_text:
                    last['prerequisite'] = (
                        (last.get('prerequisite') or '') + ' ' + continuation_piece
                    ).strip()
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
                continuation = ' '.join(extra_parts).strip()
                annotation_prefix = continuation.split('(', 1)[0].strip()
                annotation_suffix = ''
                if continuation.startswith('(') and ')' in continuation:
                    annotation_suffix = continuation.split(')', 1)[1].strip()
                if (
                    (annotation_prefix or annotation_suffix) and
                    re.search(r'\b(?:and|of|for|to|in|with|the)\s*$', last.get('name') or '', re.IGNORECASE)
                ):
                    continuation_name = ' '.join(
                        part for part in (annotation_prefix, annotation_suffix) if part
                    )
                    last['name'] = _clean_mpu_name(
                        f"{last.get('name', '')} {continuation_name}"
                    )
                elif not re.search(
                    r'\b(?:Malaysian|International|students?|SPM|Bahasa\s+Melayu)\b|\)\s*$',
                    continuation,
                    re.IGNORECASE,
                ):
                    last['_pending_mpu_name'] = continuation
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
                    continuation_parts = row_continuation.split(maxsplit=1)
                    last['name'] = _clean_candidate_name(
                        (last['name'] + ' ' + continuation_parts[0]).strip()
                    )
                    last['category'] = 'wil'
                    remainder = continuation_parts[1].strip(' -') if len(continuation_parts) > 1 else ''
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

# ============================================================
# STEP 3: Process planner table rows
# ============================================================
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
        return _process_continuation_row(
            cells, row_text, page, row_bbox, legend, has_offered, units,
            sub_mid_y=sub_mid_y, content_right=content_right,
        )

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

    if code.startswith('MPU') and (not name or not _clean_mpu_name(name)) and units:
        previous = units[-1]
        pending_mpu_name = previous.pop('_pending_mpu_name', None)
        if pending_mpu_name and str(previous.get('code', '')).startswith('MPU'):
            name = pending_mpu_name
            name_pos = code_pos

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
        wil_name_from_text = _extract_clean_wil_name(combined_wil_text)
        if wil_name_from_text:
            name_clean = wil_name_from_text
        if re.search(r'work integrated learning|work-?integrated learning', combined_wil_text, re.IGNORECASE):
            prereq = None
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

    explicit_wil_evidence = bool(re.search(
        r'work\s*-?integrated\s+learning|wil\s+placement|'
        r'completing\s+wil|exemption\s+to\s+\d+\s+electives',
        combined_wil_text,
        re.IGNORECASE,
    ))

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
            elif (
                existing.get('category') == 'elective' and
                category == 'wil' and
                explicit_wil_evidence
            ):
                existing['_promote_to_wil'] = True
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

# Find an already extracted unit so fallback rows enrich rather than duplicate it.
def _find_unit(units, code):
    return next((u for u in units if u.get('code') == code), None)

# Reject repeated headers and instructional prose during row recovery.
def _row_contains_header_noise(text):
    return bool(re.search(
        r'^\|?\s*(?:Semester\s+\d+|Winter\s+Term|Summer\s+Term)|\bregistered for the\b|\bcourses will be\b|\bundertake this unit\b',
        text or '',
        re.IGNORECASE
    ))

# Keep Foundation Studies rows eligible for the existing core fallback.
def _row_supports_core(row_text, category):
    if category == 'core':
        return True
    return bool(re.search(r'\bFoundation\s+Studies\b', row_text or '', re.IGNORECASE))

# Recover units from table rows when the primary cell parser misses a planner-specific row shape.
def _process_fallback_table_rows(
    table, page, words, headers, legend, tx0, right, units, seen, current_section,
    fallback_semester, fallback_year,
):
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
        elif category is None and _row_supports_core(row_text, category):
            category = 'core'

        existing = _find_unit(units, code)
        if existing:
            row_has_explicit_nil = bool(re.search(r'\bN[Ii][Ll]\b', row_text))
            if title:
                existing['name'] = _prefer_cleaner_name(existing.get('name'), title)
            if prereq and (not existing.get('prerequisite') or _row_contains_header_noise(existing.get('name'))):
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

        if _row_contains_header_noise(row_text) and not code.startswith('MPU'):
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

    return fallback_semester, fallback_year

# Recover names, prerequisites, and row-driven category evidence from the best text row.
def _recover_unit_row_context(u, planner_text, has_prescribed_marker, in_catalog_elective_section):
    combined_row = _extract_combined_row_for_code(planner_text, u.get('code'))
    ctx_year, ctx_semester = _extract_header_context_for_code(planner_text, u.get('code'))
    if combined_row:
        row_code, row_title, row_prereq = _parse_compact_code_row(combined_row)
        raw_row_title = row_title
        is_mpu_unit = str(u.get('code') or '').startswith('MPU')
        cell_name = (
            _clean_mpu_name(u.get('name'))
            if is_mpu_unit
            else _clean_candidate_name(u.get('name'))
        )
        if is_mpu_unit and cell_name:
            u['name'] = cell_name
            row_title_clean = _clean_mpu_name(row_title or '')
            if (
                '(' in (row_title or '') and
                row_title_clean and
                len(row_title_clean) > len(cell_name) and
                row_title_clean.lower().startswith(cell_name.lower())
            ):
                cell_name = row_title_clean
                u['name'] = row_title_clean
        cell_name_is_reliable = bool(
            cell_name and
            not is_mpu_unit and
            u.get('category') != 'wil' and
            not _row_contains_header_noise(cell_name) and
            _name_quality_score(cell_name) > 0 and
            not re.search(r'\b(?:and|or|for|of|to|in|with|the)\s*$', cell_name, re.IGNORECASE) and
            not re.search(r'\b(?:students?\s+need|completion|commencing|week\s+\d+)\b', cell_name, re.IGNORECASE) and
            _looks_like_wil_text(row_title) and
            not _looks_like_wil_text(cell_name)
        )
        if cell_name_is_reliable:
            row_title = cell_name
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
        if not cell_name_is_reliable and not (is_mpu_unit and cell_name):
            recovered_row_title = _recover_title_around_prereq(
                combined_row,
                u.get('code'),
                recovered_row_title or row_title or u.get('name'),
                u.get('prerequisite') or row_prereq,
            )
        if is_mpu_unit and cell_name:
            row_title = cell_name
            if '(' in combined_row:
                row_title_clean = _clean_mpu_name(raw_row_title)
                if (
                    row_title_clean and
                    len(row_title_clean) > len(cell_name) and
                    row_title_clean.lower().startswith(cell_name.lower()) and
                    not _row_contains_header_noise(row_title_clean) and
                    not re.search(
                        r'\b(?:Aug/Sept|Feb/Mar|set\s+of\s+compulsory\s+units|MUST\s+complete)\b',
                        row_title_clean,
                        re.IGNORECASE,
                    )
                ):
                    row_title = row_title_clean
                    cell_name = row_title_clean
            u['name'] = cell_name
        elif recovered_row_title:
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
                _row_contains_header_noise(u.get('name')) or
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
    return combined_row, ctx_year, ctx_semester

# ============================================================
# STEP 4: Recover and clean unit information
# ============================================================
# Apply honours-specific category adjustments.
def _apply_honours_rules(unit, honours_mode):
    if not honours_mode:
        return
    if isinstance(unit.get('name'), str):
        unit['name'] = unit['name'].replace('*', '').strip()
    unit['is_prescribed'] = False
    if unit.get('category') == 'prescribed_elective':
        unit['category'] = 'elective'
    if (
        unit.get('year_level') == 1 and
        unit.get('category') == 'major' and
        str(unit.get('code', '')).startswith(('ENG', 'COS', 'MTH', 'PHY'))
    ):
        unit['category'] = 'core'

# Recover missing year and semester values from document context.
def _recover_unit_placement(unit, ctx_year, ctx_semester):
    if (
        ctx_year is not None and
        unit.get('year_level') is None and
        unit.get('category') in ('core', 'major', 'wil', 'prescribed_elective')
    ):
        unit['year_level'] = ctx_year
    if (
        ctx_semester is not None and
        (unit.get('semester') is None or unit.get('category') == 'wil') and
        unit.get('category') in ('core', 'major', 'wil', 'prescribed_elective')
    ):
        unit['semester'] = ctx_semester
    if unit.get('category') == 'elective' and unit.get('offered_in'):
        unit['year_level'] = None
        unit['semester'] = None
    if unit.get('year_level') is None and isinstance(unit.get('semester'), int) and unit['semester'] > 0:
        unit['year_level'] = max(1, (unit['semester'] + 1) // 2)

# Clean MPU unit-name contamination before final name cleanup.
def _clean_mpu_unit(unit):
    if not str(unit.get('code', '')).startswith('MPU') or not isinstance(unit.get('name'), str):
        return
    pending_name = unit.pop('_pending_mpu_name', None)
    if pending_name and not _clean_mpu_name(unit['name']):
        unit['name'] = pending_name
    if '(' in unit['name']:
        unit['name'] = unit['name'].split('(', 1)[0].strip()
    unit['name'] = re.sub(r'\s+Semester\s+[A-Za-z/]+\s+\d{4}.*$', '', unit['name']).strip()
    unit['name'] = re.sub(
        r'\b(?:Year\s+(?:One|Two|Three|Four|Five|\d+)|Optional|WIL placement|Students\s+\w+)\b.*$',
        '',
        unit['name'],
        flags=re.IGNORECASE
    ).strip(' -')
    unit['name'] = _clean_mpu_name(unit['name'])

# Clean the final unit name using the existing row and planner evidence.
def _clean_final_unit_name(unit, planner_text):
    if not isinstance(unit.get('name'), str):
        return
    if re.search(r'\bConcurrent\b$', unit['name'], re.IGNORECASE):
        unit['name'] = re.sub(r'\s*\bConcurrent\b$', '', unit['name'], flags=re.IGNORECASE).strip()
        if isinstance(unit.get('prerequisite'), str) and not re.match(r'^\s*Concurrent\b', unit['prerequisite'], re.IGNORECASE):
            unit['prerequisite'] = ('Concurrent ' + unit['prerequisite']).strip()
    project_suffix = _extract_project_suffix_for_code(planner_text, unit.get('code'))
    if project_suffix and not re.search(rf'\b{re.escape(project_suffix)}\b$', unit['name'], re.IGNORECASE):
        unit['name'] = (unit['name'] + ' ' + project_suffix).strip()
    if re.search(rf'\b[A-Z]{{3}}\d{{3,5}}(?:{UNIT_MARKER_RE})?\b', unit['name']) and not str(unit.get('code', '')).startswith('MPU'):
        other_code_match = re.search(rf'\b([A-Z]{{3}}\d{{3,5}})(?:{UNIT_MARKER_RE})?\b', unit['name'])
        if other_code_match and other_code_match.group(1) != str(unit.get('code', '')).upper():
            unit['name'] = unit['name'].split(other_code_match.group(1), 1)[0].strip(' -')
    unit['name'] = re.sub(r'\b(?:All commencing students|Business courses will be automatically|required to complete a quiz.*|Students are encouraged.*|they want to enrol.*)\b.*$', '', unit['name'], flags=re.IGNORECASE).strip(' -')
    unit['name'] = re.sub(r'\s+\d+(?:\.\d+)?\s*CPs?\b.*$', '', unit['name'], flags=re.IGNORECASE).strip(' -')
    unit['name'] = re.sub(r'\s+Introductory Seminar\b.*$', '', unit['name'], flags=re.IGNORECASE).strip(' -')
    unit['name'] = re.sub(r'\s+Training Module\b.*$', '', unit['name'], flags=re.IGNORECASE).strip(' -')
    seminar_tail = re.search(
        r'^(.*?Professional Experience.*?)(?:#?\s*Introductory Seminar.*)$',
        unit['name'],
        re.IGNORECASE
    )
    if seminar_tail:
        unit['name'] = seminar_tail.group(1).strip()
    unit['name'] = re.sub(r'\b(\w+)(?:\s+\1)+\b', r'\1', unit['name']).replace('*', '').strip()
    unit['name'] = _normalise_reordered_name(unit['name'])
    unit['name'] = re.sub(r'\s*-\s*Design$', '', unit['name'], flags=re.IGNORECASE).strip()
    if (
        len(unit['name'].split()) >= 3 and
        re.search(r'\b[a-z]{3,}\b$', unit['name']) and
        not re.search(r'\b(?:and|or|of|in|to|for|with)\b$', unit['name']) and
        not str(unit.get('code', '')).startswith('MPU')
    ):
        unit['name'] = re.sub(r'\s+[a-z]{3,}$', '', unit['name']).strip()
    unit['name'] = re.sub(
        r'^([A-Za-z&/()]+)\s+Professional Experience in$',
        r'Professional Experience in \1',
        unit['name']
    ).strip()
    unit['name'] = re.sub(r'\bEolution\b', 'Evolution', unit['name']).strip()
    unit['name'] = _clean_candidate_name(unit['name'])

# Clean final prerequisite text before the unit is returned.
def _clean_final_prerequisite(unit):
    if not isinstance(unit.get('prerequisite'), str):
        return
    unit['prerequisite'] = re.sub(r'\b(?:All commencing students|Business courses will be automatically)\b.*$', '', unit['prerequisite'], flags=re.IGNORECASE).strip(' -')
    unit['prerequisite'] = re.sub(r'^(\d+(?:\.\d+)?\s*Credit\s+Points?)\b.*?(?:Elective\s+\d+.*|award of their degree.*)$', r'\1', unit['prerequisite'], flags=re.IGNORECASE)
    repeated_cp = re.match(r'^(\d+(?:\.\d+)?\s*CPs?)\b.*\b\1$', unit['prerequisite'], re.IGNORECASE)
    if repeated_cp:
        unit['prerequisite'] = repeated_cp.group(1)
    unit['prerequisite'] = re.sub(r'^\s*(\d+(?:\.\d+)?)\s+\1\s+(credit\s+points?)\s*$', r'\1 \2', unit['prerequisite'], flags=re.IGNORECASE)
    unit['prerequisite'] = re.sub(r'([A-Z]{3}\d{3,5})/\s+([A-Z]{3}\d{3,5})', r'\1/\2', unit['prerequisite'])
    if re.match(r'^Elective(?:\b.*)?$', unit['prerequisite'], re.IGNORECASE):
        unit['prerequisite'] = None
    elif (
        unit.get('category') != 'wil' and
        not re.search(r'\b(?:[A-Z]{3}\d{3,5}|\d+(?:\.\d+)?\s*c(?:p|ps|redit\s+points?))\b', unit['prerequisite'], re.IGNORECASE)
    ):
        unit['prerequisite'] = None

# Recover a split WIL title and prerequisite from the same row context.
def _recover_split_wil_row(unit):
    if not (
        isinstance(unit.get('name'), str) and
        unit['name'].startswith('Industry') and
        re.search(
            r'internship\s+as\s+a\s+prerequisite\s+to(?:\s+graduate)?',
            ' '.join(part for part in [unit.get('name'), unit.get('prerequisite')] if part),
            re.IGNORECASE,
        )
    ):
        return
    combined_prereq = re.sub(r'\s+', ' ', ' '.join(
        part for part in [unit.get('prerequisite'), unit.get('name')]
        if part
    )).strip()
    internship_match = re.search(
        r'(Students need to complete .*?(?:-\s*)?(?:Training\s+)?internship as a prerequisite to(?:\s+graduate)?)',
        combined_prereq,
        re.IGNORECASE,
    )
    unit['category'] = 'wil'
    wil_name_from_text = _extract_clean_wil_name(combined_prereq)
    if not wil_name_from_text:
        wil_name_match = re.search(
            r'\b(Industry)\b.*?\b(Training)\b',
            combined_prereq,
            re.IGNORECASE,
        )
        if wil_name_match:
            wil_name_from_text = ' '.join(wil_name_match.groups())
    if wil_name_from_text:
        unit['name'] = wil_name_from_text
    if internship_match:
        unit['prerequisite'] = internship_match.group(1).replace('- Training ', ' ').strip()
        if unit['prerequisite'].lower().endswith(' prerequisite to'):
            unit['prerequisite'] += ' graduate'

# Complete a WIL prerequisite using document-level context.
def _clean_wil_prerequisite(unit, planner_text_single):
    if unit.get('category') != 'wil' or not isinstance(unit.get('prerequisite'), str):
        return
    wil_phrase = re.search(
        r'(Students need to complete .*? internship as a prerequisite(?:\s+to)?(?:\s+\w+){0,4}\s+graduate)',
        planner_text_single,
        re.IGNORECASE
    )
    if wil_phrase and (
        unit['prerequisite'].endswith(' prerequisite to') or
        'graduate' not in unit['prerequisite'].lower()
    ):
        phrase = re.sub(r'\bYear\s+(?:One|Two|Three|Four|Five|\d+)\b', '', wil_phrase.group(1), flags=re.IGNORECASE)
        unit['prerequisite'] = re.sub(r'\s+', ' ', phrase).strip()
    elif unit['prerequisite'].strip().lower().endswith('prerequisite to'):
        unit['prerequisite'] = unit['prerequisite'].strip() + ' graduate'
    graduate_cut = re.search(r'^(.*?\bgraduate)\b', unit['prerequisite'], re.IGNORECASE)
    if graduate_cut:
        unit['prerequisite'] = graduate_cut.group(1).strip()

# ============================================================
# STEP 5: Finalise unit records
# ============================================================
# Finalise elective counts after all per-unit repairs are complete.
def _finalise_elective_counts(deduped, diploma_mode, requirements, elective_target_count):
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

    return deduped

# ============================================================
# STEP 6: Public extraction functions
# ============================================================
# This takes PDF path and returns deterministic units with year/semester/category context because the structure service needs raw facts before schema normalisation.
def extract_units_with_structure(pdf_path):
    units = []
    seen = set()
    current_section = None
    planner_text = clean_text(extract_text_from_pdf(pdf_path))
    planner_context = _detect_planner_context(planner_text)
    honours_mode = planner_context['honours_mode']
    diploma_mode = planner_context['diploma_mode']
    business_accounting_mode = planner_context['business_accounting_mode']
    design_mode = planner_context['design_mode']
    engineering_mode = planner_context['engineering_mode']
    requirements = planner_context['requirements']
    elective_target_count = planner_context['elective_target_count']
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
                    fallback_semester, fallback_year = _process_fallback_table_rows(
                        table, page, words, headers, legend, tx0, right, units, seen,
                        current_section, fallback_semester, fallback_year,
                    )

    deduped = []
    seen_keys = set()
    planner_text_single = re.sub(r'\s+', ' ', planner_text)
    for u in units:
        combined_row = _extract_combined_row_for_code(planner_text, u.get('code'))
        ctx_year, ctx_semester = _extract_header_context_for_code(planner_text, u.get('code'))
        has_prescribed_marker = _has_prescribed_marker_near_code(planner_text, u.get('code'))
        in_catalog_elective_section = _appears_in_catalog_elective_section(planner_text, u.get('code'))
        if isinstance(u.get('prerequisite'), str) and re.match(r'^\s*N[Ii][Ll]\s*$', u['prerequisite'].strip()):
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
        combined_row, ctx_year, ctx_semester = _recover_unit_row_context(
            u, planner_text, has_prescribed_marker, in_catalog_elective_section
        )
        _apply_honours_rules(u, honours_mode)
        # Recover a split WIL title and prerequisite from the same row context.
        # Keep the matched document wording rather than supplying a canonical answer.
        _recover_split_wil_row(u)
        _clean_wil_prerequisite(u, planner_text_single)
        _recover_unit_placement(u, ctx_year, ctx_semester)
        _clean_mpu_unit(u)
        _clean_final_unit_name(u, planner_text)
        _clean_final_prerequisite(u)
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
                    # Normalize WIL context before merging it into the prerequisite.
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
        if u.get('category') != 'wil' and re.search(
            r'^\s*Industry\b.*\binternship\s+as\s+a\s+prerequisite\b',
            str(u.get('name') or ''),
            re.IGNORECASE,
        ):
            u['category'] = 'wil'
        if u.pop('_promote_to_wil', False):
            u['category'] = 'wil'
        if business_accounting_mode:
            code_prefix = str(u.get('code', ''))[:3].upper()
            if code_prefix in ('ACC', 'FIN', 'LAW') and u.get('category') in (None, 'elective'):
                u['category'] = 'major'
            if code_prefix in ('BUS', 'INF', 'MGT', 'MKT', 'ECO') and u.get('year_level') == 1 and u.get('semester') in (1, 2) and u.get('category') is None:
                u['category'] = 'core'
        u.pop('_continuation_stopped', None)
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

    return _finalise_elective_counts(
        deduped,
        diploma_mode,
        requirements,
        elective_target_count,
    )

# This takes PDF path and returns deterministic unit list because this is the public extractor entrypoint used by the app pipeline.
def extract_units(pdf_path):
    return extract_units_with_structure(pdf_path)

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
            headers = _extract_line_headers(page_words)
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
                        row_year = _closest_header_value(headers, 'year', row_obj.bbox, max_vertical_gap=180)
                        row_semester = _closest_header_value(headers, 'semester', row_obj.bbox, max_vertical_gap=180)
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