import { DEFAULT_SECOND_MAJOR_THRESHOLD, parseSecondMajorThreshold } from '../../../core/services/matching/secondMajorThreshold';

describe('parseSecondMajorThreshold', () => {
  it('reads a stored fraction as is', () => {
    expect(parseSecondMajorThreshold('0.7')).toBeCloseTo(0.7);
    expect(parseSecondMajorThreshold('0.85')).toBeCloseTo(0.85);
  });
  it('reads a stored percentage (the original seed value) as a fraction', () => {
    expect(parseSecondMajorThreshold('70')).toBeCloseTo(0.7);
    expect(parseSecondMajorThreshold('85.5')).toBeCloseTo(0.855);
  });
  it('treats exactly 1 as a fraction (100%) and 0 as 0%', () => {
    expect(parseSecondMajorThreshold('1')).toBe(1);
    expect(parseSecondMajorThreshold('0')).toBe(0);
  });
  it('caps anything over 100% at 1', () => {
    expect(parseSecondMajorThreshold('250')).toBe(1);
  });
  it('falls back to the default when missing or unreadable', () => {
    expect(parseSecondMajorThreshold(null)).toBe(DEFAULT_SECOND_MAJOR_THRESHOLD);
    expect(parseSecondMajorThreshold(undefined)).toBe(DEFAULT_SECOND_MAJOR_THRESHOLD);
    expect(parseSecondMajorThreshold('abc')).toBe(DEFAULT_SECOND_MAJOR_THRESHOLD);
    expect(parseSecondMajorThreshold('-5')).toBe(DEFAULT_SECOND_MAJOR_THRESHOLD);
  });
});
