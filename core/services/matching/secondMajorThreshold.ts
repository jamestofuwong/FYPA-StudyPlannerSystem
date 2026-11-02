// The second-major threshold is stored as text in system_config. The Settings page writes a fraction
// ("0.7") but the original seed wrote a percentage ("70"), so a database could hold either. Reading "70" as a
// fraction clamped it to 1.0, which meant a second major needed a perfect score and was never reported.

export const DEFAULT_SECOND_MAJOR_THRESHOLD = 0.7;

/**
 * Turns the stored value into a fraction between 0 and 1.
 * A value above 1 is read as a percentage (70 means 70%). Missing or unreadable values give the default.
 */
export function parseSecondMajorThreshold(raw: string | null | undefined): number {
  if (raw == null) return DEFAULT_SECOND_MAJOR_THRESHOLD;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_SECOND_MAJOR_THRESHOLD;
  const fraction = value > 1 ? value / 100 : value;
  return Math.min(1, fraction);
}
