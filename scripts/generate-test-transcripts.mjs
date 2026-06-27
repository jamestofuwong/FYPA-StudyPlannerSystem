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
// Triggers:
//   - year_level_gap (CRITICAL): Y1/Y2 core units still missing in Year 3
//   - major_core_rate (HIGH): 0/8 major core done in Year 3
//   - failed_units (MEDIUM): failed COS20007 (not required-missing since F counts as completed)
// Overall: CRITICAL
write('test-transcript-CRITICAL.xlsx', [
  // Y1 Sem 1 — done
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete',   'A',    '2023/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 12.5, 'Complete',   'B+',   '2023/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete',   'B',    '2023/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete',   'C+',   '2023/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete',   'Pass', '2023/S2'),
  // Y1 Sem 2 — COS10025 never attempted (gap), COS20007 failed
  makeRow('COS20007', 'Object-oriented Programming',        12.5, 0,    'Incomplete', 'F',    '2024/S1'),
  // COS10025 missing entirely
  // Y2 and beyond — nothing attempted at all
], 'Intake Year=2023, Sem=2 → CRITICAL (year_level_gap in Year 3)');

// ─── HIGH ────────────────────────────────────────────────────────────────────
// Student: BCS AI, 2024 Sep intake → Year 2 (as of Jun 2026)
// Triggers:
//   - year_level_gap (HIGH): COS10025 (Y1 core) still missing in Year 2
//   - failed_units (MEDIUM): failed COS10026 (not in unmatchedCore so stays medium)
// Overall: HIGH
write('test-transcript-HIGH.xlsx', [
  // Y1 Sem 1 — mostly done, COS10026 failed
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete',   'A',    '2024/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 0,    'Incomplete', 'F',    '2024/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete',   'C',    '2024/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete',   'B',    '2024/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete',   'Pass', '2024/S2'),
  // Y1 Sem 2 — COS10025 missing entirely (gap), partial done
  makeRow('COS10022', 'Introduction to Data Science',       12.5, 12.5, 'Complete',   'B+',   '2025/S1'),
  makeRow('MPU3212',  'Bahasa Kebangsaan A',                0,    0,    'Complete',   'Pass', '2025/S1'),
  // Y2 major core — just started, so major is detectable
  makeRow('COS20031', 'Database Design Project',            12.5, 12.5, 'Complete',   'B',    '2025/S1'),
  makeRow('COS30019', 'Introduction to Artificial Intelligence', 12.5, 12.5, 'Complete', 'B+', '2025/S1'),
  // COS10025 (Y1S2 core) deliberately not in this file → it will be in unmatchedCore
  // Y2 Sem 2 — currently enrolled
  makeRow('COS20019', 'Cloud Computing Architecture',       12.5, 0,    'Current',    'N',    '2025/S2'),
], 'Intake Year=2024, Sem=2 → HIGH (year_level_gap: COS10025 missing in Year 2)');

// ─── MEDIUM ───────────────────────────────────────────────────────────────────
// Student: BCS AI, 2023 Sep intake → Year 3 (as of Jun 2026)
// Triggers:
//   - major_core_rate (MEDIUM): 4/8 major core done in Year 3 = 50% (0.4–0.6 range)
// No year_level_gap (all Y1/Y2 core complete), no fails
// Overall: MEDIUM
write('test-transcript-MEDIUM.xlsx', [
  // Y1 Sem 1 — complete
  makeRow('COS10009', 'Introduction to Programming',        12.5, 12.5, 'Complete', 'A',    '2023/S2'),
  makeRow('COS10026', 'Web Technology Project',             12.5, 12.5, 'Complete', 'A-',   '2023/S2'),
  makeRow('TNE10006', 'Networks and Switching',             12.5, 12.5, 'Complete', 'B+',   '2023/S2'),
  makeRow('COS10003', 'Computer and Logic Essentials',      12.5, 12.5, 'Complete', 'B',    '2023/S2'),
  makeRow('MPU3193',  'Philosophy and Current Issues',      0,    0,    'Complete', 'Pass', '2023/S2'),
  // Y1 Sem 2 — complete (including COS10025 — no gap)
  makeRow('COS10025', 'Technology in an Indigenous Context Project', 12.5, 12.5, 'Complete', 'B', '2024/S1'),
  makeRow('COS20007', 'Object-oriented Programming',        12.5, 12.5, 'Complete', 'B+',   '2024/S1'),
  makeRow('COS10022', 'Introduction to Data Science',       12.5, 12.5, 'Complete', 'B',    '2024/S1'),
  makeRow('MPU3212',  'Bahasa Kebangsaan A',                0,    0,    'Complete', 'Pass', '2024/S1'),
  // Y2 Sem 1 — complete
  makeRow('COS20031', 'Database Design Project',            12.5, 12.5, 'Complete', 'B',    '2024/S2'),
  makeRow('COS30019', 'Introduction to Artificial Intelligence', 12.5, 12.5, 'Complete', 'B+', '2024/S2'),
  makeRow('SWE30009', 'Software Testing and Reliability',   12.5, 12.5, 'Complete', 'C+',   '2024/S2'),
  makeRow('MPU3143',  'Malay Language Communication 2',     0,    0,    'Complete', 'Pass', '2024/S2'),
  makeRow('MPU3183',  'Penghayatan Etika dan Peradaban',    0,    0,    'Complete', 'Pass', '2024/S2'),
  // Y2 Sem 2 — complete (4 major core total: COS20031, COS30019, COS20019, COS30049)
  makeRow('COS10004', 'Computer Systems',                   12.5, 12.5, 'Complete', 'B',    '2025/S1'),
  makeRow('COS20019', 'Cloud Computing Architecture',       12.5, 12.5, 'Complete', 'B-',   '2025/S1'),
  makeRow('COS30049', 'Computing Technology Innovation Project', 12.5, 12.5, 'Complete', 'B', '2025/S1'),
  // Y3 Sem 1 — currently doing (COS30082 is the 5th major core but not complete yet)
  makeRow('COS40005', 'Computing Technology Project A',     12.5, 0,    'Current',  'N',    '2025/S2'),
  makeRow('COS30082', 'Applied Machine Learning',           12.5, 0,    'Current',  'N',    '2025/S2'),
  // Note: COS30018 (5th major core) deliberately not completed
], 'Intake Year=2023, Sem=2 → MEDIUM (major_core_rate: 4/8=50% in Year 3)');

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
