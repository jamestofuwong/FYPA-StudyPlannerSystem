/**
 * POST /api/import reads the uploaded workbook's first sheet by column name.
 * The privacy-notice check is mocked; the workbooks are real .xlsx files.
 */
import * as XLSX from 'xlsx-js-style';

const mockFindFirst = jest.fn();
jest.mock('../../core/db/client', () => ({
  prisma: { privacyEvent: { findFirst: (...a: unknown[]) => mockFindFirst(...a) } },
}));

import { POST } from '../../web/app/api/import/route';

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function upload(buffer: Buffer | null) {
  const form = new FormData();
  if (buffer) form.append('file', new Blob([new Uint8Array(buffer)]), 'results.xlsx');
  const res = await POST(new Request('http://localhost/api/import', { method: 'POST', body: form }) as never);
  return { status: res.status, body: await res.json() };
}

const HEADER = ['Course', 'Course Title', 'Credits', 'Earned', 'Status', 'Grade', 'Term'];

beforeEach(() => {
  jest.clearAllMocks();
  mockFindFirst.mockResolvedValue({ id: 1 });
});

describe('POST /api/import', () => {
  it('reads the course list from a workbook', async () => {
    const { status, body } = await upload(workbook({ Sheet1: [HEADER, ['COS10009', 'Programming', 12.5, 12.5, 'Complete', 'D', '2024']] }));
    expect(status).toBe(200);
    expect(body.courseList).toEqual([
      { courseId: 'COS10009', courseTitle: 'Programming', level: '', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'D', term: '2024' },
    ]);
  });

  it('finds columns by name when they are in a different order', async () => {
    const { body } = await upload(workbook({
      Sheet1: [['Status', 'Course', 'Earned', 'Credits'], ['Complete', 'COS10009', 12.5, 12.5]],
    }));
    expect(body.courseList[0]).toMatchObject({ courseId: 'COS10009', status: 'Complete', credits: 12.5, creditsEarned: 12.5 });
  });

  it('reads only the first sheet', async () => {
    const { body } = await upload(workbook({
      First: [HEADER, ['COS10009', 'A', 12.5, 12.5, 'Complete', 'D', '2024']],
      Second: [HEADER, ['COS20007', 'B', 12.5, 12.5, 'Complete', 'C', '2024']],
    }));
    expect(body.courseList.map((c: { courseId: string }) => c.courseId)).toEqual(['COS10009']);
  });

  it('says which columns are missing', async () => {
    const { status, body } = await upload(workbook({ Sheet1: [['Course', 'Credits'], ['COS10009', 12.5]] }));
    expect(status).toBe(400);
    expect(body.error).toContain('"Earned"');
    expect(body.error).toContain('"Status"');
  });

  it('refuses before the privacy notice is acknowledged', async () => {
    mockFindFirst.mockResolvedValue(null);
    const { status, body } = await upload(workbook({ Sheet1: [HEADER] }));
    expect(status).toBe(403);
    expect(body.error).toMatch(/privacy notice/i);
  });

  it('rejects a request with no file', async () => {
    const { status, body } = await upload(null);
    expect(status).toBe(400);
    expect(body.error).toBe('No file provided.');
  });
});
