import { NextRequest } from 'next/server';
import { POST } from '@/app/api/plan-file/read-pdf/route';
import { readPdfKeywords } from '@/app/api/plan-file/read-pdf/pdfjsReader';

// pdfjs-dist's legacy build uses `import.meta`, which jest cannot parse
// (confirmed empirically — "Cannot use 'import.meta' outside a module" when
// the route's own import of it runs under jest). The route's real logic —
// size caps, magic-byte sniffing, error wrapping — is tested here against a
// mocked reader; the REAL pdfjs-dist read is proven by a standalone Node
// script outside the repo (see the Commit 3 report) and by a real Next.js
// build, neither of which jest can stand in for.
jest.mock('@/app/api/plan-file/read-pdf/pdfjsReader', () => ({
  readPdfKeywords: jest.fn(),
}));

const mockedReadPdfKeywords = jest.mocked(readPdfKeywords);

const PDF_HEADER = Buffer.from('%PDF-1.4\n');

function requestWithBody(body: Uint8Array | Buffer): NextRequest {
  return new NextRequest('http://localhost/api/plan-file/read-pdf', { method: 'POST', body });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/plan-file/read-pdf', () => {
  test('a valid PDF returns its keywords', async () => {
    mockedReadPdfKeywords.mockResolvedValue({ keywords: 'SPSPLAN1:abc123' });
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('rest of pdf')])));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, keywords: 'SPSPLAN1:abc123' });
  });

  test('a PDF without keywords returns null', async () => {
    mockedReadPdfKeywords.mockResolvedValue({ keywords: null });
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('rest')])));
    const body = await res.json();
    expect(body).toEqual({ success: true, keywords: null });
  });

  test('the route returns nothing but the keywords string — no other metadata field leaks through', async () => {
    mockedReadPdfKeywords.mockResolvedValue({ keywords: 'SPSPLAN1:xyz' });
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('rest')])));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['keywords', 'success']);
  });

  test('a PDF re-rendered so its metadata is gone leads to the clear "no keywords" case, not an error', async () => {
    // Simulated here by the reader returning null, exactly as a real
    // metadata-stripped PDF would (see Commit 1/2's pdftocairo finding).
    mockedReadPdfKeywords.mockResolvedValue({ keywords: null });
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('rest')])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, keywords: null });
  });

  test('non-PDF bytes are rejected by content sniffing, never reaching the reader', async () => {
    const res = await POST(requestWithBody(Buffer.from('not a pdf at all')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a PDF/i);
    expect(mockedReadPdfKeywords).not.toHaveBeenCalled();
  });

  test('a .xlsx (ZIP signature) is rejected by content sniffing too', async () => {
    const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // 'PK\x03\x04'
    const res = await POST(requestWithBody(zipSignature));
    expect(res.status).toBe(400);
    expect(mockedReadPdfKeywords).not.toHaveBeenCalled();
  });

  test('an empty body is rejected before any parsing', async () => {
    const res = await POST(requestWithBody(Buffer.alloc(0)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/empty/i);
    expect(mockedReadPdfKeywords).not.toHaveBeenCalled();
  });

  test('an oversize body is rejected before any parsing', async () => {
    const huge = Buffer.concat([PDF_HEADER, Buffer.alloc(2 * 1024 * 1024 + 1, 0x41)]);
    const res = await POST(requestWithBody(huge));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too large/i);
    expect(mockedReadPdfKeywords).not.toHaveBeenCalled();
  });

  test('a truncated PDF: the reader throws, the route returns a clear error, not a stack trace', async () => {
    mockedReadPdfKeywords.mockRejectedValue(new Error('Invalid PDF structure.'));
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('x')])));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/encrypted, corrupted or truncated/i);
    expect(body.error).not.toMatch(/Invalid PDF structure/); // the raw pdfjs error text never leaks to the client
  });

  test('a corrupt PDF: same clear error, not a stack trace', async () => {
    mockedReadPdfKeywords.mockRejectedValue(new Error('bad XRef entry'));
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('garbage')])));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/encrypted, corrupted or truncated/i);
  });

  test('an encrypted PDF: same clear error', async () => {
    mockedReadPdfKeywords.mockRejectedValue(new Error('PasswordException: No password given'));
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('enc')])));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/encrypted, corrupted or truncated/i);
  });

  test('an enormous Keywords field from the reader is not specially handled here — decodePayloadFromPdf\'s own caps apply downstream, this route just forwards the string', async () => {
    // This route's own job is only to extract the field; the encoded-length
    // cap belongs to decodePayloadFromPdf (Commit 1), which runs on the
    // import side after this route returns. Confirms the route itself
    // never throws or truncates regardless of string size.
    const hugeKeywords = 'SPSPLAN1:' + 'A'.repeat(500_000);
    mockedReadPdfKeywords.mockResolvedValue({ keywords: hugeKeywords });
    const res = await POST(requestWithBody(Buffer.concat([PDF_HEADER, Buffer.from('x')])));
    expect(res.status).toBe(200);
    expect((await res.json()).keywords).toBe(hugeKeywords);
  });
});
