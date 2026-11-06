// Every cached read of the public site must expire by itself. Without a time limit, a change made outside the CMS (a seed, a
// restore, a manual edit), or an empty result cached before it, stays on the site until somebody saves in the CMS.

type CacheOptions = { tags?: string[]; revalidate?: number }
const mockCalls: { keyParts: string[]; options: CacheOptions }[] = []

jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keyParts: string[], options: CacheOptions) => {
    mockCalls.push({ keyParts, options })
    return fn
  },
  revalidateTag: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('the cached reads of the public site', () => {
  beforeAll(async () => {
    await import('@/lib/catalog')
  })

  test('there are cached reads to check', () => {
    expect(mockCalls.length).toBeGreaterThanOrEqual(7)
  })

  test('each one expires after a limited time, so a stale or empty result cannot stay for good', () => {
    for (const { keyParts, options } of mockCalls) {
      expect(typeof options.revalidate).toBe('number')
      expect(options.revalidate).toBeGreaterThan(0)
      expect(options.revalidate).toBeLessThanOrEqual(3600)
      expect(keyParts[0]).toMatch(/^student-.+-v\d+$/)
    }
  })

  test('each one still carries a tag, so a CMS save refreshes it at once', () => {
    for (const { options } of mockCalls) expect(options.tags?.length).toBeGreaterThan(0)
  })
})
