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

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const label = (t: TargetSemester) => `${t.year} S${t.semester}`;

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
          console.warn(`  skipped a student in ${file}: no ID in the sheet or the filename`);
          continue;
        }
        records.push(buildEstimationRecord({ source: 'import', studentId, transcript: student.courseList }));
      }
    } catch (error) {
      console.warn(`  skipped ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return records;
}

function parseTermFlag(value: string): TargetSemester {
  const match = /^(\d{4})-([12])$/.exec(value.trim());
  if (!match) throw new Error(`--term must look like 2026-1, got "${value}"`);
  return { year: Number(match[1]), semester: Number(match[2]) as 1 | 2 };
}

function printDetail(result: BacktestResult): void {
  const s = result.summary;
  console.log(`\n=== ${label(result.target)} in detail ===`);
  console.log(`accuracy ${pct(s.accuracy)} (${result.grade}), WAPE ${pct(s.wape)}, bias ${s.bias >= 0 ? '+' : ''}${pct(s.bias)}`);
  console.log(`units within ${pct(s.tolerance)} of reality: ${pct(s.withinTolerance)} of ${s.units}`);
  const st = result.students;
  console.log(`students: ${st.included} scored (${st.notEnrolledInTarget} of them on a break), `
    + `${st.newIntake} new intake left out, ${st.notActive} not enrolled the semester before, `
    + `${st.outcomeUnknown} whose record stops before the target`);
  console.log(`per student: recall ${pct(result.studentRecall)}, precision ${pct(result.studentPrecision)}, `
    + `coverage ${pct(result.coverage)}`);

  // Where the error comes from. The headline cannot say which part of the estimator is worth improving.
  const outcomeTotal = Object.values(result.enrolmentOutcomes).reduce((a, b) => a + b, 0);
  console.log('\nwhat happened to each real enrolment:');
  for (const [outcome, n] of Object.entries(result.enrolmentOutcomes).sort((a, b) => b[1] - a[1])) {
    if (n === 0) continue;
    const kind = outcome === 'named pick' || outcome === 'elective share' ? 'hit ' : 'miss';
    console.log(`  ${String(n).padStart(5)}  ${pct(n / outcomeTotal).padStart(6)}  ${kind}  ${outcome}`);
  }

  if (unitsToList > 0) console.log(`\n  unit        predicted   actual    miss`);
  for (const unit of result.units.slice(0, unitsToList)) {
    console.log(
      `  ${unit.code.padEnd(10)} ${unit.predicted.toFixed(1).padStart(10)} ${String(unit.actual).padStart(8)}`
      + ` ${(unit.error >= 0 ? '+' : '') + unit.error.toFixed(1)}`.padStart(8),
    );
  }
  if (unitsToList > 0 && result.units.length > unitsToList) console.log(`  ... ${result.units.length - unitsToList} more`);

  console.log('\nread this with:');
  for (const note of result.notes) console.log(`  - ${note}`);
}

async function main() {
  const records = dpaFolder ? dpaRecords(dpaFolder) : await generatedRecords();
  console.log(`${records.length} students from ${dpaFolder ? `DPA files in ${dpaFolder}` : `a generated cohort (seed ${seed})`}`);

  // Every semester with enrolments except the first, which has nothing before it to predict from.
  const available = semestersWithEnrolments(records.map((record) => record.transcript)).slice(1);
  const targets = termFlag ? [parseTermFlag(termFlag)] : available;
  if (targets.length === 0) throw new Error('No semester has both a history and enrolments to compare against.');

  console.log('\nsemester   scored   accuracy   grade          within30%   recall   coverage');
  console.log('-'.repeat(80));

  const results: BacktestResult[] = [];
  for (const target of targets) {
    const result = await runBacktest(records, { target });
    const scored = result.students.included - result.students.notEnrolledInTarget;
    if (scored < minStudents) continue;
    results.push(result);
    console.log(
      label(target).padEnd(11)
      + String(scored).padStart(6)
      + pct(result.summary.accuracy).padStart(11)
      + `   ${result.grade}`.padEnd(17)
      + pct(result.summary.withinTolerance).padStart(9)
      + pct(result.studentRecall).padStart(9)
      + pct(result.coverage).padStart(11),
    );
  }

  if (results.length === 0) {
    console.log(`(no semester had at least ${minStudents} scored students; lower it with --min)`);
    process.exit(0);
  }
  printDetail(results[results.length - 1]);
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
