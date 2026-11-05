import { test, expect, type Design } from './fixtures';
import type { Page } from '@playwright/test';

const OFFICIAL = /^https:\/\/www\.swinburne\.edu\.au\/course\/unit\/[a-z]\/[a-z]{3}\d{4,5}\/$/;

const ROWS = [
  'COS10009\tIntroduction to Programming\t12.5\t12.5\tComplete\tD\t2024_MAR_S1',
  'COS10026\tComputing Technology Design and Build\t12.5\t12.5\tComplete\tC\t2024_MAR_S1',
  'COS10004\tComputer Systems\t12.5\t12.5\tComplete\tP\t2024_MAR_S1',
].join('\n');

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 90_000 });
}

for (const design of ['classic', 'meadow'] as Design[]) {
  test.describe(`${design} design`, () => {
    test.use({ design });

    test('Study Planners: unit codes link to the official unit page', async ({ page }) => {
      await ready(page, '/planners');
      await expect(page.getByText(/Bachelor of Computer Science/i).first()).toBeVisible({ timeout: 30_000 });
      const link = page.getByTestId('unit-link').first();
      await expect(link).toBeVisible({ timeout: 30_000 });
      await expect(link).toHaveAttribute('href', OFFICIAL);
      await expect(link).toHaveAttribute('target', '_blank');
      // MPU units are shown, but without a link
      const mpu = page.locator('code', { hasText: /^MPU\d{4}$/ }).first();
      if (await mpu.count()) await expect(mpu.locator('xpath=ancestor::a')).toHaveCount(0);
    });

    test('Units: unit codes in the catalogue link to the official unit page', async ({ page }) => {
      await ready(page, '/units');
      const link = page.getByTestId('unit-link').first();
      await expect(link).toBeVisible({ timeout: 30_000 });
      await expect(link).toHaveAttribute('href', OFFICIAL);
    });

    test('Major Detection: the units of a loaded student link to the official unit page', async ({ page }) => {
      await ready(page, '/dashboard');
      await page.getByRole('button', { name: 'Import', exact: true }).first().click();
      await page.getByRole('button', { name: /paste table/i }).click();
      await page.locator('textarea').first().fill(ROWS);
      const year = page.locator('input[type=number]').first();
      if (await year.count()) await year.fill('2024');
      await page.getByRole('button', { name: 'Load', exact: true }).click();
      await expect(page.getByText('Ranked Planners').first()).toBeVisible({ timeout: 60_000 });
      const link = page.getByTestId('unit-link').first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', OFFICIAL);

      // Pressing a unit code opens a new page for the official site, and does not leave the app
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        link.click(),
      ]);
      expect(popup.url()).toMatch(/swinburne\.edu\.au\/course\/unit\//);
      await popup.close();
      await expect(page.getByText('Ranked Planners').first()).toBeVisible();
    });
  });
}
