// ============================================================
// MM-03 – Unit Normaliser
// Runs before Phase 2. Uppercase, trim, deduplicate.
// The scoring algorithm performs no normalisation internally.
// ============================================================

/**
 * normaliseCode
 *
 * Normalises a single unit code to its canonical form:
 * uppercase + trimmed whitespace.
 */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * normaliseUnitCodes
 *
 * Normalises an array of raw unit codes and returns a deduplicated set.
 * Input order does not matter – the set eliminates duplicates.
 */
export function normaliseUnitCodes(rawCodes: string[]): Set<string> {
  const normalised = new Set<string>();
  for (const code of rawCodes) {
    if (typeof code === "string" && code.trim().length > 0) {
      normalised.add(normaliseCode(code));
    }
  }
  return normalised;
}
