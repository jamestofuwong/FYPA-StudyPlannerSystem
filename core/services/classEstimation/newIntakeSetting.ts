// ============================================================
// The new first-year students figure, as stored.
//
// One number. Each Head of Department imports their own course's students, the estimate detects that course
// from the batch (courseDetector.ts), and the new students go onto that course's Year 1, Semester 1 units, so
// the figure never needs a course attached to it.
//
// Stored in SystemConfig as a plain whole number. A version of the page that briefly asked per course saved
// JSON instead, {"Bachelor of Computer Science": 60}; that is still read, as the sum of its figures.
// ============================================================

export const NEW_INTAKE_KEY = 'class_estimation_new_intake';

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/**
 * A stored or posted figure, or null when there is nothing usable in it. An unset key comes back as null from
 * the config route, and Number(null) is 0, so the value has to be a real string before it is read at all.
 */
export function parseNewIntakeTotal(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();

  if (/^\d+$/.test(text)) return Number(text);

  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const figures = Object.values(parsed as Record<string, unknown>).filter(isCount);
    return figures.length > 0 ? figures.reduce((sum, n) => sum + n, 0) : null;
  } catch {
    return null;
  }
}
