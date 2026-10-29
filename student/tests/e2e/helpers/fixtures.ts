import { test as base, expect, type Page, type Locator } from '@playwright/test'
import { Client } from 'pg'

export const test = base.extend<{ db: Client }>({
  db: async ({}, use) => {
    test.skip(process.env.STUDENT_FULL_E2E !== '1', 'Use npm run test:e2e:full for a disposable database')
    const url = new URL(process.env.DATABASE_URL!)
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/student_full_e2e') throw new Error('Refusing to mutate a non-test database')
    const db = new Client({ connectionString: url.toString() })
    await db.connect()
    try { await use(db) } finally { await db.end() }
  },
})
export { expect }
export async function login(page: Page, next = '/cms/dashboard') {
  await page.goto(`/cms/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email', { exact: true }).fill(process.env.CMS_SEED_EMAIL!)
  await page.getByLabel('Password', { exact: true }).fill(process.env.CMS_SEED_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${next}$`))
  await page.waitForLoadState('networkidle')
}
// CMS forms use visual labels without htmlFor. Keep this workaround in test helpers.
export function field(page: Page, label: string): Locator {
  return page.locator('label').filter({ hasText: label }).locator('..').locator('input,select,textarea').first()
}
export async function saveUnit(page: Page) {
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
}
export async function refreshedEventually(page: Page, assertion: () => Promise<void>) {
  // CMS saves use stale-while-revalidate cache tags; the first public read may be stale.
  await expect(async () => { await page.reload(); await assertion() }).toPass({ timeout: 20_000, intervals: [250, 500, 1000] })
}
