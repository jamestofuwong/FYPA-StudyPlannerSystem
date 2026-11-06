import { completedSemestersFromTranscript } from '../../../core/shared/transcriptImport';
import type { ScrapedCourseListItem } from '../../../core/shared/types/student';

const row = (courseId: string, term: string, grade = 'D', status = 'Complete'): ScrapedCourseListItem => ({
  courseId, courseTitle: courseId, level: '', credits: 12.5, creditsEarned: status === 'Complete' && grade !== 'N' ? 12.5 : 0, status, grade, term,
});
const codes = (result: ReturnType<typeof completedSemestersFromTranscript>) => result.semesters.map((s) => s.unitCodes);

describe('completedSemestersFromTranscript', () => {
  test('one semester for each term, in date order, whatever the order of the rows', () => {
    const rows = [
      row('COS20007', '2026_SEP_S2'), row('COS10009', '2026_MAR_S1'), row('COS30019', '2027_MAR_S1'),
      row('COS10003', '2026_MAR_S1'), row('COS20031', '2026_SEP_S2'),
    ];
    const result = completedSemestersFromTranscript(rows);
    expect(codes(result)).toEqual([['COS10003', 'COS10009'], ['COS20007', 'COS20031'], ['COS30019']]);
    expect(result.semesters.map((s) => s.term)).toEqual(['2026_MAR_S1', '2026_SEP_S2', '2027_MAR_S1']);
    expect(result.firstTerm).toBe('2026_MAR_S1');
    expect(result.passed).toEqual(['COS10003', 'COS10009', 'COS20007', 'COS20031', 'COS30019']);
  });

  test('a semester that the student skipped stays as an empty one, so the next term is placed correctly', () => {
    const result = completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1'), row('COS20007', '2027_MAR_S1')]);
    expect(codes(result)).toEqual([['COS10009'], [], ['COS20007']]);
    expect(result.semesters[1].term).toBe('');
  });

  test('an August or September intake that writes its first semester as S1 is still the second calendar semester', () => {
    const result = completedSemestersFromTranscript([row('COS10009', '2024_SEP_S1'), row('COS20007', '2025_MAR_S2')]);
    expect(codes(result)).toEqual([['COS10009'], ['COS20007']]);
  });

  test('a failed unit is left out and listed, and a unit failed and then passed counts in the later term', () => {
    const rows = [
      row('COS10009', '2026_MAR_S1', 'N'), row('COS10026', '2026_MAR_S1', 'D'),
      row('COS20007', '2026_SEP_S2', 'N'), row('COS20007', '2027_MAR_S1', 'SP'),
      row('COS30019', '2027_MAR_S1', 'N'),
    ];
    const result = completedSemestersFromTranscript(rows);
    expect(result.failed).toEqual(['COS10009', 'COS30019']);
    expect(codes(result)).toEqual([['COS10026'], [], ['COS20007']]);
  });

  test('a unit that is being taken now counts as done, and is listed apart', () => {
    const result = completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1'), row('COS20007', '2026_SEP_S2', '', 'Current')]);
    expect(codes(result)).toEqual([['COS10009'], ['COS20007']]);
    expect(result.inProgress).toEqual(['COS20007']);
    expect(result.passed).toEqual(['COS10009']);
  });

  test('a Conceded Pass earns credit, so the unit counts as passed', () => {
    const result = completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1', 'CP')]);
    expect(result.passed).toEqual(['COS10009']);
  });

  test('a unit with an unknown grade and status Complete counts (credit transfer), a Future unit does not', () => {
    const result = completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1', '', 'Complete'), row('COS20007', '2027_MAR_S1', '', 'Future')]);
    expect(result.passed).toEqual(['COS10009']);
    expect(codes(result)).toEqual([['COS10009']]);
  });

  test('a summer or winter term joins the semester before it and does not add a semester', () => {
    const result = completedSemestersFromTranscript([
      row('COS10009', '2026_MAR_S1'), row('MPU3212', '2026_JUN_WT'), row('COS20007', '2026_SEP_S2'), row('ICT20016', '2027_JAN_ST'),
    ]);
    expect(codes(result)).toEqual([['COS10009', 'MPU3212'], ['COS20007', 'ICT20016']]);
  });

  test('a row with no readable term still counts, in the first semester, and is listed', () => {
    const result = completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1'), row('COS20007', ''), row('COS30019', 'last year')]);
    expect(codes(result)).toEqual([['COS10009', 'COS20007', 'COS30019']]);
    expect(result.withoutTerm).toEqual(['COS20007', 'COS30019']);
  });

  test('a file with no readable term at all becomes one semester', () => {
    const result = completedSemestersFromTranscript([row('COS10009', ''), row('COS20007', '')]);
    expect(codes(result)).toEqual([['COS10009', 'COS20007']]);
    expect(result.firstTerm).toBeNull();
  });

  test('a file with only short terms becomes one semester', () => {
    const result = completedSemestersFromTranscript([row('MPU3212', '2026_JUN_WT')]);
    expect(codes(result)).toEqual([['MPU3212']]);
  });

  test('nothing to import gives no semesters', () => {
    expect(completedSemestersFromTranscript([]).semesters).toEqual([]);
    expect(completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1', 'N')]).semesters).toEqual([]);
  });

  test('codes are tidied (case, spaces) and each unit is listed once', () => {
    const result = completedSemestersFromTranscript([row(' cos10009 ', '2026_MAR_S1'), row('COS10009', '2026_MAR_S1')]);
    expect(codes(result)).toEqual([['COS10009']]);
    expect(result.passed).toEqual(['COS10009']);
  });

  test('no grade is kept in the result', () => {
    expect(JSON.stringify(completedSemestersFromTranscript([row('COS10009', '2026_MAR_S1', 'HD')]))).not.toMatch(/HD/);
  });
});
