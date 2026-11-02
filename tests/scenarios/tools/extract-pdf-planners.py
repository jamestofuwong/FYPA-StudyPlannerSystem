#!/usr/bin/env python3
"""
Reads the study-planner PDFs (default: ../study-planner-pdfs next to the repo, or pass a folder) and writes
two fixtures the scenario suite compares the database against:

  fixtures/pdf-planners.json       one entry per PDF: major, intake, and every unit with its year and term
  fixtures/pdf-prerequisites.json  for every unit, the unit codes its prerequisite column mentions

Needs `pdftotext` (poppler). Re-run when the PDFs change:   python3 tests/scenarios/tools/extract-pdf-planners.py
"""
import json, os, re, subprocess, sys, glob, collections

here = os.path.dirname(os.path.abspath(__file__))
pdf_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(here, '..', '..', '..', '..', 'study-planner-pdfs'))
out_dir = os.path.join(here, '..', 'fixtures')
UNIT = r'[A-Z]{3}\d{5}|MPU\d{4}'
MAJORS = {'AI': 'Artificial Intelligence', 'CS': 'Cybersecurity', 'DS': 'Data Science', 'IOT': 'Internet of Things', 'SD': 'Software Development'}

def text_of(pdf):
    return subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout.split('\n')

planners = []
prereqs = collections.defaultdict(set)
for pdf in sorted(glob.glob(os.path.join(pdf_dir, '*.pdf'))):
    name = os.path.basename(pdf)[:-4]
    lines = text_of(pdf)
    intake = next(re.search(r'Intake:\s*(.+)', l).group(1).strip() for l in lines[:12] if 'Intake:' in l)
    year = int(re.search(r'(20\d\d)', intake).group(1))
    # Month as stored in the application: 2024 Feb/Mar planners are 2, Mar/Feb/Mar 2025+ are 3, Aug/Sept is 9.
    month = 9 if intake.startswith('Aug') else (2 if year == 2024 else 3)
    major = MAJORS[re.search(r'CS(AI|CS|DS|IOT|SD)', name).group(1)]
    y = t = 0; units = []; slots = 0; cur = None
    for l in lines:
        c = l[:92]
        if re.match(r'\s*(Recommended Elective Units|Minor \|)', c): break      # elective lists, not the grid
        m = re.match(r'\s*Year (One|Two|Three|Four)', c)
        if m: y = {'One': 1, 'Two': 2, 'Three': 3, 'Four': 4}[m.group(1)]; continue
        m = re.match(r'\s*Semester (\d)\s*\|', c)
        if m: t = int(m.group(1)); continue
        if re.match(r'\s*Summer Term', c): t = 3; continue
        if re.match(r'\s*Winter Term', c): t = 4; continue
        m = re.match(r'\s{0,3}(' + UNIT + r')\s{2,}(.*)$', c)
        if m and y and t:
            cur = m.group(1); units.append([cur, y, t])
            parts = re.split(r'\s{3,}', m.group(2).strip())
            if len(parts) > 1: prereqs[cur].update(re.findall(UNIT, parts[1]))
            continue
        if re.match(r'\s+Elective \d+\s*$', c) and y and t: slots += 1; continue
        if cur and re.match(r'^\s{12,}\S', c):
            seg = c.strip(); col = len(c) - len(c.lstrip())
            if col >= 45 and re.fullmatch(r'[A-Z0-9\s&/+,\-\.()cpCPo:req]*', seg) and re.search(UNIT, seg):
                prereqs[cur].update(re.findall(UNIT, seg)); continue
        if c.strip() and not re.match(r'^\s{12,}\S', c): cur = None
    planners.append(dict(file=name, major=major, intakeYear=year, intakeMonth=month, units=units, openSlots=slots))

os.makedirs(out_dir, exist_ok=True)
json.dump(planners, open(os.path.join(out_dir, 'pdf-planners.json'), 'w'), indent=1)
json.dump({k: sorted(v) for k, v in sorted(prereqs.items())}, open(os.path.join(out_dir, 'pdf-prerequisites.json'), 'w'), indent=1)
print(f'{len(planners)} planners, {len(prereqs)} units with prerequisites -> {os.path.normpath(out_dir)}')
