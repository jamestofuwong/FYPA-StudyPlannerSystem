import { parseResultsSheet } from '../../../web/lib/resultsSheet';

const HEADER = ['Course', 'Course Title', 'Credits', 'Earned', 'Status', 'Grade', 'Term'];

describe('parseResultsSheet', () => {
  it('reads every column by its name', () => {
    const result = parseResultsSheet([
      HEADER,
      ['COS10009', 'Introduction to Programming', 12.5, 12.5, 'Complete', 'D', '2024 Sem 1'],
    ]);
    expect(result).toEqual({
      ok: true,
      courseList: [{
        courseId: 'COS10009', courseTitle: 'Introduction to Programming', level: '',
        credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'D', term: '2024 Sem 1',
      }],
    });
  });

  it('does not care about the order of the columns', () => {
    const result = parseResultsSheet([
      ['Term', 'Grade', 'Status', 'Earned', 'Credits', 'Course Title', 'Course'],
      ['2024', 'HD', 'Complete', 12.5, 12.5, 'Programming', 'COS10009'],
    ]);
    expect(result).toMatchObject({ ok: true });
    expect((result as { courseList: unknown[] }).courseList[0]).toMatchObject({
      courseId: 'COS10009', courseTitle: 'Programming', status: 'Complete', grade: 'HD', term: '2024', credits: 12.5, creditsEarned: 12.5,
    });
  });

  it('ignores extra columns', () => {
    const result = parseResultsSheet([
      ['#', ...HEADER, 'Notes'],
      [1, 'COS10009', 'Programming', 12.5, 12.5, 'Complete', 'D', '2024', 'transferred'],
    ]);
    expect((result as { courseList: { courseId: string; term: string }[] }).courseList[0]).toMatchObject({ courseId: 'COS10009', term: '2024' });
  });

  it('ignores case, spaces and repeated spaces in the header', () => {
    const result = parseResultsSheet([
      [' course ', 'COURSE  TITLE', 'credits', 'EARNED', ' Status', 'grade', 'term'],
      ['COS10009', 'Programming', 12.5, 12.5, 'Complete', 'D', '2024'],
    ]);
    expect(result).toMatchObject({ ok: true });
  });

  it('finds the header when title rows sit above it', () => {
    const result = parseResultsSheet([
      ['Student results'],
      [],
      HEADER,
      ['COS10009', 'Programming', 12.5, 12.5, 'Complete', 'D', '2024'],
    ]);
    expect((result as { courseList: unknown[] }).courseList).toHaveLength(1);
  });

  it('keeps a row whose trailing cells are empty', () => {
    const result = parseResultsSheet([
      HEADER,
      ['COS10009', 'Programming', 12.5, 0, 'Current'], // no grade, no term
    ]);
    expect((result as { courseList: { status: string; grade: string }[] }).courseList[0]).toMatchObject({ status: 'Current', grade: '' });
  });

  it('works without the optional columns', () => {
    const result = parseResultsSheet([
      ['Course', 'Credits', 'Earned', 'Status'],
      ['COS10009', 12.5, 12.5, 'Complete'],
    ]);
    expect((result as { courseList: unknown[] }).courseList[0]).toMatchObject({
      courseId: 'COS10009', courseTitle: '', grade: '', term: '', status: 'Complete',
    });
  });

  it('skips rows with no course code and blank rows', () => {
    const result = parseResultsSheet([
      HEADER,
      ['COS10009', 'A', 12.5, 12.5, 'Complete', 'D', '2024'],
      [],
      ['', 'No code', 12.5, 12.5, 'Complete', 'D', '2024'],
      ['  ', 'Blank code'],
      ['COS20007', 'B', 12.5, 12.5, 'Complete', 'C', '2024'],
    ]);
    expect((result as { courseList: { courseId: string }[] }).courseList.map((c) => c.courseId)).toEqual(['COS10009', 'COS20007']);
  });

  it('turns non-numeric credits into 0', () => {
    const result = parseResultsSheet([HEADER, ['COS10009', 'A', 'n/a', '', 'Complete', 'D', '2024']]);
    expect((result as { courseList: { credits: number; creditsEarned: number }[] }).courseList[0]).toMatchObject({ credits: 0, creditsEarned: 0 });
  });

  it('uses the first of two columns with the same name', () => {
    const result = parseResultsSheet([
      ['Course', 'Credits', 'Earned', 'Status', 'Status'],
      ['COS10009', 12.5, 12.5, 'Complete', 'Withdrawn'],
    ]);
    expect((result as { courseList: { status: string }[] }).courseList[0].status).toBe('Complete');
  });

  describe('errors', () => {
    it('names the required columns that are missing', () => {
      const result = parseResultsSheet([['Course', 'Course Title', 'Credits'], ['COS10009', 'A', 12.5]]);
      expect(result.ok).toBe(false);
      const error = (result as { error: string }).error;
      expect(error).toContain('"Earned"');
      expect(error).toContain('"Status"');
      expect(error).not.toContain('"Credits"');
    });

    it('explains what the file needs when no header is found', () => {
      const result = parseResultsSheet([['a', 'b'], [1, 2]]);
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(/Course, Credits, Earned, Status, Course Title, Grade, Term/);
    });

    it('reports a header with no data under it', () => {
      expect(parseResultsSheet([HEADER])).toEqual({ ok: false, error: 'File has no data rows.' });
    });

    it('copes with an empty sheet', () => {
      expect(parseResultsSheet([]).ok).toBe(false);
    });
  });
});
