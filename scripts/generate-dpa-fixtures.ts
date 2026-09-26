#!/usr/bin/env node
/**
 * Writes mock student DPA files for testing class estimation without portal access.
 *   npm run fixtures:dpa
 *
 * Options:
 *   --count=30        how many students (default 30)
 *   --seed=1          same seed, same cohort (default 1)
 *   --out=<dir>       output directory (default tests/fixtures/dpa)
 *   --single          also write one file per student, the shape the portal exports
 *   --majors=a,b      only use planners whose major name contains one of these (case insensitive)
 *
 * Planners come from the system's own planner database, so mock students follow the majors actually
 * loaded rather than one hand-written stand-in. That means the local Postgres has to be running: it is
 * started by the Electron app, so run `npm run dev` first, or point DATABASE_URL at another instance.
 *
 * Produces a single multi-student sheet by default, which is how a cohort would be bulk loaded. With
 * --single it also writes one file per student, named so the student ID can be read off the filename,
 * which is the other layout the importer accepts.
 */

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx-js-style';
import * as plannerRepository from '../core/db/repositories/plannerRepository';
import {
  generateStudents,
  assertDistinctHistories,
  plannersToFixtures,
  toMultiStudentRows,
  toSingleStudentRows,
} from '../core/services/classEstimation/dpaImport/fixtureGenerator';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : fallback;
};

const count = Number(flag('count', '30'));
const seed = Number(flag('seed', '1'));
const outDir = path.resolve(process.cwd(), flag('out', path.join('tests', 'fixtures', 'dpa')));
const alsoSingle = args.includes('--single');
const majorFilter = flag('majors', '').split(',').map((m) => m.trim().toLowerCase()).filter(Boolean);

/**
 * core/db has no per-unit credit field, so the known exceptions are supplied here. Everything else falls
 * back to the standard 12.5. Taken from a real DPA export.
 */
const CREDITS_BY_CODE: Record<string, number> = {
  AIMFECS: 0,
  ICT20026: 25,
  ICT20016: 25,
};

function writeSheet(rows: unknown[][], filePath: string): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  XLSX.writeFile(wb, filePath);
}

async function main(): Promise<void> {
  let dbPlanners;
  try {
    dbPlanners = await plannerRepository.getAllPlannersWithUnits();
  } catch (err) {
    console.error('[fixtures] could not read planners from the database.');
    console.error('[fixtures] the local Postgres is started by the Electron app, so run `npm run dev` first.');
    console.error(`[fixtures] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  let fixtures = plannersToFixtures(dbPlanners, { creditsByCode: CREDITS_BY_CODE });

  if (majorFilter.length > 0) {
    fixtures = fixtures.filter((p) => majorFilter.some((m) => p.majorName.toLowerCase().includes(m)));
  }

  if (fixtures.length === 0) {
    console.error('[fixtures] no usable planners found.');
    console.error('[fixtures] import or sync planners first, or relax --majors.');
    console.error(`[fixtures] read ${dbPlanners.length} planner(s) from the database.`);
    process.exit(1);
  }

  console.log(`[fixtures] using ${fixtures.length} planner(s):`);
  for (const planner of fixtures) {
    console.log(`[fixtures]   ${planner.majorName} (${planner.units.length} units)`);
  }

  const students = generateStudents({ planners: fixtures, count, seed });

  // Fail loudly rather than writing a cohort whose students are interchangeable, which would make every
  // cohort-level signal look like it works while returning the same answer for everyone.
  assertDistinctHistories(students);

  fs.mkdirSync(outDir, { recursive: true });

  const cohortPath = path.join(outDir, `cohort-${count}-seed${seed}.xlsx`);
  writeSheet(toMultiStudentRows(students), cohortPath);
  console.log(`[fixtures] wrote ${cohortPath} (${students.length} students, one sheet)`);

  if (alsoSingle) {
    const singleDir = path.join(outDir, 'single');
    fs.mkdirSync(singleDir, { recursive: true });
    for (const student of students) {
      writeSheet(toSingleStudentRows(student), path.join(singleDir, `${student.studentId}_DPA.xlsx`));
    }
    console.log(`[fixtures] wrote ${students.length} single-student files to ${singleDir}`);
  }

  const ids = students.map((s) => Number(s.studentId));
  const majors = [...new Set(students.map((s) => s.majorName))];
  const intakes = [...new Set(students.map((s) => `${s.intake.year}S${s.intake.semester}`))].sort();
  console.log(`[fixtures] student IDs ${Math.min(...ids)} to ${Math.max(...ids)}`);
  console.log(`[fixtures] majors: ${majors.join(' | ')}`);
  console.log(`[fixtures] intakes: ${intakes.join(', ')}`);
  console.log(`[fixtures] ${new Set(students.map(( s) => `${s.majorName}|${s.semestersElapsed}`)).size} major/progress combinations`);
}

main()
  .catch((err) => {
    console.error('[fixtures] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    // Prisma keeps the process alive otherwise.
    const { prisma } = await import('../core/db/client');
    await prisma.$disconnect();
  });
