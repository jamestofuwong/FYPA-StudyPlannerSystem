import { test, expect, type Design } from './fixtures';
import type { Page } from '@playwright/test';

// A pasted transcript, as an advisor would load it without the portal.
const ROWS = [
  'COS10009\tIntroduction to Programming\t12.5\t12.5\tComplete\tD\t2024_MAR_S1',
  'COS10026\tComputing Technology Design and Build\t12.5\t12.5\tComplete\tC\t2024_MAR_S1',
  'COS10004\tComputer Systems\t12.5\t12.5\tComplete\tP\t2024_MAR_S1',
  'COS10022\tData Science Principles\t12.5\t12.5\tComplete\tD\t2024_MAR_S1',
  'COS20007\tObject-oriented Programming\t12.5\t12.5\tComplete\tD\t2024_AUG_S2',
].join('\n');

async function loadStudent(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Import', exact: true }).first().click();
  await page.getByRole('button', { name: /paste table/i }).click();
  await page.locator('textarea').first().fill(ROWS);
  const year = page.locator('input[type=number]').first();
  if (await year.count()) await year.fill('2024');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Ranked Planners').first()).toBeVisible({ timeout: 60_000 });
}

for (const design of ['classic', 'meadow'] as Design[]) {
  test.describe(`${design} design`, () => {
    test.use({ design });

    test('the MPU switch hides the MPU units on Major Detection and the choice is remembered after a reload', async ({ page }) => {
      await loadStudent(page);
      const toggle = page.getByTestId('mpu-toggle');
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByText(/^MPU \d+$/).first()).toBeVisible();

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByText(/^MPU \d+$/)).toHaveCount(0);
      await expect(page.getByTestId('mpu-hidden-note')).toBeVisible();

      // The choice outlives the page: it is kept in the browser
      await page.reload();
      await expect(page.getByTestId('mpu-toggle')).toHaveCount(0);   // no student after a reload
      expect(await page.evaluate(() => localStorage.getItem('showMpuUnits'))).toBe('false');

      // put the default back for the next test
      await page.evaluate(() => localStorage.removeItem('showMpuUnits'));
    });
  });
}
