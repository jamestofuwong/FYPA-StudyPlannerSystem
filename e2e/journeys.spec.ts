import { test, expect, type Design } from './fixtures';

for (const design of ['classic', 'meadow'] as Design[]) {
  test.describe(`${design} design`, () => {
    test.use({ design });
    const ready = async (page: import('@playwright/test').Page, path: string) => {
      await page.goto(path);
      await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 90_000 });
      // The "Main" navigation landmark exists only in the Easy design, so this proves that the right design is on screen.
      await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(design === 'meadow' ? 1 : 0);
    };

    test('Study Planners lists the seeded planners, and the list can be collapsed and shown again', async ({ page }) => {
      await ready(page, '/planners');
      const toggle = page.getByRole('button', { name: /collapse planner list/i });
      await expect(toggle).toBeVisible();
      await expect(page.getByText(/Bachelor of Computer Science/i).first()).toBeVisible({ timeout: 30_000 });

      await toggle.click();
      await expect(page.getByRole('button', { name: /show planner list/i })).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: /show planner list/i }).click();
      await expect(page.getByRole('button', { name: /collapse planner list/i })).toHaveAttribute('aria-expanded', 'true');
    });

    test('the collapsed state of the planner list is remembered after a reload', async ({ page }) => {
      await ready(page, '/planners');
      await page.getByRole('button', { name: /collapse planner list/i }).click();
      await page.reload();
      await expect(page.getByRole('button', { name: /show planner list/i })).toBeVisible({ timeout: 60_000 });
    });

    test('Units shows the seeded units, and Unit Offerings opens with every semester closed', async ({ page }) => {
      await ready(page, '/units');
      await expect(page.getByText('COS10009').first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /unit offerings/i }).click();
      await expect(page.getByText('Semester 1 Offerings')).toBeVisible();
      await expect(page.getByText('Semester 2 Offerings')).toBeVisible();
      // rows inside the modal's tables are hidden while closed
      const before = await page.getByText('COS10009').count();
      await page.getByText('Semester 1 Offerings').click();
      expect(await page.getByText('COS10009').count()).toBeGreaterThan(before);
    });

    test('the second-major threshold is saved to the database and survives a reload', async ({ page, request }) => {
      await ready(page, '/settings');
      const slider = page.locator('input[type="range"]').first();
      await slider.fill('85');
      await page.getByRole('button', { name: /^save/i }).first().click();
      await expect(page.getByRole('button', { name: /saved/i }).first()).toBeVisible();

      const stored = await (await request.get('/api/config?key=second_major_threshold')).json();
      expect(parseFloat(stored.value)).toBeCloseTo(0.85);

      await page.reload();
      await expect(page.locator('input[type="range"]').first()).toHaveValue('85');

      // put the default back so other tests are not affected
      await request.post('/api/config', { data: { key: 'second_major_threshold', value: '0.7' } });
    });

    test('the user guide shows its sections and screenshots that load', async ({ page }) => {
      await ready(page, '/user-guide');
      await expect(page.getByRole('heading').first()).toBeVisible();
      const images = page.locator('img');
      const n = await images.count();
      expect(n).toBeGreaterThan(5);
      const broken = await images.evaluateAll((els) => (els as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
      expect(broken).toEqual([]);
    });

    test('importing a study planner PDF page is reachable and asks for a PDF', async ({ page }) => {
      await ready(page, '/import');
      await expect(page.locator('input[type="file"]').first()).toHaveAttribute('accept', /pdf/);
    });
  });
}

test('the app switches design from Settings, and keeps the choice after a reload', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 90_000 });
  await page.getByRole('button', { name: /^Easy/ }).first().click();
  await expect(page.getByRole('button', { name: /^Easy/ }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('designPreference'))).toBe('meadow');
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 60_000 });
});
