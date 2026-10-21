/**
 * Takes the screenshots used in the user guide (web/public/guide/*.webp) from the running app, and stamps the
 * numbered callouts described in web/app/(pages)/user-guide/shots.ts onto them.
 *
 * Needs:
 *   - the app running somewhere you can open in a browser (default http://localhost:3100)
 *   - a database holding the study planners (the pictures show real planner and unit data)
 *   - the test students from test-students/ (a few of them are loaded to show real results)
 *
 *   npx tsx scripts/guide-screenshots.ts [baseUrl] [testStudentsDir]
 *   GUIDE_DESIGN=classic npx tsx scripts/guide-screenshots.ts     (the Classic set, in web/public/guide/classic/)
 *
 * Pictures are taken in light mode: the Easy set in the Easy design, the Classic set in the Classic design. Re-run it whenever a screen changes, then check
 * the numbers still point at the right things (it reports any callout it cannot find).
 */
import fs from 'fs';
import path from 'path';
import puppeteer, { type Page } from 'puppeteer';
import { SHOTS, CLASSIC_MAIN, shotFor, type Find, type Shot } from '../web/app/(pages)/user-guide/shots';

const BASE = process.argv[2] ?? 'http://localhost:3100';
// test-students/ sits in the repo, or one folder above it
const STUDENTS = [process.argv[3], path.join(__dirname, '..', 'test-students'), path.join(__dirname, '..', '..', 'test-students')]
  .filter((p): p is string => !!p).map((p) => path.resolve(p)).find((p) => fs.existsSync(p)) ?? path.resolve(__dirname, '..', 'test-students');
const CLASSIC = process.env.GUIDE_DESIGN === 'classic';
const OUT = path.resolve(__dirname, '..', 'web', 'public', 'guide', CLASSIC ? 'classic' : '');
const SCALE = 1.5;
const MAIN_X = CLASSIC ? CLASSIC_MAIN : 256;
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const student = (group: string, prefix: string) => {
  const dir = path.join(STUDENTS, group);
  const file = fs.readdirSync(dir).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`no test student ${prefix} in ${dir}`);
  return path.join(dir, file);
};

let missing = 0;

async function open(page: Page, route: string, viewport: Shot['viewport']) {
  await page.setViewport({ ...viewport, deviceScaleFactor: SCALE });
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(1200);
}

async function clickButton(page: Page, text: string, opts: { exact?: boolean; sidebar?: boolean } = {}) {
  const ok = await page.evaluate((t, exact, sidebar, mainX) => {
    const el = [...document.querySelectorAll('button, a, [role=tab]')].filter((b) => !sidebar || b.getBoundingClientRect().left < mainX - 4).find((b) => {
      // an icon or emoji before the words does not count; neither does capital letters
      const x = (b.textContent ?? '').trim().replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
      return exact ? x === t.toLowerCase() : x.includes(t.toLowerCase());
    }) as HTMLElement | undefined;
    el?.click();
    return !!el;
  }, text, !!opts.exact, !!opts.sidebar, MAIN_X);
  if (!ok) throw new Error(`button not found: ${text}`);
}

/** Loads one of the test students through the Import panel, as an advisor would. */
async function importStudent(page: Page, file: string, intake: { year: number; sem: 1 | 2 }) {
  await clickButton(page, 'Import', { exact: true });
  await sleep(600);
  const input = await page.$('input[type=file]');
  if (!input) throw new Error('no file input in the import panel');
  await input.uploadFile(file);
  // intake year / semester
  await page.evaluate((y, s) => {
    const set = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    };
    const year = document.querySelector('input[type=number]') as HTMLInputElement | null;
    if (year) set(year, String(y));
    const sem = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => /Sem 1/.test(o.textContent ?? ''))) as HTMLSelectElement | undefined;
    if (sem) set(sem, String(s));
  }, intake.year, intake.sem);
  await sleep(300);
}

async function load(page: Page) {
  await clickButton(page, 'Load', { exact: true });
  await sleep(7000);
}

/** Finds the thing a callout points at. Returns its box in viewport pixels, or null. */
async function locate(page: Page, find: Find) {
  return page.evaluate((f) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    let els: Element[];
    if ('css' in f) {
      els = [...document.querySelectorAll(f.css)].filter(visible);
    } else {
      const sel = f.tag ?? 'button, a, h1, h2, h3, h4, label, span, p, div, th, li, [role=tab], select, textarea, input';
      const norm = (t: string) => t.trim().replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
      const want = f.text.toLowerCase();
      els = [...document.querySelectorAll(sel)].filter(visible).filter((el) => {
        const t = norm((el as HTMLElement).innerText ?? el.textContent ?? '');
        return f.contains ? t.includes(want) : f.startsWith ? t.startsWith(want) : t === want;
      });
      // keep only the innermost matches
      els = els.filter((el) => !els.some((o) => o !== el && el.contains(o)));
      if (f.xMin !== undefined) els = els.filter((e) => e.getBoundingClientRect().left >= f.xMin!);
      if (f.xMax !== undefined) els = els.filter((e) => e.getBoundingClientRect().left <= f.xMax!);
      if (f.yMax !== undefined) els = els.filter((e) => e.getBoundingClientRect().top <= f.yMax!);
    }
    const el = els[('nth' in f ? f.nth : 0) ?? 0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, find);
}

/** Draws the numbered badges onto the live page, so the screenshot carries them. */
async function stamp(page: Page, shot: Shot, key: string) {
  const badges: { n: number; x: number; y: number }[] = [];
  for (const c of shot.callouts) {
    const box = await locate(page, c.find);
    if (!box) { console.warn(`  ! ${key} callout ${c.n} (${c.label}): not found`); missing++; continue; }
    const D = 26;
    const place = c.place ?? 'tl';
    const cx = place === 'l' ? box.x - D / 2 - 6 : place === 'r' ? box.x + box.w + D / 2 + 6 : place === 'ir' ? box.x + box.w - D
      : place === 'tr' ? box.x + box.w + 2 : place === 'b' || place === 't' ? box.x + box.w / 2 : box.x - 8;
    const cy = place === 'b' ? box.y + box.h + D / 2 + 4 : place === 't' ? box.y - D / 2 - 4
      : place === 'l' || place === 'r' || place === 'ir' ? box.y + box.h / 2 : box.y - 8;
    badges.push({ n: c.n, x: cx - D / 2, y: cy - D / 2 });
  }
  await page.evaluate((list, isClassicShot) => {
    for (const b of list) {
      const d = document.createElement('div');
      d.setAttribute('data-guide-badge', '');
      d.textContent = String(b.n);
      Object.assign(d.style, {
        position: 'fixed', left: `${b.x}px`, top: `${b.y}px`, width: '26px', height: '26px', borderRadius: isClassicShot ? '0' : '50%',
        background: '#c2410c', color: '#fff', font: '700 14px/26px system-ui, sans-serif', textAlign: 'center',
        boxShadow: '0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.35)', zIndex: '2147483647', pointerEvents: 'none',
      });
      document.body.appendChild(d);
    }
  }, badges, CLASSIC);
}

async function clearStamps(page: Page) {
  await page.evaluate(() => document.querySelectorAll('[data-guide-badge]').forEach((e) => e.remove()));
}

async function take(page: Page, key: keyof typeof SHOTS, clipOverride?: { x: number; y: number; width: number; height: number }) {
  const shot = shotFor(key, CLASSIC);
  if (ONLY.length && !ONLY.includes(key)) return;
  await stamp(page, shot, key);
  await sleep(150);
  let clip = clipOverride ?? shot.clip ?? { x: 0, y: 0, ...shot.viewport };
  if (!clipOverride && shot.clipFrom && shot.clipTo) {
    const from = await locate(page, shot.clipFrom);
    const to = await locate(page, shot.clipTo);
    if (!from || !to) { console.warn(`  ! ${key}: could not work out the crop`); missing++; }
    else {
      const y = Math.max(0, from.y - 24);
      clip = { x: MAIN_X, y, width: shot.viewport.width - MAIN_X, height: Math.min(shot.viewport.height - y, to.y + to.h + (shot.clipExtra ?? 0) - y) };
    }
  }
  await page.screenshot({ path: path.join(OUT, shot.file) as `${string}.webp`, type: 'webp', quality: 84, clip });
  await clearStamps(page);
  console.log(`  ${shot.file}  (${shot.callouts.length} callouts)`);
}

async function newPage(browser: Awaited<ReturnType<typeof puppeteer.launch>>, opts: { hue?: number; shade?: string; theme?: 'light' | 'dark' } = {}) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((accentHue, accentShade, colourMode, isClassic) => {
    // tsx wraps named functions with a __name helper that does not exist inside the page
    (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
    localStorage.setItem('designPreference', isClassic ? 'classic' : 'meadow');
    localStorage.setItem('themePreference', colourMode);
    // Meadow's accent colour: left unset (the original green) unless a shot asks for another
    if (accentHue !== null) localStorage.setItem('meadowHue', String(accentHue));
    else localStorage.removeItem('meadowHue');   // the browser keeps storage between pages, so clear any earlier choice
    if (accentShade !== null) localStorage.setItem('meadowShade', accentShade);
    else localStorage.removeItem('meadowShade');
    const css = document.createElement('style');
    css.textContent = 'nextjs-portal{display:none!important} *{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
  }, opts.hue ?? null, opts.shade ?? null, opts.theme ?? 'light', CLASSIC);
  return page;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    // ---- Major Detection: empty, import panel -------------------------------------------------------------
    let page = await newPage(browser);
    await open(page, '/dashboard', shotFor('layout', CLASSIC).viewport);
    await take(page, 'layout');

    await importStudent(page, student('a_follows_the_planner_exactly', 'A03'), { year: 2026, sem: 1 });
    await page.setViewport({ ...shotFor('importPanel', CLASSIC).viewport, deviceScaleFactor: SCALE });
    await take(page, 'importPanel');

    // ---- the same student, through the result tabs and on to the pathway ----------------------------------
    await load(page);
    await page.setViewport({ ...shotFor('results', CLASSIC).viewport, deviceScaleFactor: SCALE });
    await sleep(600);
    await take(page, 'results');

    await page.setViewport({ ...shotFor('graduation', CLASSIC).viewport, deviceScaleFactor: SCALE });
    await clickButton(page, 'Graduation', { exact: true });
    await sleep(1200);
    await take(page, 'graduation');

    await page.setViewport({ ...shotFor('unitPlan', CLASSIC).viewport, deviceScaleFactor: SCALE });
    await clickButton(page, 'Unit Plan', { exact: true });
    await sleep(1200);
    await take(page, 'unitPlan');

    await page.setViewport({ ...shotFor('pathway', CLASSIC).viewport, deviceScaleFactor: SCALE });
    await clickButton(page, 'Student Pathway', { exact: true, sidebar: true });   // the sidebar link; the tab is the same words
    await sleep(6000);
    await clickButton(page, 'Generate Custom Pathway');
    await sleep(6000);
    await take(page, 'pathway');
    await page.close();

    // ---- a student with two Conceded Passes: the "Other requirements" card ------------------------------
    page = await newPage(browser);
    await open(page, '/dashboard', shotFor('graduationOther', CLASSIC).viewport);
    await importStudent(page, student('d_fails_and_exemptions', 'D07'), { year: 2025, sem: 2 });
    await load(page);
    await clickButton(page, 'Graduation', { exact: true });
    await sleep(1200);
    // Crop to the card's heading and its rows, not the stretched card around them
    const card = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('span, div, h3')].find((e) => (e as HTMLElement).innerText?.trim() === 'Other requirements');
      const rows = [...document.querySelectorAll('[data-testid^="grad-other-"]')];
      if (!heading || rows.length === 0) return null;
      const h = heading.getBoundingClientRect();
      const last = rows[rows.length - 1].getBoundingClientRect();
      const first = rows[0].getBoundingClientRect();
      return { x: first.left - 28, y: h.top - 28, width: first.width + 56, height: last.bottom - h.top + 56 };
    });
    if (!card) { console.warn('  ! graduationOther: card not found'); missing++; }
    else await take(page, 'graduationOther', card);
    await page.close();

    // ---- pages that need no student ---------------------------------------------------------------------
    const simple: Array<[keyof typeof SHOTS, string, ((p: Page) => Promise<void>)?]> = [
      ['pathwayEmpty', '/pathway'],
      ['plannerImport', '/import'],
      ['units', '/units'],
      ['copilot', '/copilot'],
      ['classEstimation', '/class-estimation'],
      ['settings', '/settings'],
      ['planners', '/planners', async (p) => {
        const click = (start: string, mustHave?: string) => p.evaluate((t, m) => {
          const norm = (x: string) => x.trim().replace(/\s+/g, ' ');
          const el = [...document.querySelectorAll('div, button, span')]
            .filter((e) => norm((e as HTMLElement).innerText ?? '').startsWith(t) && (!m || norm((e as HTMLElement).innerText).includes(m)))
            .sort((a, b) => (a as HTMLElement).innerText.length - (b as HTMLElement).innerText.length)[0] as HTMLElement | undefined;
          el?.click();
        }, start, mustHave);
        await click('Bachelor of Computer Science'); await sleep(500);
        await click('2025'); await sleep(500);
        await click('Data Science', 'Sep'); await sleep(1500);
      }],
    ];
    // ---- the same page in another accent colour -----------------------------------------------------------
    if (!CLASSIC) {   // accent colours belong to Easy only
      page = await newPage(browser, { hue: 214 });
      await open(page, '/dashboard', shotFor('accentExample', CLASSIC).viewport);
      await take(page, 'accentExample');
      await page.close();

      page = await newPage(browser, { shade: 'black', theme: 'dark' });
      await open(page, '/dashboard', shotFor('shadeExample', CLASSIC).viewport);
      await take(page, 'shadeExample');
      await page.close();
    }

    for (const [key, route, prepare] of simple) {
      page = await newPage(browser);
      await open(page, route, shotFor(key, CLASSIC).viewport);
      if (prepare) await prepare(page);
      await take(page, key);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (missing) { console.error(`\n${missing} callout(s) could not be placed`); process.exitCode = 1; }
  else console.log('\nAll screenshots written to', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
