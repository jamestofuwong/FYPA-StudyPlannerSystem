#!/usr/bin/env node
/**
 * Measures how accurate class estimation is, by predicting past semesters and comparing with what students
 * actually took.
 *   npm run backtest                         a generated cohort, every semester it has data for
 *   npm run backtest -- --dpa=<folder>       real DPA exports, every .xlsx in the folder
 *
 * Options:
 *   --term=2026-1     score one semester only, as year-semester
 *   --count=500       generated students (default 500), ignored with --dpa
 *   --seed=1          generated cohort seed (default 1), ignored with --dpa
 *   --min=20          skip semesters with fewer scored students than this (default 20, 1 with --dpa)
 *   --units=15        how many units to list for the most recent semester (default 15)
 *   --verbose         show the matching algorithm's warnings instead of just counting them
 *   --plain           no colour, for piping to a file
 *
 * Needs the local Postgres for the planners. Start the app with `npm run dev`, or with the app closed run
 * `node scripts/db-up.js` in another terminal.
 *
 * Accuracy is 1 minus the weighted absolute percentage error across units, so 70% means the total miss came
 * to 30% of real enrolment. See core/services/classEstimation/backtest/accuracyMetrics.ts for why that
 * measure and not a plain average.
 */

import fs from 'fs';
import path from 'path';
import { createMockPortalSource } from '../core/services/classEstimation/sources/mockPortalSource';
import { runScrapeForStudents } from '../core/services/classEstimation/scrapeOrchestrator';
import { getEstimationRecords, resetEstimationRecords } from '../core/services/classEstimation/estimationStore';
import { buildEstimationRecord } from '../core/services/classEstimation/estimationRecordBuilder';
import { parseDpaWorkbook, studentIdFromFilename } from '../core/services/classEstimation/dpaImport/dpaFileParser';
import { runBacktest, type BacktestResult } from '../core/services/classEstimation/backtest/backtestRunner';
import {
  semestersWithEnrolments,
  type TargetSemester,
} from '../core/services/classEstimation/backtest/transcriptCutoff';
import type { EstimationRecord } from '../core/shared/types/classEstimation';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};

const dpaFolder = flag('dpa', '');
const termFlag = flag('term', '');
const count = Number(flag('count', '500'));
const seed = Number(flag('seed', '1'));
const minStudents = Number(flag('min', dpaFolder ? '1' : '20'));
const unitsToList = Number(flag('units', '15'));
const verbose = args.includes('--verbose');

// ====== Output ================================================================================

const useColour = !args.includes('--plain') && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (useColour ? `\x1b[${code}m${text}\x1b[0m` : text);
const c = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  cyan: paint('36'),
};

/** Terminal width, capped so lines stay readable on a wide window. */
const WIDTH = Math.min(process.stdout.columns || 100, 110);

/** Visible length, ignoring colour codes, so padding lines up whether or not colour is on. */
const visible = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').length;
const padEnd = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - visible(text)));
const padStart = (text: string, width: number) => ' '.repeat(Math.max(0, width - visible(text))) + text;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const label = (t: TargetSemester) => `${t.year} S${t.semester}`;

function gradeColour(grade: BacktestResult['grade']): (text: string) => string {
  if (grade === 'excellent') return c.green;
  if (grade === 'acceptable') return c.yellow;
  return c.red;
}

/**
 * A 0 to 100% bar with the two targets marked on it, so where a figure sits against them is visible at a
 * glance. The ticks at 30% and 70% show through the bar in the empty part.
 */
function accuracyBar(value: number, width = 20): string {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  const marks = new Set([Math.round(0.3 * width), Math.round(0.7 * width)]);
  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i < filled) bar += '█';
    else bar += marks.has(i) ? c.dim('┊') : c.dim('░');
  }
  return bar;
}

/** A plain share bar, for the breakdown of what happened to each enrolment. */
function shareBar(share: number, width = 24): string {
  const filled = Math.round(Math.max(0, Math.min(1, share)) * width);
  return '█'.repeat(filled) + c.dim('░'.repeat(width - filled));
}

function rule(title = ''): string {
  const head = title ? `── ${c.bold(title)} ` : '';
  return head + c.dim('─'.repeat(Math.max(0, WIDTH - visible(head))));
}

/** Word-wraps a paragraph to the terminal, with a hanging indent so wrapped lines sit under the text. */
function wrap(text: string, indent: string, firstPrefix: string): string {
  const lines: string[] = [];
  let line = firstPrefix;
  let empty = true;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!empty && visible(line) + 1 + word.length > WIDTH) {
      lines.push(line);
      line = indent;
      empty = true;
    }
    line += (empty ? '' : ' ') + word;
    empty = false;
  }
  lines.push(line);
  return lines.join('\n');
}

function box(lines: string[]): string {
  const inner = Math.min(WIDTH - 4, Math.max(...lines.map(visible)));
  const top = `╭${'─'.repeat(inner + 2)}╮`;
  const bottom = `╰${'─'.repeat(inner + 2)}╯`;
  return [top, ...lines.map((line) => `│ ${padEnd(line, inner)} │`), bottom].join('\n');
}

// ====== Quietening the matching algorithm ======================================================
//
// The matching algorithm warns about every unit it cannot classify, and MPU units are never in its master
// table because the estimator leaves them out on purpose. Over a few hundred students that is hundreds of
// lines burying the report. They are counted here rather than printed, and --verbose brings them back.
// This is local to the script, so single-student matching elsewhere in the app still logs as it did.

let hiddenWarnings = 0;
let hiddenAreMpuOnly = true;
if (!verbose) {
  const original = console.warn;
  console.warn = (...parts: unknown[]) => {
    const text = parts.map(String).join(' ');
    if (text.startsWith('[ProfileBuilder]') || text.startsWith('[ScoringEngine]')) {
      hiddenWarnings++;
      const codes = text.match(/\b[A-Z]{3}\d{4,5}\b/g) ?? [];
      if (codes.some((code) => !code.startsWith('MPU'))) hiddenAreMpuOnly = false;
      return;
    }
    original(...parts);
  };
}

// ====== Loading students =======================================================================

async function generatedRecords(): Promise<EstimationRecord[]> {
  resetEstimationRecords();
  const source = createMockPortalSource({ count, seed });
  const readiness = await source.readiness();
  if (!readiness.ready) throw new Error(readiness.reason ?? 'The mock source is not ready.');
  const noop = () => {};
  await runScrapeForStudents(
    await source.getStudents(),
    { onProgress: noop, onStudentDone: noop, onStudentSkip: noop, onStudentError: noop },
    () => false,
    source,
  );
  return getEstimationRecords();
}

function dpaRecords(folder: string): EstimationRecord[] {
  const dir = path.resolve(process.cwd(), folder);
  const files = fs.readdirSync(dir).filter((f) => /\.(xlsx|xls|csv)$/i.test(f));
  if (files.length === 0) throw new Error(`No .xlsx, .xls or .csv files in ${dir}`);

  const records: EstimationRecord[] = [];
  for (const file of files) {
    try {
      const parsed = parseDpaWorkbook(fs.readFileSync(path.join(dir, file)));
      for (const student of parsed.students) {
        const studentId = student.studentId ?? studentIdFromFilename(file);
        if (!studentId) {
          console.warn(c.yellow(`  skipped a student in ${file}: no ID in the sheet or the filename`));
          continue;
        }
        records.push(buildEstimationRecord({ source: 'import', studentId, transcript: student.courseList }));
      }
    } catch (error) {
      console.warn(c.yellow(`  skipped ${file}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return records;
}

function parseTermFlag(value: string): TargetSemester {
  const match = /^(\d{4})-([12])$/.exec(value.trim());
  if (!match) throw new Error(`--term must look like 2026-1, got "${value}"`);
  return { year: Number(match[1]), semester: Number(match[2]) as 1 | 2 };
}

// ====== Printing ===============================================================================

function printHeader(students: number): void {
  const lines = [
    c.bold('Class estimation accuracy'),
    `${students.toLocaleString()} students · ${dpaFolder ? `DPA files in ${dpaFolder}` : `generated cohort, seed ${seed}`}`,
    c.dim('Targets: 30% acceptable · 70% excellent'),
  ];
  if (!dpaFolder) lines.push(c.yellow('⚠ Generated data. Real DPA exports give the figure worth reporting.'));
  console.log(`\n${box(lines)}\n`);
}

function printSemesterTable(results: BacktestResult[]): void {
  console.log(rule('Every semester'));
  console.log(c.dim(
    `  ${padEnd('Semester', 10)}${padStart('Scored', 7)}   ${padEnd('Accuracy', 30)}`
    + `${padStart('Within ±30%', 12)}${padStart('Recall', 9)}`,
  ));
  for (const result of results) {
    const scored = result.students.included - result.students.notEnrolledInTarget;
    const colour = gradeColour(result.grade);
    console.log(
      `  ${padEnd(label(result.target), 10)}${padStart(String(scored), 7)}   `
      + `${colour(accuracyBar(result.summary.accuracy))} ${padStart(colour(pct(result.summary.accuracy)), 6)}   `
      + `${padStart(pct(result.summary.withinTolerance), 12)}${padStart(pct(result.studentRecall), 9)}`,
    );
  }
  console.log(c.dim(`  ${' '.repeat(20)}the dotted ticks in each bar mark 30% and 70%`));
}

function printDetail(result: BacktestResult): void {
  const s = result.summary;
  const st = result.students;
  const colour = gradeColour(result.grade);

  console.log(`\n${rule(`${label(result.target)} in detail`)}`);

  // The headline, in words as well as numbers.
  const direction = Math.abs(s.bias) < 0.05
    ? 'about right overall'
    : `${pct(Math.abs(s.bias))} too ${s.bias > 0 ? 'high' : 'low'} overall`;
  console.log(`\n  ${c.bold('Accuracy')}   ${colour(c.bold(pct(s.accuracy)))}  ${colour(result.grade)}`);
  console.log(`  ${c.bold('Estimate')}   ${direction}`);
  console.log(`  ${c.bold('Units')}      ${pct(s.withinTolerance)} of ${s.units} landed within ±${(s.tolerance * 100).toFixed(0)}% of reality`);
  console.log(`  ${c.bold('Students')}   named ${pct(result.studentRecall)} of the units each one took`
    + c.dim(` (precision ${pct(result.studentPrecision)})`));

  console.log(`\n  ${c.bold('Who was scored')}`);
  console.log(`    ${padStart(String(st.included), 5)}  scored${st.notEnrolledInTarget ? c.dim(`, ${st.notEnrolledInTarget} of them on a break`) : ''}`);
  console.log(c.dim(`    ${padStart(String(st.newIntake), 5)}  left out as new intake`));
  console.log(c.dim(`    ${padStart(String(st.notActive), 5)}  not enrolled the semester before, so a scrape then would not hold them`));
  console.log(c.dim(`    ${padStart(String(st.outcomeUnknown), 5)}  record stops before the target, so the outcome is unknown`));

  // Where the error comes from. The headline alone cannot say which part is worth improving.
  const outcomes = Object.entries(result.enrolmentOutcomes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = outcomes.reduce((sum, [, n]) => sum + n, 0);
  console.log(`\n  ${c.bold('What happened to each real enrolment')}  ${c.dim(`(${total})`)}`);
  for (const [outcome, n] of outcomes) {
    const hit = outcome === 'named pick' || outcome === 'elective share';
    const tag = hit ? c.green('hit ') : c.red('miss');
    console.log(`    ${tag}  ${padEnd(outcome, 36)} ${(hit ? c.green : c.red)(shareBar(n / total))} ${padStart(String(n), 5)}  ${padStart(pct(n / total), 6)}`);
  }

  if (unitsToList > 0) {
    console.log(`\n  ${c.bold('Units')}  ${c.dim('largest real classes first')}`);
    console.log(c.dim(`    ${padEnd('Unit', 11)}${padStart('Predicted', 10)}${padStart('Actual', 9)}${padStart('Miss', 9)}`));
    for (const unit of result.units.slice(0, unitsToList)) {
      // Colour the miss by how bad it is relative to the class, not in absolute students.
      const relative = unit.actual > 0 ? Math.abs(unit.error) / unit.actual : unit.predicted >= 0.5 ? 1 : 0;
      const missColour = relative <= 0.3 ? c.green : relative <= 0.7 ? c.yellow : c.red;
      const miss = `${unit.error >= 0 ? '+' : ''}${unit.error.toFixed(1)}`;
      console.log(
        `    ${padEnd(unit.code, 11)}${padStart(unit.predicted.toFixed(1), 10)}${padStart(String(unit.actual), 9)}`
        + `${padStart(missColour(miss), 9)}`,
      );
    }
    if (result.units.length > unitsToList) {
      console.log(c.dim(`    … ${result.units.length - unitsToList} more (--units=${result.units.length} to list them all)`));
    }
  }

  console.log(`\n  ${c.bold('Read this with')}`);
  for (const note of result.notes) {
    console.log(c.dim(wrap(note, '      ', '    • ')));
  }
}

function printHiddenWarnings(): void {
  if (hiddenWarnings === 0 || verbose) return;
  const why = hiddenAreMpuOnly
    ? 'all about MPU units, which the estimator leaves out on purpose'
    : 'mostly about units outside every planner';
  console.log(c.dim(`\n  ${hiddenWarnings.toLocaleString()} matching warnings hidden, ${why}. --verbose to show them.`));
}

// ====== Run ====================================================================================

async function main() {
  const records = dpaFolder ? dpaRecords(dpaFolder) : await generatedRecords();
  printHeader(records.length);

  // Every semester with enrolments except the first, which has nothing before it to predict from.
  const available = semestersWithEnrolments(records.map((record) => record.transcript)).slice(1);
  const targets = termFlag ? [parseTermFlag(termFlag)] : available;
  if (targets.length === 0) throw new Error('No semester has both a history and enrolments to compare against.');

  const results: BacktestResult[] = [];
  for (const target of targets) {
    if (process.stdout.isTTY) process.stdout.write(c.dim(`\r  scoring ${label(target)}…   `));
    const result = await runBacktest(records, { target });
    const scored = result.students.included - result.students.notEnrolledInTarget;
    if (scored >= minStudents) results.push(result);
  }
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(30) + '\r');

  if (results.length === 0) {
    console.log(c.yellow(`  No semester had at least ${minStudents} scored students. Lower it with --min.`));
    process.exit(0);
  }

  printSemesterTable(results);
  printDetail(results[results.length - 1]);
  printHiddenWarnings();
  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error(c.red(`\n  Backtest failed: ${error instanceof Error ? error.message : String(error)}`));
  if (/reach database|ECONNREFUSED|5433/i.test(String(error))) {
    console.error(c.dim('  The planners live in the local database. Start the app, or run node scripts/db-up.js.'));
  }
  process.exit(1);
});
