const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

type Entry = { count: number; resetAt: number }

// Module-level store — persists across requests in the same Node.js process.
const store = new Map<string, Entry>()

export function checkRateLimit(key: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { limited: false, retryAfterSeconds: 0 }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { limited: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { limited: false, retryAfterSeconds: 0 }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}
