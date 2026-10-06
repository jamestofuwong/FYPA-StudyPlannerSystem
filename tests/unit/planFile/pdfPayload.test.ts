import {
  PDF_PAYLOAD_PREFIX,
  PDF_PAYLOAD_LIMITS,
  encodePayloadForPdf,
  decodePayloadFromPdf,
} from '@core/shared/planFile/pdfPayload';
import { buildPlanPayload, type BuildPlanPayloadInput, type PlanPayload } from '@core/shared/planFile';

const richInput: BuildPlanPayloadInput = {
  exportDate: new Date('2026-09-15T00:00:00.000Z'),
  planner: { courseCode: 'BA-CS', courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9 },
  completedUnitCodes: ['CORE1', 'CORE2'],
  concededPassUnitCodes: ['CPUNIT'],
  arrangement: [
    { code: 'CORE3', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
    { code: 'CPUNIT', category: 'core', year: 1, semester: 2, position: 0, recommended: false, outsidePlanner: false, retake: true, concededPassRetake: true },
  ],
  outsidePlannerUnitCodes: ['OUT1'],
  minorNames: ['Data Science Minor'],
  doubleMajorMajorName: 'Software Development',
  customWilSlot: '4-2',
  customMpuList: [{ code: 'MPU3193', name: 'Philosophy and Current Issues' }],
  startYear: 4,
  startSemester: 1,
};

describe('encodePayloadForPdf / decodePayloadFromPdf round trip', () => {
  test('a rich payload deep-equals after encode then decode', () => {
    const payload = buildPlanPayload(richInput);
    const encoded = encodePayloadForPdf(payload);
    expect(encoded.startsWith(PDF_PAYLOAD_PREFIX)).toBe(true);

    const result = decodePayloadFromPdf(encoded);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.issues).toEqual([]);
    expect(result.payload).toEqual(payload);
  });

  test('a unit name with non-Latin-1 characters survives the round trip (via TextEncoder/TextDecoder, not bare btoa)', () => {
    const payload = buildPlanPayload({
      ...richInput,
      customMpuList: [{ code: 'MPU1', name: 'Bahasa Kebangsaan — café, naïve, 中文, émigré' }],
    });
    const encoded = encodePayloadForPdf(payload);
    const result = decodePayloadFromPdf(encoded);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload.customMpuList[0].name).toBe('Bahasa Kebangsaan — café, naïve, 中文, émigré');
  });
});

describe('decodePayloadFromPdf: the untrusted-PDF security boundary', () => {
  const expectCleanPrototype = () => {
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  };
  afterEach(expectCleanPrototype);

  test('never throws, for any input shape', () => {
    expect(() => decodePayloadFromPdf(null)).not.toThrow();
    expect(() => decodePayloadFromPdf(undefined)).not.toThrow();
    expect(() => decodePayloadFromPdf('')).not.toThrow();
    expect(() => decodePayloadFromPdf('garbage')).not.toThrow();
    expect(() => decodePayloadFromPdf(PDF_PAYLOAD_PREFIX + '!!!not base64!!!')).not.toThrow();
  });

  test('missing (null/undefined) keywords: a clear error mentioning the PDF may have been printed/converted/edited/exported before this feature', () => {
    for (const input of [null, undefined]) {
      const r = decodePayloadFromPdf(input);
      expect('error' in r).toBe(true);
      if (!('error' in r)) continue;
      expect(r.error).toMatch(/printed, converted, edited, or exported/i);
    }
  });

  test('empty string keywords: the same clear error', () => {
    const r = decodePayloadFromPdf('');
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/printed, converted, edited, or exported/i);
  });

  test('wrong prefix: a clear error, also mentioning the same possibilities', () => {
    const r = decodePayloadFromPdf('NOT_THE_RIGHT_PREFIX:abc123');
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/printed, converted, edited, or exported/i);
  });

  test('oversize ENCODED input is rejected before any decoding happens (base64 decode never runs)', () => {
    // Invalid base64 padding, so that if the length check did NOT run
    // first, atob would throw instead of the length-check error, proving
    // the ORDER, not just that both checks exist.
    const hostile = PDF_PAYLOAD_PREFIX + 'A'.repeat(PDF_PAYLOAD_LIMITS.maxEncodedLength + 1);
    const r = decodePayloadFromPdf(hostile);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/larger than this app would ever produce/i);
  });

  test('oversize DECODED input (valid base64, valid length, but decodes past the byte cap) is rejected before JSON.parse', () => {
    // Sized to land in the gap between the two caps: over maxDecodedLength
    // (45,000 bytes) but its base64 form still under maxEncodedLength
    // (64,000 chars), proving the decoded check is a real, independent
    // guard, not redundant with the encoded one.
    const bigJson = JSON.stringify({ padding: 'X'.repeat(PDF_PAYLOAD_LIMITS.maxDecodedLength + 500) });
    const bytes = new TextEncoder().encode(bigJson);
    expect(bytes.length).toBeGreaterThan(PDF_PAYLOAD_LIMITS.maxDecodedLength);
    // Manually base64-encode without going through the real encode function,
    // so this test doesn't depend on encodePayloadForPdf's own JSON shape.
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base64 = btoa(binary);
    expect(base64.length).toBeLessThanOrEqual(PDF_PAYLOAD_LIMITS.maxEncodedLength); // sanity: not caught by the earlier encoded-length check
    const r = decodePayloadFromPdf(PDF_PAYLOAD_PREFIX + base64);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/larger than this app would ever produce/i);
  });

  test('bad base64 is rejected, not thrown', () => {
    const r = decodePayloadFromPdf(PDF_PAYLOAD_PREFIX + '!!!not valid base64 at all!!!');
    expect('error' in r).toBe(true);
  });

  test('valid base64 but invalid JSON is rejected, not thrown', () => {
    const encoded = btoa('{not valid json');
    const r = decodePayloadFromPdf(PDF_PAYLOAD_PREFIX + encoded);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/not valid/i);
  });

  test.each([
    ['array', '[1,2,3]'],
    ['number', '42'],
    ['string', '"hello"'],
    ['null', 'null'],
  ])('valid JSON that is not a plain object (%s) is rejected, not thrown', (_label, json) => {
    const encoded = btoa(json);
    const r = decodePayloadFromPdf(PDF_PAYLOAD_PREFIX + encoded);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/not in the expected shape/i);
  });

  test('"__proto__", "constructor" and "prototype" keys inside the JSON leave Object.prototype untouched', () => {
    const payload = buildPlanPayload(richInput);
    const hostileJson = JSON.stringify({
      ...payload,
      __proto__: { polluted: true },
      constructor: { polluted: true },
      prototype: { polluted: true },
    });
    const bytes = new TextEncoder().encode(hostileJson);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const encoded = PDF_PAYLOAD_PREFIX + btoa(binary);

    const r = decodePayloadFromPdf(encoded);
    expect('error' in r).toBe(false);
    // expectCleanPrototype runs in afterEach regardless, but assert explicitly too.
    expect(({} as any).polluted).toBeUndefined();
  });

  test('one bad unit among good ones restores the good and reports the bad', () => {
    const payload = buildPlanPayload(richInput);
    const raw = JSON.parse(JSON.stringify(payload));
    raw.arrangement = [
      { code: 'GOOD1', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      { notEvenAUnitShape: true },
    ];
    const bytes = new TextEncoder().encode(JSON.stringify(raw));
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const encoded = PDF_PAYLOAD_PREFIX + btoa(binary);

    const r = decodePayloadFromPdf(encoded);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement.map((u) => u.code)).toEqual(['GOOD1']);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});
