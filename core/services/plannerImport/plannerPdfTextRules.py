from __future__ import annotations
import re

from plannerPdfEvidence import (
    SEMESTER_ROW_RE,
    TERM_ROW_RE,
    UNIT_MARKER_RE,
    _normalise_semester_number,
)

# ============================================================
# STEP 1: General text cleanup
# ============================================================
# Normalize extracted text while preserving meaningful line boundaries.
def clean_text(text):
    return re.sub(r'\n+', '\n', re.sub(r'\r', '', text)).strip()

# ============================================================
# STEP 2: Read early WIL context
# ============================================================
# Separate prerequisite text from the offered-in value.
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

# Convert a unit title into a stable comparison key.
def _slugify_unit_title(text):
    return re.sub(r'[^A-Z0-9]+', '_', re.sub(r'\s+', ' ', text.upper()).strip()).strip('_')

# Check whether text describes WIL or industry placement.
def _looks_like_wil_text(text):
    return bool(re.search(
        r'work-?integrated|industry\s+training|industry\s+placement|professional\s+experience|internship|wil',
        text or '',
        re.IGNORECASE
    ))

# Recover a nearby WIL note for a specific unit code.
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

# Recover the WIL name and prerequisite context for a unit code.
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

# Flatten table text while keeping words in reading order.
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

# Remove annotation markers from a unit code.
def _strip_unit_markers(text):
    return re.sub(rf'{UNIT_MARKER_RE}$', '', str(text or '').strip().upper())

# Remove common PDF noise from a candidate unit name.
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

# Remove notes and repeated text from an MPU name.
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

# Remove common PDF noise from prerequisite text.
def _clean_candidate_prereq(prereq):
    prereq = _normalise_table_text(prereq)
    if re.match(r'^N[Ii][Ll]\s*(?:\((?:Anti|Co)-req:\s*[^)]+\)|\([^)]*(?:Anti|Co)-req:[^)]*\))', prereq, re.IGNORECASE):
        return prereq
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

# ============================================================
# STEP 3: Clean unit names and prerequisites
# ============================================================
# Parse a compact row containing code, name, and prerequisite text.
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

# Score a candidate name by length and contamination signals.
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

# Keep the better-supported version of two candidate names.
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

# Recover a title fragment that appears before a credit-point prerequisite.
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

# Recover a short title fragment that follows prerequisite text.
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

# Rebuild a title split around a detected prerequisite.
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

# Normalize names whose fragments were read in the wrong order.
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

# Repair prerequisite code formatting from the combined row evidence.
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

# Check whether prerequisite text ends with an unfinished connector.
def _looks_like_truncated_prereq(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    return bool(re.search(
        r'(?:[&/+]|(?:\bAND\b|\bOR\b)|\bCo-req:\b)\s*$',
        text,
        re.IGNORECASE
    ))

# Check whether a continuation contains only prerequisite-like codes.
def _looks_like_code_only_continuation(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    if not re.search(r'\b[A-Z]{3}\d{3,5}\b', text):
        return False
    return bool(re.match(r'^[A-Z0-9/&+,\-\s]+$', text))

# Score a combined row by useful text and contamination signals.
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

# ============================================================
# STEP 4: Recover split rows and context
# ============================================================
# Collect the strongest nearby text row for a unit code.
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

# Find the nearest year and semester context for a unit code.
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

# Check whether a prescribed-elective marker belongs to a unit row.
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

# Check whether a unit appears in a catalogue elective section.
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

# ============================================================
# STEP 5: Handle WIL text
# ============================================================
# Extract a clean WIL name from combined row text.
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
    industry_training = re.search(r'\b(Industry\s+Training)\b', text, re.IGNORECASE)
    if industry_training:
        return industry_training.group(1)
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

# Extract a clean WIL prerequisite from combined row text.
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

# Recover a short project suffix from nearby continuation text.
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

# STEP 6: Recognise planner sections
# Normalize a section heading before matching it.
def _normalise_section_name(name):
    name = _normalise_table_text(name)
    name = re.sub(r'^\s*Minor\s*\|\s*', '', name, flags=re.IGNORECASE)
    return name

# Identify the broad course family from the planner title.
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

# Check whether text is a genuine minor section heading.
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

# Check whether text starts a supported elective or minor section.
def _looks_like_section_header(name):
    section_name = _normalise_section_name(name)
    if not section_name:
        return False
    return bool(
        re.search(r'\bRecommended\s+Elective', section_name, re.IGNORECASE) or
        _looks_like_minor_section_header(name) or
        re.search(r'\bDesign\s+Electives?\b', section_name, re.IGNORECASE)
    )

# Check whether a page contains a minor listing section.
def _has_minor_listing_context(page_text):
    return bool(
        re.search(r'\bMinor\s*/\s*Elective\s+Listing\b', page_text, re.IGNORECASE) or
        re.search(r'\bDesign\s+and\s+Arts\s+Electives\b', page_text, re.IGNORECASE)
    )

# Check whether text ends the current minor section.
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

# Build the canonical display name for a minor section.
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

# Check whether text belongs to sidebar or footer content.
def _looks_like_sidebar_footer_noise(text):
    text = _normalise_table_text(text)
    if not text:
        return False
    return bool(SIDEBAR_FOOTER_NOISE_RE.search(text))

# ============================================================
# STEP 7: Handle minor/elective sections and page noise
# ============================================================
# Build a minor or elective entry from one row of text.
def _section_unit_entry_from_row_text(row_text, code):
    row_text = _normalise_table_text(row_text)
    code = _strip_unit_markers(code)
    unit_name = None
    prerequisite = None
    offered_in = None

    prereq_match = re.match(
        rf'^{re.escape(code)}(?:{UNIT_MARKER_RE})?\s+(.*?)\s*\(pre-req:\s*(.*?)\)\s*$',
        row_text,
        re.IGNORECASE,
    )
    if prereq_match:
        unit_name = _clean_candidate_name(prereq_match.group(1))
        prerequisite, offered_in = _split_prereq_and_offered(prereq_match.group(2))
        prerequisite = _clean_candidate_prereq(prerequisite)
    else:
        parsed_code, parsed_name, parsed_prereq = _parse_compact_code_row(row_text)
        if parsed_code == code:
            unit_name = _clean_candidate_name(parsed_name)
            prerequisite, offered_in = _split_prereq_and_offered(parsed_prereq)
            prerequisite = _clean_candidate_prereq(prerequisite)
        else:
            trimmed = re.sub(rf'^\s*{re.escape(code)}(?:{UNIT_MARKER_RE})?\s*', '', row_text, flags=re.IGNORECASE).strip()
            unit_name = _clean_candidate_name(trimmed)
            prerequisite = None

    return {
        "unit_code": code,
        "unit_name": unit_name,
        "prerequisite": prerequisite,
        "offered_in": offered_in,
    }