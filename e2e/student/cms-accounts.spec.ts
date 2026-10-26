import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * CMS accounts and permissions in a real browser, on a production build: the superadmin (seeded by the start script)
 * creates an admin with a different access level per section, and the admin sees and can do only what was granted.
 */
test.describe.configure({ mode: 'serial' });

const SUPER = { email: 'e2e@example.com', password: 'e2e-password-123' };
const stamp = Date.now();
const ADMIN = { name: 'Viewer Vera', email: `vera.${stamp}@example.com`, password: 'vera-password-1' };

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/cms/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/cms\/dashboard$/);
}

async function asNewUser(browser: Browser, email: string, password: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, email, password);
  return { ctx, page };
}

test('a superadmin creates an admin with view-only units, edit on FAQ and no access to the rest', async ({ page }) => {
  await signIn(page, SUPER.email, SUPER.password);
  await expect(page.getByRole('link', { name: 'Accounts' })).toBeVisible();
  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByRole('link', { name: '+ New account' }).click();

  await page.getByLabel('Name').fill(ADMIN.name);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  const row = (label: string) => page.getByRole('row', { name: new RegExp(`^${label}`) });
  await row('Units').getByLabel('View only').check();
  await row('FAQ').getByLabel('View and edit').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/cms\/users$/);
  await expect(page.getByRole('row', { name: new RegExp(ADMIN.email) })).toContainText('Units: View only');
  await expect(page.getByRole('row', { name: new RegExp(ADMIN.email) })).toContainText('FAQ: View and edit');
});

test('the admin sees only the sections that were granted, and only view rights on units', async ({ browser }) => {
  const { ctx, page } = await asNewUser(browser, ADMIN.email, ADMIN.password);
  try {
    const nav = page.getByRole('navigation', { name: 'CMS navigation' });
    await expect(nav.getByRole('link', { name: 'Units' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'FAQ' })).toBeVisible();
    for (const hidden of ['Planners', 'Contacts', 'Heads of Department', 'Accounts']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    await page.goto('/cms/units', { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: '+ New Unit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    // typing the address of a page without access, or an edit page with view-only access, leads to "No access"
    await page.goto('/cms/units/new');
    await expect(page).toHaveURL(/\/cms\/no-access\?module=units/);
    await page.goto('/cms/planners');
    await expect(page).toHaveURL(/\/cms\/no-access\?module=planners/);
    await page.goto('/cms/users');
    await expect(page).toHaveURL(/\/cms\/no-access\?module=users/);
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();

    // a unit page opens read-only: the notice shows and the save button is disabled
    await page.goto('/cms/units', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'View' }).first().click();
    await expect(page.getByRole('status')).toContainText('view-only');
    await expect(page.getByRole('button', { name: /save/i }).first()).toBeDisabled();

    // FAQ was granted "view and edit": the save button is not locked by a read-only fieldset
    await page.goto('/cms/help/faq', { waitUntil: 'networkidle' });
    await expect(page.getByText('view-only access')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Add FAQ Item' })).toBeEnabled();
  } finally {
    await ctx.close();
  }
});

test('the admin changes their own name, email and password, and signs in with the new ones', async ({ browser }) => {
  const { ctx, page } = await asNewUser(browser, ADMIN.email, ADMIN.password);
  const newEmail = `vera.new.${stamp}@example.com`;
  const newPassword = 'vera-new-password-2';
  try {
    await page.getByRole('link', { name: 'My account' }).click();
    await expect(page).toHaveURL(/\/cms\/account$/);

    const profile = page.locator('form', { hasText: 'Name and email' });
    await profile.getByLabel('Name').fill('Vera Renamed');
    await profile.getByLabel('Email').fill(newEmail);
    await profile.getByLabel('Current password').fill('wrong-password-1');
    await profile.getByRole('button', { name: 'Save details' }).click();
    await expect(profile.getByRole('alert')).toContainText('current password is not correct');

    await profile.getByLabel('Current password').fill(ADMIN.password);
    await profile.getByRole('button', { name: 'Save details' }).click();
    await expect(profile.getByRole('status')).toContainText('saved');
    await expect(page.locator('aside')).toContainText('Vera Renamed');
    await expect(page.locator('aside')).toContainText(newEmail);

    const pw = page.locator('form', { hasText: 'Change password' });
    await pw.getByLabel('Current password').fill(ADMIN.password);
    await pw.getByLabel('New password', { exact: true }).fill(newPassword);
    await pw.getByLabel('Confirm new password').fill(newPassword);
    await pw.getByRole('button', { name: 'Change password' }).click();
    await expect(pw.getByRole('status')).toContainText('password is changed');
  } finally {
    await ctx.close();
  }

  // the old details no longer work, the new ones do
  const fresh = await browser.newContext();
  const p = await fresh.newPage();
  await p.goto('/cms/login', { waitUntil: 'networkidle' });
  await p.getByLabel(/email/i).fill(newEmail);
  await p.getByLabel(/password/i).fill(ADMIN.password);
  await p.getByRole('button', { name: /sign in/i }).click();
  await expect(p.getByText(/invalid credentials/i)).toBeVisible();
  await signIn(p, newEmail, newPassword);
  await fresh.close();
});

test('the superadmin deactivates the admin, who can no longer sign in', async ({ page, browser }) => {
  await signIn(page, SUPER.email, SUPER.password);
  await page.goto('/cms/users', { waitUntil: 'networkidle' });
  await page.getByRole('row', { name: new RegExp(`vera.new.${stamp}`) }).getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel(/Account is active/).uncheck();
  await page.getByRole('button', { name: 'Save account' }).click();
  await expect(page.getByRole('status')).toContainText('saved');

  const fresh = await browser.newContext();
  const p = await fresh.newPage();
  await p.goto('/cms/login', { waitUntil: 'networkidle' });
  await p.getByLabel(/email/i).fill(`vera.new.${stamp}@example.com`);
  await p.getByLabel(/password/i).fill('vera-new-password-2');
  await p.getByRole('button', { name: /sign in/i }).click();
  await expect(p.getByText(/invalid credentials/i)).toBeVisible();
  await fresh.close();
});

test('the only superadmin cannot lock themselves out', async ({ page }) => {
  await signIn(page, SUPER.email, SUPER.password);
  await page.goto('/cms/users', { waitUntil: 'networkidle' });
  await page.getByRole('row', { name: /e2e@example.com/ }).getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Role')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});
