import { test, expect } from './fixtures';
import { openApp } from './helpers';

test('the sidebar opens each main page', async ({ page }) => {
  await openApp(page);
  for (const [label, path] of [
    ['Study Planners', '/planners'],
    ['Units', '/units'],
    ['Student Pathway', '/pathway'],
    ['Class Estimation', '/class-estimation'],
  ] as const) {
    await page.getByText(label, { exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});

test('no page in the registry fails to load', async ({ page }) => {
  for (const path of ['dashboard', 'pathway', 'import', 'scraping', 'planners', 'units', 'settings', 'user-guide', 'class-estimation', 'copilot']) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto(`/${path}`);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 60_000 });
    expect(errors, `${path} threw in the browser`).toEqual([]);
    page.removeAllListeners('pageerror');
  }
});

test('API health check answers', async ({ request }) => {
  expect((await request.get('/api/ping')).status()).toBe(200);
});
