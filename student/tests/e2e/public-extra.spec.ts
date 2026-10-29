import { test, expect } from '@playwright/test'

test('public navigation and catalogue search remain usable on a narrow screen @mobile', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Site navigation' })
  for (const [name, url] of [['Units', /\/units$/], ['Plan Builder', /\/plan-builder$/], ['Help', /\/help$/], ['Planners', /\/$/]] as const) {
    await nav.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(url)
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
  }
  await page.getByRole('searchbox', { name: 'Search planners' }).fill('not-a-planner')
  await expect(page.getByText('No planners found', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByText(/\d+ planners available/)).toBeVisible()
})

test('unit details, planner details and help work without page-level horizontal overflow @mobile', async ({ page }) => {
  await page.goto('/')
  const planner = await page.getByRole('link', { name: /View .* planner/ }).first().getAttribute('href')
  for (const url of ['/units/COS10009', planner!, '/help']) {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  const question = page.getByRole('region', { name: 'Frequently asked questions' }).getByRole('button').first()
  await question.click()
  await expect(question).toHaveAttribute('aria-expanded', 'true')
})

test('a network failure during generation leaves the form usable and can be retried @mobile', async ({ page }) => {
  await page.goto('/plan-builder')
  await page.getByLabel('Course', { exact: true }).selectOption({ label: 'Bachelor of Computer Science' })
  await page.getByLabel('Major', { exact: true }).selectOption({ label: 'Artificial Intelligence' })
  await page.route('**/api/generate-plan', route => route.abort('failed'))
  await page.getByRole('button', { name: 'Generate Study Plan' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'An error occurred' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate Study Plan' })).toBeEnabled()
  await page.unroute('**/api/generate-plan')
  await page.getByRole('button', { name: 'Generate Study Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Your Study Plan' })).toBeVisible()
})

test('a malformed saved builder draft recovers to a working configuration form', async ({ page }) => {
  await page.goto('/plan-builder')
  await page.evaluate(() => sessionStorage.setItem('plan-builder-draft', '{broken-json'))
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Plan Builder' })).toBeVisible()
  await page.getByLabel('Course', { exact: true }).selectOption({ label: 'Bachelor of Computer Science' })
  await expect(page.getByLabel('Major', { exact: true })).toBeEnabled()
})
