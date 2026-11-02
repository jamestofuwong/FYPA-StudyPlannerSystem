/**
 * Cross-checks the planners and unit prerequisites stored in the database against the official PDFs
 * (extracted into fixtures/ by tools/extract-pdf-planners.py). The scenario students are built from the
 * database, so any difference found here is a difference between the study planner the university
 * publishes and the one the advisor tool is using.
 */
import fs from 'fs';
import path from 'path';
import type { ScenarioData } from './db';

export interface DataCheck { area: 'planner' | 'prerequisite'; label: string; pass: boolean; expected: string; actual: string }

interface PdfPlanner { file: string; major: string; intakeYear: number; intakeMonth: number; units: [string, number, number][]; openSlots: number }

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8'));
const pos = (c: string, y: number, t: number) => `${c} (Y${y} ${t === 3 ? 'summer' : t === 4 ? 'winter' : 'S' + t})`;

export function plannerDataChecks(data: ScenarioData): DataCheck[] {
  const pdf = fixture<PdfPlanner[]>('pdf-planners.json');
  const reqs = fixture<Record<string, string[]>>('pdf-prerequisites.json');
  const out: DataCheck[] = [];

  for (const p of pdf) {
    const db = data.planners.find((d) => d.major === p.major && d.intakeYear === p.intakeYear && d.intakeMonth === p.intakeMonth);
    const label = `${p.major} ${p.intakeYear} ${p.intakeMonth === 9 ? 'Aug/Sept' : 'Feb/Mar'}  (${p.file}.pdf)`;
    if (!db) { out.push({ area: 'planner', label, pass: false, expected: 'planner exists', actual: 'no planner in the database' }); continue; }
    const pdfSet = new Set(p.units.map(([c, y, t]) => `${c}|${y}|${t}`));
    const dbSet = new Set(db.units.map((u) => `${u.code}|${u.year}|${u.semester}`));
    const onlyPdf = [...pdfSet].filter((x) => !dbSet.has(x)).map((x) => { const [c, y, t] = x.split('|'); return pos(c, +y, +t); });
    const onlyDb = [...dbSet].filter((x) => !pdfSet.has(x)).map((x) => { const [c, y, t] = x.split('|'); return pos(c, +y, +t); });
    const slotDiff = db.openSlots.length !== p.openSlots;
    out.push({
      area: 'planner', label,
      pass: onlyPdf.length === 0 && onlyDb.length === 0 && !slotDiff,
      expected: `${pdfSet.size} units, ${p.openSlots} open elective slots`,
      actual: onlyPdf.length || onlyDb.length || slotDiff
        ? [onlyPdf.length ? `PDF has, database lacks: ${onlyPdf.join(', ')}` : '', onlyDb.length ? `database has, PDF lacks: ${onlyDb.join(', ')}` : '', slotDiff ? `open slots PDF ${p.openSlots} vs database ${db.openSlots.length}` : ''].filter(Boolean).join('; ')
        : 'identical',
    });
  }

  // Prerequisites: compare the unit codes each PDF's prerequisite column mentions with the database's
  // requisites (antirequisites excluded), for every unit that appears on a planner grid. MPU units are skipped.
  const gridUnits = new Set(pdf.flatMap((p) => p.units.map(([c]) => c)).filter((c) => !c.startsWith('MPU')));
  for (const code of [...gridUnits].sort()) {
    const fromPdf = new Set(reqs[code] ?? []);
    const info = data.units.get(code);
    if (!info) { out.push({ area: 'prerequisite', label: code, pass: false, expected: 'unit exists', actual: 'unit missing from database' }); continue; }
    const fromDb = new Set(info.groups.flat().filter((c) => c.type === 'unit' && c.requisiteType !== 'antirequisite').map((c) => (c as { unitCode: string }).unitCode));
    const same = fromPdf.size === fromDb.size && [...fromPdf].every((c) => fromDb.has(c));
    if (!same) {
      out.push({
        area: 'prerequisite', label: `${code} ${info.name}`, pass: false,
        expected: `PDF: ${fromPdf.size ? [...fromPdf].join(', ') : 'none'}`,
        actual: `database: ${fromDb.size ? [...fromDb].join(', ') : 'none'}`,
      });
    }
  }
  const prereqChecked = gridUnits.size;
  out.push({ area: 'prerequisite', label: `${prereqChecked} unit prerequisite lists compared`, pass: true, expected: '', actual: '' });
  return out;
}
