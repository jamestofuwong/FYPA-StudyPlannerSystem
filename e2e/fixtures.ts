import { test as base, expect } from '@playwright/test';

export type Design = 'classic' | 'meadow';

/** Runs every test under both designs. The privacy notice is accepted through the API so tests start on the real page. */
export const test = base.extend<{ design: Design }>({
  design: ['classic', { option: true }],
  page: async ({ page, request, design }, use) => {
    await request.post('/api/privacy/acknowledge', { data: { presented_at: new Date().toISOString() } });
    await page.addInitScript((d) => { try { if (!localStorage.getItem('designPreference')) localStorage.setItem('designPreference', d); } catch { /* ignore */ } }, design);
    await use(page);
  },
});
export { expect };
