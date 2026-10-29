const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx-js-style');

const desktop = process.env.REAL_DESKTOP_URL;
const student = process.env.REAL_STUDENT_URL;
const temp = process.env.REAL_E2E_TEMP;
const softwareId = process.env.REAL_SOFTWARE_ID;
let browser;
if (desktop && student && temp) {
  before(async () => { browser = await puppeteer.launch({ headless: true }); });
  after(async () => { if (browser) await browser.close(); });
}
function realTest(name, options, fn) {
  return test(name, { ...options, skip: desktop && student && temp ? false : 'Use npm run test:e2e:core-flows to provision isolated services' }, fn);
}
async function json(url, init) {
  const response = await fetch(url, init);
  const data = await response.json();
  assert.ok(response.ok, `${new URL(url).pathname}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const post = (url, data) => json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
async function has(page, text) {
  try { await page.waitForFunction(value => document.body.innerText.toLowerCase().includes(value.toLowerCase()), {}, text); }
  catch (error) { throw new Error(`Missing text: ${text}\n${await page.evaluate(() => document.body.innerText.slice(-5000))}`, { cause: error }); }
}
async function click(page, text) {
  await page.bringToFront();
  try { await page.locator(`::-p-aria(${text}[role="button"])`).click(); }
  catch (error) { throw new Error(`Could not click: ${text}\n${await page.evaluate(() => document.body.innerText.slice(-5000))}`, { cause: error }); }
}
async function fill(page, selector, value) {
  await page.bringToFront();
  await page.locator(selector).click();
  await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  if (value) await page.keyboard.type(value);
  else await page.keyboard.press('Backspace');
}
async function pageFor(t, url) {
  const context = await browser.createBrowserContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.setViewport({ width: 1560, height: 1000 });
  page.on('pageerror', error => t.diagnostic(`Browser error: ${error.message}`));
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(90000);
  await page.goto(url, { waitUntil: 'networkidle0' });
  return page;
}
async function responseFor(page, suffix, action) {
  const controller = new AbortController();
  try {
    const [res] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === suffix && r.request().method() === 'POST', { timeout: 120000, signal: controller.signal }),
      action(),
    ]);
    const data = await res.json();
    assert.ok(res.ok(), `${suffix}: ${JSON.stringify(data)}`);
    return data;
  } finally { controller.abort(); }
}
module.exports = { realTest, assert, fs, path, XLSX, desktop, student, temp, softwareId, json, post, has, click, fill, pageFor, responseFor };
