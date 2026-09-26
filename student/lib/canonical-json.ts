function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

// Stable string so two equal payloads compare the same even if key order differs.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}
