import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readPdfKeywords } from './pdfjsReader';

// Node runtime, not edge: pdfjs-dist's legacy Node build needs real fs/worker
// access this route's dynamic import relies on.
export const runtime = 'nodejs';

// Our own exports are a few KB; this is a generous cap against a hostile or
// mistaken oversized upload, matching the same "cap before any parsing"
// discipline as the Excel restore path.
const MAX_PDF_BYTES = 2 * 1024 * 1024;

/**
 * Reads only the Keywords document property from an uploaded PDF, via
 * pdfjs-dist's getMetadata() (isolated in ./pdfjsReader), never renders a
 * page, never returns anything else from the document. The parser is an
 * attack surface just like the spreadsheet reader: content is sniffed by
 * magic bytes, never trusted by extension or Content-Type, and size is
 * capped before any parsing work.
 */
export async function POST(req: NextRequest) {
  let buffer: Buffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ success: false, error: 'The uploaded file is empty.' }, { status: 400 });
    }
    if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
      return NextResponse.json({ success: false, error: 'The uploaded file is too large.' }, { status: 400 });
    }
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json({ success: false, error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  // Sniffed by magic bytes, never by file extension or Content-Type.
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return NextResponse.json({ success: false, error: 'This file is not a PDF.' }, { status: 400 });
  }

  try {
    const { keywords } = await readPdfKeywords(buffer);
    return NextResponse.json({ success: true, keywords });
  } catch (err) {
    console.error('[plan-file/read-pdf]', err);
    return NextResponse.json(
      { success: false, error: 'This PDF could not be read. It may be encrypted, corrupted or truncated.' },
      { status: 400 }
    );
  }
}
