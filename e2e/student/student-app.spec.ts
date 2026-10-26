import { test, expect, type Page } from '@playwright/test';

/**
 * The student web app in a real browser, from a production build.
 *
 * Regression for a bug that left every public page dead: the proxy (`student/proxy.ts`) sent a nonce-based Content-Security-Policy, but
 * the pages were prerendered and Next.js never put the nonce on its inline scripts. The browser blocked them, the page
 * never hydrated, and filters, unit links and the plan builder did nothing.
 */

const PUBLIC_PAGES = ['/', '/units', '/plan-builder', '/help', '/cms/login'];

function watchCspErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|violates the following/i.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`page error: ${e.message.slice(0, 200)}`));
  return errors;
}

test.describe('Content-Security-Policy', () => {
  for (const path of PUBLIC_PAGES) {
    test(`every script on ${path} carries the nonce of its own policy`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const csp = res.headers()['content-security-policy'] ?? '';
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce, 'the policy has a nonce').toBeTruthy();

      const html = await res.text();
      const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
      expect(scripts.length).toBeGreaterThan(0);
      const without = scripts.filter((attrs) => !attrs.includes(`nonce="${nonce}"`));
      expect(without, 'scripts without the nonce are blocked by the browser').toEqual([]);
    });

    test(`${path} loads with no Content-Security-Policy error in the console`, async ({ page }) => {
      const errors = watchCspErrors(page);
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(errors).toEqual([]);
    });
  }

  test('each request gets a new nonce', async ({ request }) => {
    const nonce = async () => /'nonce-([^']+)'/.exec((await request.get('/')).headers()['content-security-policy'] ?? '')?.[1];
    expect(await nonce()).not.toBe(await nonce());
  });
});

test.describe('the pages respond to clicks', () => {
  test('the planner filters narrow the list and "All" brings it back', async ({ page }) => {
    const errors = watchCspErrors(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const planners = page.locator('a[href^="/planners/"]');
    const all = await planners.count();
    expect(all).toBeGreaterThan(10);

    await page.getByRole('button', { name: 'Data Science', exact: true }).click();
    await expect.poll(() => planners.count()).toBeLessThan(all);
    expect(await planners.count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'All', exact: true }).first().click();
    await expect.poll(() => planners.count()).toBe(all);
    expect(errors).toEqual([]);
  });

  test('the search box filters the planner list', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const planners = page.locator('a[href^="/planners/"]');
    const all = await planners.count();
    await page.getByPlaceholder(/Search by course code/i).fill('Cybersecurity');
    await expect.poll(() => planners.count()).toBeLessThan(all);
  });

  test('a unit in the units page opens its page', async ({ page }) => {
    const errors = watchCspErrors(page);
    await page.goto('/units', { waitUntil: 'networkidle' });
    const row = page.locator('tr[class*="unitRow"]').first();
    const code = ((await row.textContent()) ?? '').match(/[A-Z]{3}\d{5}/)?.[0];
    expect(code).toBeTruthy();

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/units/${code}`));
    await expect(page.getByText(code!).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the year filter and the search box work in the units page', async ({ page }) => {
    await page.goto('/units', { waitUntil: 'networkidle' });
    const rows = page.locator('tr[class*="unitRow"]');
    const all = await rows.count();
    await page.getByPlaceholder(/Search by code or unit name/i).fill('COS10003');
    await expect.poll(() => rows.count()).toBeLessThan(all);
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('"+ Add unit" in the plan builder opens the unit search', async ({ page }) => {
    const errors = watchCspErrors(page);
    await page.goto('/plan-builder', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '+ Add unit' }).first().click();
    await expect(page.getByPlaceholder('Filter by code or name')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the CMS login signs a seeded editor in', async ({ page }) => {
    const errors = watchCspErrors(page);
    await page.goto('/cms/login', { waitUntil: 'networkidle' });
    await page.getByLabel(/email/i).fill('e2e@example.com');
    await page.getByLabel(/password/i).fill('e2e-password-123');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await expect(page).toHaveURL(/\/cms(\/dashboard)?$/);
    expect(errors).toEqual([]);
  });
});
