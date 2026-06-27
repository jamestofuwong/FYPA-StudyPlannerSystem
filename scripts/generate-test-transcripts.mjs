/**
 * Generates 4 test XLSX transcripts for the F4 At-Risk Detection feature.
 * Based on BCS AI 2023 Sep planner (the most complete planner in the DB).
 *
 * Usage:
 *   node scripts/generate-test-transcripts.mjs
 *
 * Output: test-data/ directory with 4 XLSX files.
 *
 * When importing in the dashboard:
 *   - Set "Course" to BCS / BA-CS
 *   - Set "Intake Year" and "Intake Semester" as noted per file
 */

import XLSX from 'xlsx-js-style';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'test-data');
fs.mkdirSync(OUT_DIR, { recursive: true });

const HEADER = ['Unit Code', 'Unit Title', 'Credit Points', 'Credit Earned', 'Status', 'Grade', 'Study Period'];

function makeRow(code, title, cp, earned, status, grade, term) {
  return [code, title, cp, earned, status, grade, term];
}

function write(filename, rows, note) {
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transcript');
  const outPath = path.join(OUT_DIR, filename);
  XLSX.writeFile(wb, outPath);
  console.log(`✓ ${filename} — ${note}`);
}

// ─── CRITICAL ────────────────────────────────────────────────────────────────
// Student: BCS AI, 2023 Sep intake → Year 3 (as of Jun 2026)
// Only Y1S1 units done. No major detectable (matchPct ≈ 20% < 30% threshold).
// Triggers:
//   - no_major_late (CRITICAL): noMajorDetected in Year 3
//   - major_core_rate (HIGH): 0/8 major core in Year 3 (from rankedPlanners top score)
//   - failed_units (MEDIUM): COS20007 grade F (counted for matching, flagged as failed)
// Aggregate: CRITICAL
write('test-transcript-CRITICAL.xlsx', [
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete',   'A',    '2023/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 12.5, 'Complete',   'B+',   '2023/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete',   'B',    '2023/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete',   'C+',   '2023/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete',   'Pass', '2023/S2'),
  // COS20007 failed — counts as completed for matching (F != N) but flagged as failed in risk check
  makeRow('COS20007', 'Object-oriented Programming',        12.5, 0,    'Incomplete', 'F',    '2024/S1'),
  // COS10025 and all Y2+ units never attempted → no major detectable
], 'Intake Year=2023, Sem=2 → CRITICAL (noMajorDetected in Year 3)');

// ─── HIGH ────────────────────────────────────────────────────────────────────
// Student: BCS AI, 2024 Sep intake → Year 2 (as of Jun 2026)
// A few units done but no major detectable (matchPct ≈ 22% < 30%).
// COS10025 (Y1S1 core in 2024 Sep planner) never attempted.
// Triggers:
//   - no_major_late (HIGH): noMajorDetected in Year 2
//   - OR year_level_gap (HIGH): COS10025 Y1 missing in Year 2 (if major detected via prescribed slots)
//   - failed_units (MEDIUM): COS10026 grade F
// Aggregate: HIGH
write('test-transcript-HIGH.xlsx', [
  // COS10026 failed — counts for matching, flagged as failed
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete',   'A',    '2024/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 0,    'Incomplete', 'F',    '2024/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete',   'C',    '2024/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete',   'B',    '2024/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete',   'Pass', '2024/S2'),
  makeRow('COS10022', 'Introduction to Data Science',       12.5, 12.5, 'Complete',   'B+',   '2025/S1'),
  makeRow('MPU3212',  'Bahasa Kebangsaan A',                0,    0,    'Complete',   'Pass', '2025/S1'),
  makeRow('COS20031', 'Database Design Project',            12.5, 12.5, 'Complete',   'B',    '2025/S1'),
  makeRow('COS30019', 'Introduction to Artificial Intelligence', 12.5, 12.5, 'Complete', 'B+', '2025/S1'),
  // COS10025 (Y1S1 core in 2024 Sep planner) deliberately absent → year_level_gap fires if detected
  makeRow('COS20019', 'Cloud Computing Architecture',       12.5, 0,    'Current',    'N',    '2025/S2'),
], 'Intake Year=2024, Sem=2 → HIGH (noMajorDetected or yearLevelGap in Year 2)');

// ─── MEDIUM ───────────────────────────────────────────────────────────────────
// Student: BCS AI, 2023 Sep intake → Year 3 (as of Jun 2026)
// All Y1+Y2 required units done (no year_level_gap). COS30018 was failed (grade F)
// but since F != N it is still counted as completed by the matching engine, so it
// is NOT in missingRequired. This triggers assessFailedUnits at MEDIUM severity.
// Triggers:
//   - failed_units (MEDIUM): COS30018 grade F, not in missingCore
// No year_level_gap (all Y1/Y2 units present, even if failed).
// Aggregate: MEDIUM
write('test-transcript-MEDIUM.xlsx', [
  // Y1 Sem 1 — complete
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete', 'A',    '2023/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 12.5, 'Complete', 'A-',   '2023/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete', 'B+',   '2023/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete', 'B',    '2023/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete', 'Pass', '2023/S2'),
  // Y1 Sem 2 — complete, no gaps
  makeRow('COS10025', 'Technology in an Indigenous Context Project', 12.5, 12.5, 'Complete', 'A-', '2024/S1'),
  makeRow('COS20007', 'Object-oriented Programming',        12.5, 12.5, 'Complete', 'A',    '2024/S1'),
  makeRow('COS10022', 'Introduction to Data Science',       12.5, 12.5, 'Complete', 'A-',   '2024/S1'),
  makeRow('COS30015', 'IT Security',                        12.5, 12.5, 'Complete', 'B+',   '2024/S1'),
  makeRow('MPU3212',  'Bahasa Kebangsaan A',                0,    0,    'Complete', 'Pass', '2024/S1'),
  // Y2 Sem 1 — complete
  makeRow('COS20031', 'Database Design Project',            12.5, 12.5, 'Complete', 'A-',   '2024/S2'),
  makeRow('COS30019', 'Introduction to Artificial Intelligence', 12.5, 12.5, 'Complete', 'A', '2024/S2'),
  makeRow('SWE30009', 'Software Testing and Reliability',   12.5, 12.5, 'Complete', 'B+',   '2024/S2'),
  makeRow('MPU3143',  'Malay Language Communication 2',     0,    0,    'Complete', 'Pass', '2024/S2'),
  makeRow('MPU3183',  'Penghayatan Etika dan Peradaban',    0,    0,    'Complete', 'Pass', '2024/S2'),
  // Y2 Sem 2 — COS30018 FAILED (grade F counts for matching, flagged as failed risk)
  makeRow('COS10004', 'Computer Systems',                   12.5, 12.5, 'Complete', 'A-',   '2025/S1'),
  makeRow('COS20019', 'Cloud Computing Architecture',       12.5, 12.5, 'Complete', 'A',    '2025/S1'),
  makeRow('COS30018', 'Intelligent Systems',                12.5, 0,    'Incomplete','F',    '2025/S1'),
  makeRow('COS30049', 'Computing Technology Innovation Project', 12.5, 12.5, 'Complete', 'A-', '2025/S1'),
  // Y3 Sem 1 — complete
  makeRow('COS40005', 'Computing Technology Project A',     12.5, 12.5, 'Complete', 'A',    '2025/S2'),
  makeRow('COS30082', 'Applied Machine Learning',           12.5, 12.5, 'Complete', 'A',    '2025/S2'),
  // Y3 Sem 2 — currently enrolled
  makeRow('COS40006', 'Computing Technology Project B',     12.5, 0,    'Current',  'N',    '2026/S1'),
  makeRow('COS40007', 'Artificial Intelligence for Engineering', 12.5, 0, 'Current', 'N',   '2026/S1'),
  makeRow('SWE30003', 'Software Architecture and Design',   12.5, 0,    'Current',  'N',    '2026/S1'),
  makeRow('COS20083', 'Advanced Data Analytics',            12.5, 12.5, 'Complete', 'B+',   '2025/S1'),
  makeRow('COS30045', 'Data Visualisation',                 12.5, 12.5, 'Complete', 'B',    '2025/S2'),
], 'Intake Year=2023, Sem=2 → MEDIUM (failed unit COS30018, no year_level_gap)');

// ─── LOW ──────────────────────────────────────────────────────────────────────
// Student: BCS AI, 2023 Sep intake → Year 3 (as of Jun 2026)
// Excellent progress: all Y1+Y2 core done, 6/8 major core done = 75% (above 0.6 threshold)
// No gaps, no fails → LOW (no risk factors)
write('test-transcript-LOW.xlsx', [
  // Y1 Sem 1 — complete
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete', 'A',    '2023/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 12.5, 'Complete', 'A',    '2023/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete', 'A-',   '2023/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete', 'B+',   '2023/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete', 'Pass', '2023/S2'),
  // Y1 Sem 2 — complete, no gaps
  makeRow('COS10025', 'Technology in an Indigenous Context Project', 12.5, 12.5, 'Complete', 'A-', '2024/S1'),
  makeRow('COS20007', 'Object-oriented Programming',        12.5, 12.5, 'Complete', 'A',    '2024/S1'),
  makeRow('COS10022', 'Introduction to Data Science',       12.5, 12.5, 'Complete', 'A-',   '2024/S1'),
  makeRow('COS30015', 'IT Security',                        12.5, 12.5, 'Complete', 'B+',   '2024/S1'),
  makeRow('MPU3212',  'Bahasa Kebangsaan A',                0,    0,    'Complete', 'Pass', '2024/S1'),
  // Y2 Sem 1 — complete
  makeRow('COS20031', 'Database Design Project',            12.5, 12.5, 'Complete', 'A-',   '2024/S2'),
  makeRow('COS30019', 'Introduction to Artificial Intelligence', 12.5, 12.5, 'Complete', 'A', '2024/S2'),
  makeRow('SWE30009', 'Software Testing and Reliability',   12.5, 12.5, 'Complete', 'B+',   '2024/S2'),
  makeRow('MPU3143',  'Malay Language Communication 2',     0,    0,    'Complete', 'Pass', '2024/S2'),
  makeRow('MPU3183',  'Penghayatan Etika dan Peradaban',    0,    0,    'Complete', 'Pass', '2024/S2'),
  // Y2 Sem 2 — complete
  makeRow('COS10004', 'Computer Systems',                   12.5, 12.5, 'Complete', 'A-',   '2025/S1'),
  makeRow('COS20019', 'Cloud Computing Architecture',       12.5, 12.5, 'Complete', 'A',    '2025/S1'),
  makeRow('COS30018', 'Intelligent Systems',                12.5, 12.5, 'Complete', 'A',    '2025/S1'),
  makeRow('COS30049', 'Computing Technology Innovation Project', 12.5, 12.5, 'Complete', 'A-', '2025/S1'),
  // Y3 Sem 1 — complete (6/8 major core done)
  makeRow('COS40005', 'Computing Technology Project A',     12.5, 12.5, 'Complete', 'A',    '2025/S2'),
  makeRow('COS30082', 'Applied Machine Learning',           12.5, 12.5, 'Complete', 'A',    '2025/S2'),
  // Y3 Sem 2 — currently enrolled
  makeRow('COS40006', 'Computing Technology Project B',     12.5, 0,    'Current',  'N',    '2026/S1'),
  makeRow('COS40007', 'Artificial Intelligence for Engineering', 12.5, 0, 'Current', 'N',   '2026/S1'),
  makeRow('SWE30003', 'Software Architecture and Design',   12.5, 0,    'Current',  'N',    '2026/S1'),
  // Free electives
  makeRow('COS20083', 'Advanced Data Analytics',            12.5, 12.5, 'Complete', 'B+',   '2025/S1'),
  makeRow('COS30045', 'Data Visualisation',                 12.5, 12.5, 'Complete', 'B',    '2025/S2'),
], 'Intake Year=2023, Sem=2 → LOW (6/8 major core, no gaps, no fails)');

console.log(`\nFiles written to: ${OUT_DIR}`);
console.log('\nImport instructions for each file:');
console.log('  All files: Course = BA-CS (Bachelor of Computer Science)');
console.log('  CRITICAL  → Intake Year: 2023, Intake Semester: 2 (Sep)');
console.log('  HIGH      → Intake Year: 2024, Intake Semester: 2 (Sep)');
console.log('  MEDIUM    → Intake Year: 2023, Intake Semester: 2 (Sep)');
console.log('  LOW       → Intake Year: 2023, Intake Semester: 2 (Sep)');
