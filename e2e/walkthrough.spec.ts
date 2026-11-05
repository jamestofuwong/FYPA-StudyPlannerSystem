import { test, expect, type Design } from './fixtures';
import type { Page } from '@playwright/test';
import { TOURS } from '../web/lib/tour/tours';

/**
 * The interactive walkthroughs, in a real browser, in both designs. Each job of the user guide has a button that starts
 * its walkthrough. Every step must find its target on the real page, or say what to do when the target is not there yet.
 * If a page changes and a step no longer finds its target, one of these tests fails.
 */

const ready = async (page: Page, path: string, design: Design) => {
  await page.goto(path);
  await expect(page.getByText('Student Pathway', { exact: true }).first()).toBeAttached({ timeout: 90_000 });
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(design === 'meadow' ? 1 : 0);
};

/** The card and the highlight, once the walkthrough is on the page of the step and has had time to look for its target. */
async function look(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 90_000 });
  await page.waitForTimeout(800);
  return {
    title: (await page.locator('#tour-title').textContent()) ?? '',
    highlighted: (await page.getByTestId('tour-highlight').count()) > 0,
    missing: (await page.getByTestId('tour-missing').count()) > 0,
  };
}

const startFromGuide = async (page: Page, id: string, design: Design) => {
  await ready(page, '/user-guide', design);
  await page.getByTestId(`walkthrough-${id}`).click();
  await expect(page.getByTestId('tour-card')).toBeVisible();
};

/** Opens the user guide from the sidebar, without a reload, so that a loaded student stays loaded. */
const openGuideInApp = async (page: Page, id: string) => {
  await page.getByRole('button', { name: /user guide/i }).first().click();
  await expect(page).toHaveURL(/user-guide$/);
  await page.getByTestId(`walkthrough-${id}`).click();
  await expect(page.getByTestId('tour-card')).toBeVisible();
};

/** A transcript pasted into Import, as an advisor would do without the portal. */
const ROWS = [
  'COS10009\tIntroduction to Programming\t12.5\t12.5\tComplete\tD\t2024_MAR_S1',
  'COS10026\tComputing Technology Design and Build\t12.5\t12.5\tComplete\tC\t2024_MAR_S1',
  'COS10004\tComputer Systems\t12.5\t12.5\tComplete\tP\t2024_MAR_S1',
  'COS10022\tData Science Principles\t12.5\t12.5\tComplete\tD\t2024_MAR_S1',
  'COS20007\tObject-oriented Programming\t12.5\t12.5\tComplete\tD\t2024_AUG_S2',
  'COS20031\tDatabase Design and Implementation\t12.5\t12.5\tComplete\tHD\t2024_AUG_S2',
  'COS20019\tCloud Computing Architecture and Administration\t12.5\t12.5\tComplete\tC\t2024_AUG_S2',
  'COS30019\tIntroduction to Artificial Intelligence\t12.5\t12.5\tComplete\tD\t2025_MAR_S1',
  'COS30018\tIntelligent Systems\t12.5\t12.5\tComplete\tC\t2025_MAR_S1',
].join('\n');

async function fillImport(page: Page) {
  await page.getByRole('button', { name: /paste table/i }).click();
  await page.locator('textarea').first().fill(ROWS);
  const year = page.locator('input[type=number]').first();
  if (await year.count()) await year.fill('2024');
}

async function loadStudent(page: Page) {
  await page.getByRole('button', { name: 'Import', exact: true }).first().click();
  await fillImport(page);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Ranked Planners').first()).toBeVisible({ timeout: 60_000 });
}

/** What every step finds on a new app: no student, the portal not logged in, no AI model. H = highlighted, M = waits. */
const EXPECT_FRESH: Record<string, Record<string, 'H' | 'M'>> = {
  'advise-student': { 'portal-login': 'H', search: 'H', ranked: 'M', graduation: 'M', 'unit-plan': 'M', 'open-pathway': 'H', generate: 'M', download: 'M' },
  'transcript-import': { import: 'H', ways: 'M', intake: 'M', load: 'M', result: 'M' },
  'add-planner': { import: 'H', choose: 'H', check: 'H', save: 'M', find: 'H' },
  'class-estimation': { source: 'H', range: 'H', read: 'H', run: 'H', save: 'H', hod: 'H' },
  'course-data': { filter: 'H', 'edit-planner': 'H', 'unit-search': 'H', 'add-unit': 'H', 'edit-unit': 'H' },
  copilot: { status: 'H', download: 'M', ask: 'M' },
};

for (const design of ['classic', 'meadow'] as Design[]) {
  test.describe(`${design} design`, () => {
    test.use({ design });

    test('every job in the user guide has a button, and it starts the walkthrough of that job on the right page', async ({ page }) => {
      for (const tour of TOURS) {
        await startFromGuide(page, tour.id, design);
        const s = await look(page, tour.steps[0].path);
        expect(s.title, tour.id).toBe(tour.steps[0].title);
        await page.getByTestId('tour-skip').click();
        await expect(page.getByTestId('tour-card')).toHaveCount(0);
      }
    });

    test('on a new app, every step finds its target or says what to do (all six walkthroughs)', async ({ page }) => {
      const wrong: string[] = [];
      for (const tour of TOURS) {
        await startFromGuide(page, tour.id, design);
        for (const step of tour.steps) {
          const s = await look(page, step.path);
          const found = s.highlighted ? 'H' : s.missing ? 'M' : '?';
          const want = EXPECT_FRESH[tour.id]?.[step.id];
          if (found !== want) wrong.push(`${tour.id}/${step.id}: found ${found}, expected ${want}`);
          if (s.missing) expect(await page.getByTestId('tour-missing').textContent(), `${tour.id}/${step.id}`).toMatch(/\w{4,}/);
          await page.getByTestId('tour-next').click();
        }
        await expect(page.getByTestId('tour-card')).toHaveCount(0);
      }
      expect(wrong).toEqual([]);
    });

    test('a walkthrough finishes, and the guide then offers it again', async ({ page }) => {
      const tour = TOURS.find((t) => t.id === 'class-estimation')!;
      await startFromGuide(page, tour.id, design);
      for (const step of tour.steps) {
        await look(page, step.path);
        expect(await page.locator('#tour-title').textContent()).toBe(step.title);
        await page.getByTestId('tour-next').click();
      }
      await expect(page.getByTestId('tour-card')).toHaveCount(0);
      await ready(page, '/user-guide', design);
      await expect(page.getByTestId('walkthrough-class-estimation')).toContainText('Do the walkthrough again');
    });

    test('the app stays usable while a walkthrough runs, and Escape ends it', async ({ page }) => {
      await startFromGuide(page, 'class-estimation', design);
      await look(page, '/class-estimation');
      // the highlight and the dim let every click through: the sidebar still works while the card is on the screen
      await page.getByText('Units', { exact: true }).first().click();
      await expect(page).toHaveURL(/units$/);
      await expect(page.getByTestId('tour-card')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('tour-card')).toHaveCount(0);
    });

    test('the walkthrough goes on at the same step after a reload', async ({ page }) => {
      await startFromGuide(page, 'add-planner', design);
      await look(page, '/planners');
      await page.getByTestId('tour-next').click();
      await look(page, '/import');
      const title = await page.locator('#tour-title').textContent();
      await page.reload();
      await expect(page.getByTestId('tour-card')).toBeVisible({ timeout: 60_000 });
      expect(await page.locator('#tour-title').textContent()).toBe(title);
    });

    test('Back goes to the page of the earlier step', async ({ page }) => {
      await startFromGuide(page, 'add-planner', design);
      await look(page, '/planners');
      await page.getByTestId('tour-next').click();
      await look(page, '/import');
      await page.getByTestId('tour-back').click();
      const s = await look(page, '/planners');
      expect(s.title).toBe('Open Import');
      expect(s.highlighted).toBe(true);
    });

    test('Import a transcript: pressing the highlighted buttons moves the walkthrough on', async ({ page }) => {
      await startFromGuide(page, 'transcript-import', design);
      await look(page, '/dashboard');
      // step 1 highlights Import. Pressing it opens the panel and moves to step 2 by itself.
      await page.getByRole('button', { name: 'Import', exact: true }).first().click();
      await expect(page.locator('#tour-title')).toHaveText('Choose how to load the student');
      expect((await look(page, '/dashboard')).highlighted).toBe(true);
      await page.getByTestId('tour-next').click();
      expect(await page.locator('#tour-title').textContent()).toBe('Set the intake');
      expect((await look(page, '/dashboard')).highlighted).toBe(true);
      await page.getByTestId('tour-next').click();
      expect((await look(page, '/dashboard')).highlighted).toBe(true);        // the Load button
      await fillImport(page);
      await page.getByRole('button', { name: 'Load', exact: true }).click();    // moves to the last step by itself
      await expect(page.locator('#tour-title')).toHaveText('Check the result');
      await expect.poll(async () => (await look(page, '/dashboard')).highlighted, { timeout: 60_000 }).toBe(true);
      await page.getByTestId('tour-next').click();                             // Finish
      await expect(page.getByTestId('tour-card')).toHaveCount(0);
    });

    test('Advise a student: with a student loaded, every step of the walkthrough finds its target', async ({ page }) => {
      await ready(page, '/dashboard', design);
      await loadStudent(page);
      await openGuideInApp(page, 'advise-student');
      const tour = TOURS.find((t) => t.id === 'advise-student')!;
      for (const step of tour.steps) {
        const s = await look(page, step.path);
        if (step.id === 'download') {
          // the pathway is not made yet: the step waits. Make it, as the step before says, and the step finds its button.
          expect(s.missing).toBe(true);
          await page.getByRole('button', { name: /generate custom pathway|regenerate pathway/i }).first().click();
          await expect.poll(async () => (await look(page, '/pathway')).highlighted, { timeout: 60_000 }).toBe(true);
        } else {
          expect(s.highlighted, `${step.id} should find its target`).toBe(true);
        }
        if (step.id === 'generate') {
          expect(s.highlighted).toBe(true);
        }
        await page.getByTestId('tour-next').click();
      }
      await expect(page.getByTestId('tour-card')).toHaveCount(0);
    });

    test('Add a planner: pressing Import on Study Planners opens the import page and the next step', async ({ page }) => {
      await startFromGuide(page, 'add-planner', design);
      await look(page, '/planners');
      // Easy: a link called Import. Classic: a button called + Import inside a link.
      await page.getByRole('link', { name: /import/i }).or(page.getByRole('button', { name: /import/i })).first().click();
      await expect(page).toHaveURL(/\/import$/);
      await expect(page.locator('#tour-title')).toHaveText('Choose the PDF');
      expect((await look(page, '/import')).highlighted).toBe(true);
    });

    test('Ask the AI copilot: when the AI is ready, every step finds its target', async ({ page }) => {
      await page.route('**/api/ollama/status', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ollama: 'available', model: 'ready', pullProgress: 100, pullError: null }),
      }));
      await startFromGuide(page, 'copilot', design);
      const found: Record<string, boolean> = {};
      for (const step of TOURS.find((t) => t.id === 'copilot')!.steps) {
        found[step.id] = (await look(page, step.path)).highlighted;
        await page.getByTestId('tour-next').click();
      }
      // the model is ready, so there is nothing to download: that step waits and says so
      // (Easy shows the model name when the AI is ready. Classic shows nothing there, so that step waits and says so.)
      expect(found).toEqual({ status: design === 'meadow', download: false, ask: true });
    });

    test('Ask the AI copilot: when the model is not downloaded, the download step highlights the button', async ({ page }) => {
      await page.route('**/api/ollama/status', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ollama: 'available', model: 'unavailable', pullProgress: 0, pullError: null }),
      }));
      await startFromGuide(page, 'copilot', design);
      await look(page, '/copilot');
      await page.getByTestId('tour-next').click();
      expect((await look(page, '/copilot')).highlighted).toBe(true);
      expect(await page.locator('#tour-title').textContent()).toBe('Download the model once');
    });

    test('the card stays inside the window at phone width and at a small laptop size', async ({ page }) => {
      for (const size of [{ width: 390, height: 800 }, { width: 1024, height: 640 }]) {
        await page.setViewportSize(size);
        await startFromGuide(page, 'course-data', design);
        await look(page, '/planners');
        const box = await page.getByTestId('tour-card').boundingBox();
        expect(box, `${size.width}px`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
        await page.getByTestId('tour-skip').click();
      }
    });
  });
}
