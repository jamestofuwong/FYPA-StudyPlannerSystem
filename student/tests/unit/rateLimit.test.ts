import { checkRateLimit, resetRateLimit } from '@/lib/cms/rateLimit';

let n = 0;
const key = () => `test-key-${++n}`;

describe('login rate limit', () => {
  afterEach(() => jest.useRealTimers());

  test('five attempts are allowed and the sixth is limited, with a wait time', () => {
    const k = key();
    for (let i = 0; i < 5; i++) expect(checkRateLimit(k).limited).toBe(false);
    const sixth = checkRateLimit(k);
    expect(sixth.limited).toBe(true);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  test('a limit on one key does not limit another', () => {
    const a = key(), b = key();
    for (let i = 0; i < 6; i++) checkRateLimit(a);
    expect(checkRateLimit(a).limited).toBe(true);
    expect(checkRateLimit(b).limited).toBe(false);
  });

  test('the limit ends after 15 minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const k = key();
    for (let i = 0; i < 6; i++) checkRateLimit(k);
    expect(checkRateLimit(k).limited).toBe(true);
    jest.setSystemTime(new Date('2026-10-01T00:14:59Z'));
    expect(checkRateLimit(k).limited).toBe(true);
    jest.setSystemTime(new Date('2026-10-01T00:15:01Z'));
    expect(checkRateLimit(k).limited).toBe(false);
  });

  test('the wait time counts down', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const k = key();
    for (let i = 0; i < 6; i++) checkRateLimit(k);
    const first = checkRateLimit(k).retryAfterSeconds;
    jest.setSystemTime(new Date('2026-10-01T00:05:00Z'));
    expect(checkRateLimit(k).retryAfterSeconds).toBeLessThan(first - 290);
  });

  test('resetting a key (after a good login) allows five new attempts', () => {
    const k = key();
    for (let i = 0; i < 6; i++) checkRateLimit(k);
    expect(checkRateLimit(k).limited).toBe(true);
    resetRateLimit(k);
    for (let i = 0; i < 5; i++) expect(checkRateLimit(k).limited).toBe(false);
  });
});
