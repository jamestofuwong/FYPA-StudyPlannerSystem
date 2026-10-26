import { expect, type Page } from '@playwright/test';

/** Accepts the first-run privacy notice, as a new advisor must before using the app. */
export async function acknowledgePrivacy(page: Page) {
  const dialogTitle = page.getByText(/privacy notice|notis privasi/i).first();
  await dialogTitle.waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[class*="PrivacyNoticeModal_body"]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const ack = page.getByRole('button', { name: /acknowledge/i });
  await expect(ack).toBeEnabled();
  await ack.click();
  await expect(dialogTitle).toBeHidden();
}

export async function openApp(page: Page, path = '/dashboard') {
  await page.goto(path);
  await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 90_000 });
}
