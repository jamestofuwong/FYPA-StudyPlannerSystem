import { test, expect } from '@playwright/test';
import { acknowledgePrivacy, openApp } from './helpers';

// Must run before any other spec: the notice is shown only until it is accepted, and the database is shared.
test('a new install asks for the privacy notice, and does not ask again after it is accepted', async ({ page }) => {
  await openApp(page);
  await acknowledgePrivacy(page);
  await page.reload();
  await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/privacy notice|notis privasi/i)).toHaveCount(0);

  const status = await (await page.request.get('/api/privacy/status')).json();
  expect(status.acknowledged).toBe(true);
});
