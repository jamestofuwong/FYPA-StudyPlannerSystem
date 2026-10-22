import fs from 'fs';
import path from 'path';
import type { Check, Feature, PathwayMetrics } from './checks';
import type { Scenario } from '../scenarios';
import type { DataCheck } from './dataChecks';

export interface ScenarioResult {
  scenario: Pick<Scenario, 'id' | 'group' | 'title' | 'story'>;
  planner: string;
  rows: number;
  expectation: string[];
  checks: Check[];
  metrics: PathwayMetrics | null;
}

const FEATURES: Feature[] = ['matching', 'graduation', 'pathway'];
const FEATURE_LABEL: Record<Feature, string> = { matching: 'Matching', graduation: 'Graduation audit', pathway: 'Pathway' };

function verdict(r: ScenarioResult, f: Feature): '✅' | '❌' {
  const c = r.checks.filter((x) => x.feature === f);
  return c.every((x) => x.pass) ? '✅' : '❌';
}

export function renderReport(results: ScenarioResult[], dataChecks: DataCheck[] = []): string {
  const lines: string[] = [];
  const total = results.length;
  lines.push('# Student scenario results', '');
  lines.push(`${total} test students, each run through matching, the graduation audit and the pathway generator.`, '');

  lines.push('## Summary', '');
  lines.push('| Feature | Students passing | Individual checks passing |', '|---|---|---|');
  for (const f of FEATURES) {
    const students = results.filter((r) => verdict(r, f) === '✅').length;
    const all = results.flatMap((r) => r.checks.filter((c) => c.feature === f));
    lines.push(`| ${FEATURE_LABEL[f]} | ${students} / ${total} | ${all.filter((c) => c.pass).length} / ${all.length} |`);
  }
  lines.push('');

  if (dataChecks.length) {
    const planners = dataChecks.filter((d) => d.area === 'planner');
    const bad = dataChecks.filter((d) => !d.pass);
    lines.push('## Is the database the same as the PDFs?', '');
    lines.push(`${planners.filter((d) => d.pass).length} of ${planners.length} planners match their PDF exactly. ${bad.length ? 'Differences:' : ''}`, '');
    if (bad.length) {
      lines.push('| Area | Item | PDF says | Database has |', '|---|---|---|---|');
      for (const d of bad) lines.push(`| ${d.area} | ${d.label} | ${d.area === 'planner' ? d.expected : d.expected} | ${d.actual} |`);
      lines.push('');
    }
  }

  lines.push('## Every student at a glance', '');
  lines.push('| ID | Student | Planner | Matching | Graduation | Pathway |', '|---|---|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.scenario.id} | ${r.scenario.title} | ${r.planner} | ${verdict(r, 'matching')} | ${verdict(r, 'graduation')} | ${verdict(r, 'pathway')} |`);
  }
  lines.push('');

  // Which checks fail most, so the same problem is not read forty times.
  const byName = new Map<string, { feature: Feature; ids: string[]; meaning?: string }>();
  for (const r of results) for (const c of r.checks.filter((x) => !x.pass)) {
    const key = `${c.feature}|${c.name}`;
    if (!byName.has(key)) byName.set(key, { feature: c.feature, ids: [], meaning: c.meaning });
    byName.get(key)!.ids.push(r.scenario.id);
  }
  lines.push('## What went wrong, grouped', '');
  if (byName.size === 0) lines.push('Nothing failed.', '');
  for (const f of FEATURES) {
    const rows = [...byName].filter(([k]) => k.startsWith(f + '|')).sort((a, b) => b[1].ids.length - a[1].ids.length);
    if (!rows.length) continue;
    lines.push(`### ${FEATURE_LABEL[f]}`, '');
    lines.push('| Check | Students failing | What it means |', '|---|---|---|');
    for (const [k, v] of rows) lines.push(`| ${k.split('|')[1]} | ${v.ids.length}: ${v.ids.join(', ')} | ${v.meaning ?? ''} |`);
    lines.push('');
  }

  lines.push('## Student by student', '');
  let group = '';
  for (const r of results) {
    if (r.scenario.group !== group) { group = r.scenario.group; lines.push(`### ${group}`, ''); }
    lines.push(`#### ${r.scenario.id} · ${r.scenario.title}`, '');
    lines.push(`*${r.scenario.story}*  `, `Planner: ${r.planner} · ${r.rows} transcript rows`, '');
    lines.push('What should happen:', '', ...r.expectation.map((e) => `- ${e}`), '');
    for (const f of FEATURES) {
      const cs = r.checks.filter((c) => c.feature === f);
      lines.push(`**${FEATURE_LABEL[f]}** ${verdict(r, f)}`, '');
      for (const c of cs) {
        if (c.pass) lines.push(`- ✅ ${c.name} — ${c.actual}`);
        else lines.push(`- ❌ ${c.name}`, `  - Expected: ${c.expected}`, `  - Actual: ${c.actual}`);
      }
      lines.push('');
    }
    if (r.metrics) {
      const m = r.metrics;
      lines.push(`*Pathway length: ${m.semestersPlanned} semester(s); minimum possible about ${m.lowerBound}; units still owed ${m.requiredUnits} + ${m.electivesNeeded} elective(s)${m.alignedPct !== null ? `; ${m.alignedPct}% aligned with planner` : ''}.*`, '');
    }
  }
  return lines.join('\n');
}

export function writeReport(results: ScenarioResult[], dataChecks: DataCheck[] = []) {
  const dir = path.join(__dirname, '..');
  fs.mkdirSync(path.join(dir, 'results'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'results', 'latest.json'), JSON.stringify({ results, dataChecks }, null, 2));
  fs.writeFileSync(path.join(dir, 'RESULTS.md'), renderReport(results, dataChecks));
}
