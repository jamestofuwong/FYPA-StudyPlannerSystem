/**
 * Writes every scenario student as an .xlsx file in the same layout the portal export (and the dashboard's
 * "Import Excel") uses:  Course | Course Title | Level | Credits | Earned | Status | Grade | Term.
 *
 *   SCENARIO_DB_URL=postgresql://user:pass@host:port/db npx tsx tests/scenarios/tools/export-students.ts [outDir]
 *
 * Default output is <repo>/test-students. Each file is read back through the application's own importer
 * (parseResultsSheet) and compared with the student it came from, so a file that would not import is caught here.
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx-js-style';
import { loadScenarioData, closeScenarioDb } from '../support/db';
import { Transcript, type Row } from '../support/transcript';
import { buildScenarios } from '../scenarios';
import { parseResultsSheet } from '../../../web/lib/resultsSheet';
import { parseTermCode } from '../../../core/services/classEstimation/termCode';
import { describeExpectation } from '../support/checks';

const HEADER = ['Course', 'Course Title', 'Level', 'Credits', 'Earned', 'Status', 'Grade', 'Term'];

/** Not-yet-complete rows first (by code), then completed rows by term and code, as in a portal export. */
function exportOrder(rows: Row[]): Row[] {
  const termKey = (term: string) => {
    const t = parseTermCode(term);
    return t ? t.year * 100 + t.month : 0;
  };
  const done = (r: Row) => r.status === 'Complete';
  return [...rows].sort((a, b) => {
    if (done(a) !== done(b)) return done(a) ? 1 : -1;
    if (!done(a)) return a.courseId.trim().localeCompare(b.courseId.trim());
    return termKey(a.term) - termKey(b.term) || a.courseId.trim().localeCompare(b.courseId.trim());
  });
}

function toSheetRows(rows: Row[]): unknown[][] {
  return [
    HEADER,
    ...exportOrder(rows).map((r) => [
      r.courseId, r.courseTitle, '', r.credits, r.creditsEarned, r.status, r.grade,
      // The portal leaves the term blank for units a student has only enrolled in for later
      r.status === 'Future' ? '' : r.term,
    ]),
  ];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

/** "A. Follows the planner exactly" becomes "A_follows_the_planner_exactly". */
const folderOf = (group: string) => slug(group);

function clear(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { clear(full); if (fs.readdirSync(full).length === 0) fs.rmdirSync(full); }
    else if (entry.name.endsWith('.xlsx') || entry.name === 'README.md') fs.unlinkSync(full);
  }
}

async function main() {
  const outDir = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..', '..', 'test-students'));
  fs.mkdirSync(outDir, { recursive: true });
  clear(outDir);

  const data = await loadScenarioData();
  const index: string[] = [];
  let problems = 0;
  let lastGroup = '';

  for (const sc of buildScenarios()) {
    const planner = data.plannerBy(...sc.planner);
    const t = new Transcript(planner, data);
    sc.build(t, data);

    const folder = folderOf(sc.group);
    fs.mkdirSync(path.join(outDir, folder), { recursive: true });
    const file = path.join(folder, `${sc.id}_${slug(sc.title)}.xlsx`);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toSheetRows(t.rows)), 'Sheet1');
    XLSX.writeFile(wb, path.join(outDir, file));

    // Read it back through the importer the dashboard uses
    const back = XLSX.readFile(path.join(outDir, file));
    const parsed = parseResultsSheet(XLSX.utils.sheet_to_json(back.Sheets.Sheet1, { header: 1, defval: '' }) as unknown[][]);
    const norm = (c: string) => c.trim().toUpperCase();
    if (t.rows.length === 0) {
      // A header-only file is meant to be refused with a clear message: it is the "empty export" edge case.
      if (parsed.ok) { problems++; console.error(`${file}: an empty file should be rejected by the importer`); }
    } else if (!parsed.ok) {
      problems++; console.error(`${file}: importer rejected it: ${parsed.error}`);
    } else {
      const want = exportOrder(t.rows).map((r) => `${norm(r.courseId)}|${r.status}|${r.grade.trim().toUpperCase()}`);
      const got = parsed.courseList.map((r) => `${norm(r.courseId)}|${r.status}|${String(r.grade ?? '').trim().toUpperCase()}`);
      if (want.length !== got.length || want.some((w, i) => w !== got[i])) {
        problems++; console.error(`${file}: read back differently (${want.length} rows in, ${got.length} out)`);
      }
    }

    const intake = planner.intakeMonth === 9 ? 'Aug/Sept' : 'Feb/Mar';
    if (sc.group !== lastGroup) { lastGroup = sc.group; index.push(`## ${sc.group}`, '', `Folder: \`${folder}/\``, ''); }
    index.push(`### ${sc.id} · ${sc.title}`, '', `File: \`${file}\`  `, `Planner: ${planner.major}, ${planner.intakeYear} ${intake} intake  `, `${t.rows.length} rows. *${sc.story}*`, '',
      ...describeExpectation(sc, planner, t, data).map((l) => `- ${l}`), '');
    console.log(`${file}  (${t.rows.length} rows)`);
  }

  fs.writeFileSync(path.join(outDir, 'README.md'), [
    '# Test students', '',
    'The students are grouped into folders by kind of situation. Each file is one student in the same layout as a portal export: `Course, Course Title, Level, Credits, Earned, Status, Grade, Term`.',
    'Open one with **Import Excel** on the dashboard. They are generated from the real study planners by',
    '`tests/scenarios/tools/export-students.ts`; do not edit them by hand, re-run the tool instead.', '',
    'Notes: units a student has only enrolled in for later ("Future") have no term, as in a real export.',
    'Student F03 has no rows at all (header only): the dashboard import should refuse it with "File has no data rows".',
    'The MPU units shown are the Malaysian-student set.', '',
    ...index,
  ].join('\n'));

  await closeScenarioDb();
  if (problems) { console.error(`${problems} file(s) failed the read-back check`); process.exit(1); }
  console.log(`\nWrote ${index.filter((l) => l.startsWith('### ')).length} students to ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
