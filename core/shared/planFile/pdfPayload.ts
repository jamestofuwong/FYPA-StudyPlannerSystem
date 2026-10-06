import { validatePayload, type PlanPayload, type PlanPayloadResult } from './index';

// The PDF export carries the same restore payload the Excel export carries,
// base64-encoded into the PDF's Keywords document property (the only custom
// metadata field jsPDF's setProperties honours; any other key is silently
// dropped). A normal reader sees nothing on the page; File > Properties
// shows a long base64 string. This is encoding, not encryption.
//
// No Buffer here: this module is imported by both the browser-side export
// handler and the server-side read route, so it only uses
// TextEncoder/TextDecoder and btoa/atob, available as globals in both.

export const PDF_PAYLOAD_PREFIX = 'SPSPLAN1:';

export const PDF_PAYLOAD_LIMITS = {
  /** Caps the base64 TEXT, checked before decoding: the Keywords field round-trips up to 64,000 characters intact across pdfplumber, pypdf and pdfjs. */
  maxEncodedLength: 64_000,
  /**
   * Caps the DECODED byte length, checked before JSON.parse. Not the exact
   * 3/4 byte-equivalent of maxEncodedLength (48,000): kept at 45,000 so the
   * two caps are independent, with a real gap between them. A realistic
   * plan (~100 units, see PLAN_FILE_LIMITS) serialises to ~16-20 KB, well
   * under this cap.
   */
  maxDecodedLength: 45_000,
};

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the call stack on String.fromCharCode(...bytes)
  // for a large array; our caps keep this well under a size where chunking
  // would matter in practice, but there is no reason not to be safe here.
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * PDF_PAYLOAD_PREFIX plus base64 of the UTF-8 JSON. Goes through bytes
 * (TextEncoder, then base64), never bare btoa on the JSON string directly:
 * btoa only accepts Latin-1 text, and a unit name can contain non-Latin-1
 * characters (accented letters, etc).
 */
export function encodePayloadForPdf(payload: PlanPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return PDF_PAYLOAD_PREFIX + bytesToBase64(bytes);
}

/**
 * The trust boundary for an untrusted PDF's Keywords field. Never throws:
 * every failure returns a human-readable { error }, and a well-formed but
 * partially-invalid payload is handed to validatePayload, which already
 * knows how to skip bad items and report them in `issues` rather than
 * rejecting the whole thing.
 */
export function decodePayloadFromPdf(keywords: string | null | undefined): PlanPayloadResult {
  if (!keywords) {
    return {
      error: 'This PDF has no restore data. It may have been printed, converted, edited, or exported before this feature existed.',
    };
  }
  if (!keywords.startsWith(PDF_PAYLOAD_PREFIX)) {
    return {
      error: 'This PDF\'s restore data is not in a recognised format. It may have been printed, converted, edited, or exported before this feature existed.',
    };
  }

  const encoded = keywords.slice(PDF_PAYLOAD_PREFIX.length);
  // Checked before any decoding work, not after: a hostile or corrupted
  // Keywords field this large should never reach atob/JSON.parse at all.
  if (encoded.length > PDF_PAYLOAD_LIMITS.maxEncodedLength) {
    return { error: 'This PDF\'s restore data is larger than this app would ever produce, so it was not read.' };
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    return { error: 'This PDF\'s restore data is not valid, so it could not be read.' };
  }

  // Checked before JSON.parse, same reasoning as the encoded-length check
  // above: bound the decode cost before doing it, not after.
  if (bytes.length > PDF_PAYLOAD_LIMITS.maxDecodedLength) {
    return { error: 'This PDF\'s restore data is larger than this app would ever produce, so it was not read.' };
  }

  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { error: 'This PDF\'s restore data is not valid, so it could not be read.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: 'This PDF\'s restore data is not valid, so it could not be read.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'This PDF\'s restore data is not in the expected shape, so it could not be read.' };
  }

  return validatePayload(parsed);
}
