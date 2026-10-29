import { test, expect } from '@playwright/test'

test.beforeEach(() => test.skip(process.env.STUDENT_E2E_PHASE !== 'production', 'Run npm run test:e2e:full for a production build'))

for (const route of ['/', '/units', '/plan-builder', '/help']) {
  test(`production ${route} has a fresh CSP nonce and working browser scripts`, async ({ page, request }) => {
    const violations: string[] = []
    page.on('console', message => { if (/violat.*script-src|Refused to execute.*script|Content Security Policy.*script/i.test(message.text())) violations.push(message.text()) })
    const first = await request.get(route)
    const second = await request.get(route)
    expect(first.status()).toBe(200)
    const policy = first.headers()['content-security-policy']
    expect(policy).toContain("object-src 'none'")
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()
    expect(second.headers()['content-security-policy'].match(/'nonce-([^']+)'/)?.[1]).not.toBe(nonce)
    await page.goto(route)
    if (route === '/') {
      await page.getByRole('searchbox', { name: 'Search planners' }).fill('no-such-planner')
      await expect(page.getByText('No planners found', { exact: true })).toBeVisible()
    } else if (route === '/units') {
      await page.getByRole('searchbox', { name: 'Search units', exact: true }).fill('no-such-unit')
      await expect(page.getByText('No units found', { exact: true })).toBeVisible()
    } else if (route === '/plan-builder') {
      await page.getByLabel('Course', { exact: true }).selectOption({ label: 'Bachelor of Computer Science' })
      await expect(page.getByLabel('Major', { exact: true })).toBeEnabled()
    } else {
      const button = page.getByRole('region', { name: 'Frequently asked questions' }).getByRole('button').first()
      await button.click()
      await expect(button).toHaveAttribute('aria-expanded', 'true')
    }
    expect(violations).toEqual([])
    const scriptNonces = await page.locator('script:not([src])').evaluateAll(scripts => scripts.map(s => (s as HTMLScriptElement).nonce))
    expect(scriptNonces.length).toBeGreaterThan(0)
    expect(scriptNonces.every(Boolean)).toBe(true)
  })
}
