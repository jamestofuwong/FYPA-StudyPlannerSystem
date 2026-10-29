const { test } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

// Browser workflow tests against the real Next.js page. API boundaries are intercepted:
// no university portal, database writes, or real student records are involved.
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

function preview() {
  const units = Array.from({ length: 40 }, (_, i) => ({
    code: `COS${String(10000 + i)}`, fromNamedPicks: 40 - i,
    fromElectives: i === 0 ? 7.1 : 0, fromNewIntake: 0,
    projected: 40 - i, headcount: 40 - i,
  }));
  return {
    target: { year: 2027, semester: 1, label: 'Semester 1, 2027', reason: 'Next teaching semester', overridden: false },
    students: [{ studentId: '900000001', name: 'Synthetic Student', basis: 'commonCore', planner: null,
      completedCount: 4, picked: [{ code: 'COS10000' }], electives: [], ineligible: [],
      mappingWarnings: [], droppedByLoadCap: 0 }],
    summary: { students: 500, withPlanner: 423, commonCoreOnly: 77, noMajorOrPlanner: 0, errors: 0,
      retentionRate: 0.85, newIntakeCount: 0, projectedByUnit: units,
      totals: { headcount: 820, units: 40, unitsWithNoStudents: 0 },
      electiveSeatsByUnit: [{ code: 'COS10000', category: 'prescribed', expectedSeats: 7.1, popularity: 12 }],
      electiveSeatsUnplaced: 0, newIntake: { units: [], warnings: ['Synthetic intake fallback warning'] },
      totalCandidates: 2000, totalEligible: 1500, totalPicked: 1000,
      ineligibleByReason: { 'not-offered-in-term': 300, 'requisites-unmet': 200, 'not-in-planner': 0 },
      eligibleWithoutOfferingData: 0, outsideRecommendedTerm: 0, mappingWarningCounts: {}, plannerCounts: [] },
  };
}

async function open(t) {
  const browser = await puppeteer.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1560, height: 1000 });
  page.setDefaultTimeout(15000);
  const state = { loaded: false, runs: [], requests: [], previewError: false, saveError: false, loadError: false, deleteError: false };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No uncaught browser errors'));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return request.continue();
    state.requests.push({ path: url.pathname, query: url.search, method: request.method(), body: request.postData() });
    let body = {};
    let status = 200;
    const path = url.pathname;
    if (path === '/api/privacy/status') body = { acknowledged: true };
    else if (path === '/api/scraper/status') body = { sessionStatus: 'idle', studentCount: 0 };
    else if (path === '/api/config') body = { value: null };
    else if (path === '/api/class-estimation/import') body = { storedStudents: state.loaded ? 500 : 0, bySource: { mock: state.loaded ? 500 : 0 } };
    else if (path === '/api/class-estimation/run' && request.method() === 'OPTIONS') body = { sources: [{ id: 'mock' }], default: 'mock' };
    else if (path === '/api/class-estimation/run') {
      if (state.loadError) {
        // Simulate a transcript stream disconnecting after it starts.
        return request.respond({ status: 200, contentType: 'text/event-stream', body:
          `data: ${JSON.stringify({ type: 'start', total: 500 })}\n\n` });
      }
      state.loaded = true;
      return request.respond({ status: 200, contentType: 'text/event-stream', body:
        `data: ${JSON.stringify({ type: 'complete', completed: 500, failed: 0, skipped: 0, total: 500 })}\n\n` });
    } else if (path === '/api/class-estimation/preview') {
      body = state.previewError ? { error: 'Synthetic preview failure' } : preview();
      status = state.previewError ? 500 : 200;
    } else if (path === '/api/class-estimation/runs' && request.method() === 'POST') {
      if (state.saveError) { status = 500; body = { error: 'Synthetic save failure' }; }
      else {
        state.runs = [{ id: 'synthetic-run', createdAt: '2026-10-29T07:42:43Z',
          label: JSON.parse(request.postData()).label, targetYear: 2027, targetSemester: 1,
          retentionRate: 0.85, newIntake: 0, source: 'mock', studentCount: 500,
          groupCount: 20, commonCoreCount: 77, unitCount: 40, totalHeadcount: 820 }];
        body = { units: 40 };
      }
    } else if (path === '/api/class-estimation/runs') body = { runs: state.runs };
    else if (path.endsWith('/synthetic-run') && request.method() === 'DELETE') {
      if (state.deleteError) { status = 500; body = { error: 'Synthetic deletion failure' }; }
      else state.runs = [];
    }
    else if (path.endsWith('/synthetic-run')) body = { ...state.runs[0], units: preview().summary.projectedByUnit.map(u => ({ ...u, unitCode: u.code })) };
    return request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${baseURL}/class-estimation`, { waitUntil: 'networkidle0' });
  return { page, state };
}

async function click(page, text, role = 'button') {
  try { await page.locator(`::-p-aria(${text}[role="${role}"])`).click(); }
  catch (error) { throw new Error(`Could not click ${role}: ${text}`, { cause: error }); }
}
async function has(page, text) {
  try { await page.waitForFunction(value => document.body.innerText.includes(value), {}, text); }
  catch (error) { throw new Error(`Missing text: ${text}`, { cause: error }); }
}
async function fill(page, selector, value) {
  await page.locator(selector).click();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (value) await page.keyboard.type(value);
}
async function load(page) {
  await click(page, 'Read transcripts');
  await has(page, '500 students loaded');
}
async function estimate(page) {
  await click(page, 'Run estimate');
  await has(page, 'Students estimated');
}

test('load, estimate, inspect all result tabs, search, paginate and sort units', async t => {
  const { page, state } = await open(t);
  assert.equal(await page.$eval('::-p-aria(Save this estimate[role="button"])', e => e.disabled), true);
  await load(page);
  await estimate(page);
  await has(page, '423 by their major');
  await has(page, 'Synthetic intake fallback warning');
  assert.ok(state.requests.some(r => r.path.endsWith('/preview') && r.query === '?retentionRate=0.85&newIntake=0'));
  await has(page, 'Page 1 of 2');
  await click(page, '›');
  await has(page, 'Page 2 of 2');
  await fill(page, 'input[placeholder="Find a unit"]', 'cos10000');
  await has(page, '7.1');
  assert.equal(await page.$('::-p-text(COS10039)'), null);
  await fill(page, 'input[placeholder="Find a unit"]', 'not-a-unit');
  await has(page, 'Nothing matches');
  await fill(page, 'input[placeholder="Find a unit"]', '');
  await page.locator('button::-p-text(Headcount)').click();
  await page.waitForFunction(() => document.querySelector('input[placeholder="Find a unit"]').parentElement.nextElementSibling.children[1].innerText.includes('COS10039'));
  await page.locator('[role="tab"]::-p-text(Electives)').click();
  await has(page, 'Prescribed');
  await page.locator('[role="tab"]::-p-text(Students)').click();
  await fill(page, 'input[placeholder="Find a student or major"]', '900000001');
  const studentCell = await page.evaluateHandle(() => document.querySelector('input[placeholder="Find a student or major"]').parentElement.nextElementSibling.children[1].querySelector('span'));
  await studentCell.asElement().click();
  await has(page, 'Has passed or is taking:');
  await has(page, 'Predicted next semester:');
  await click(page, 'Checks', 'tab');
  await has(page, 'units still owed');
  await has(page, '300 not running next semester');
});

test('save only a label, inspect history, search and remove a saved estimate', async t => {
  const { page, state } = await open(t);
  await load(page);
  await estimate(page);
  await fill(page, 'input[placeholder="e.g. before the FTES change"]', '  E2E estimate  ');
  await click(page, 'Save this estimate');
  await has(page, 'Saved, 40 unit(s) recorded.');
  const saved = state.requests.find(r => r.path.endsWith('/runs') && r.method === 'POST');
  assert.deepEqual(JSON.parse(saved.body), { label: 'E2E estimate' });
  await fill(page, 'input[placeholder="Find a saved estimate"]', 'E2E estimate');
  const savedCell = await page.evaluateHandle(() => document.querySelector('input[placeholder="Find a saved estimate"]').parentElement.nextElementSibling.children[1].querySelector('span'));
  await savedCell.asElement().click();
  await has(page, 'Download Excel');
  assert.equal(await page.$eval('a::-p-text(Download Excel)', a => a.getAttribute('href')), '/api/class-estimation/runs/synthetic-run/export');
  await click(page, 'Remove');
  await page.waitForFunction(() => !document.querySelector('input[placeholder="Find a saved estimate"]'));
  assert.equal(state.runs.length, 0);
});

test('preview and save errors are visible and can be retried', async t => {
  const { page, state } = await open(t);
  await load(page);
  state.previewError = true;
  await click(page, 'Run estimate');
  await has(page, 'Synthetic preview failure');
  state.previewError = false;
  await estimate(page);
  state.saveError = true;
  await click(page, 'Save this estimate');
  await has(page, 'Synthetic save failure');
  state.saveError = false;
  await click(page, 'Save this estimate');
  await has(page, 'Saved, 40 unit(s) recorded.');
});

test('reject invalid returning percentages and new student counts before requesting a preview', async t => {
  const { page, state } = await open(t);
  await load(page);
  const returning = 'input[type="number"][max="100"]';
  const intake = 'input[type="number"][min="0"]';
  for (const value of ['', '0', '101']) {
    await fill(page, returning, value);
    await click(page, 'Run estimate');
    await has(page, 'Enter the percentage of students expected back, from 1 to 100.');
  }
  await fill(page, returning, '85');
  for (const value of ['-1', '1.5']) {
    await fill(page, intake, value);
    await click(page, 'Run estimate');
    await has(page, 'New students must be a whole number, 0 or more.');
  }
  assert.equal(state.requests.filter(r => r.path.endsWith('/preview')).length, 0);
  await fill(page, intake, '25');
  await estimate(page);
  assert.ok(state.requests.some(r => r.query === '?retentionRate=0.85&newIntake=25'));
});

test('interrupted loading shows an error, keeps estimation disabled and allows retry', async t => {
  const { page, state } = await open(t);
  state.loadError = true;
  await click(page, 'Read transcripts');
  await has(page, 'Connection to server lost. The estimation may have been interrupted.');
  assert.equal(state.loaded, false);
  assert.equal(await page.$eval('::-p-aria(Run estimate[role="button"])', e => e.disabled), true);
  assert.equal(await page.$eval('::-p-aria(Save this estimate[role="button"])', e => e.disabled), true);
  state.loadError = false;
  await load(page);
  await estimate(page);
  assert.equal(state.requests.filter(r => r.path.endsWith('/run') && r.method === 'GET').length, 2);
});

test('failed deletion preserves the saved estimate and allows retry', async t => {
  const { page, state } = await open(t);
  await load(page);
  await estimate(page);
  await fill(page, 'input[placeholder="e.g. before the FTES change"]', 'Keep after failed deletion');
  await click(page, 'Save this estimate');
  await has(page, 'Saved, 40 unit(s) recorded.');
  state.deleteError = true;
  await click(page, 'Remove');
  await has(page, 'Could not delete that run.');
  await has(page, 'Keep after failed deletion');
  assert.equal(state.runs.length, 1);
  assert.notEqual(await page.$('input[placeholder="Find a saved estimate"]'), null);
  state.deleteError = false;
  await click(page, 'Remove');
  await page.waitForFunction(() => !document.querySelector('input[placeholder="Find a saved estimate"]'));
  assert.equal(state.runs.length, 0);
  assert.equal(state.requests.filter(r => r.method === 'DELETE').length, 2);
});

// Real API/database flow; use npm run test:e2e:core-flows.
{
const { realTest: test, assert, fs, path, XLSX, desktop, student, temp, json, post, has, click, fill, pageFor, responseFor, softwareId } = require('./helpers/real-app.cjs');
test('real class estimate → persisted run → HoD report → downloaded workbook contents', { timeout: 180000 }, async t => {
  const page = await pageFor(t, `${desktop}/class-estimation`);
  await page.locator('button::-p-text(Imported DPA)').click();
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(path.join(temp, 'synthetic-cohort.xlsx'));
  const imported = await responseFor(page, '/api/class-estimation/import', () => click(page, 'Load 1 file(s)'));
  assert.equal(imported.storedStudents, 2);
  await has(page, '2 students loaded');
  await fill(page, 'input[type="number"][max="100"]', '85');
  await fill(page, 'input[type="number"][min="0"]', '0');
  const previewResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/class-estimation/preview');
  await click(page, 'Run estimate');
  const preview = await (await previewResponse).json();
  assert.equal(preview.summary.students, 2);
  // Independent oracle: two identical students each owe just this major unit.
  // No elective/new-intake contribution; 2 * .85 = 1.7, rounded once to 2.
  const unit = preview.summary.projectedByUnit.find(u => u.code === 'COS30002');
  assert.ok(unit, JSON.stringify(preview.summary));
  assert.equal(unit.fromNamedPicks, 2);
  assert.equal(unit.fromElectives, 0);
  assert.equal(unit.fromNewIntake, 0);
  assert.equal(unit.projected, 1.7);
  assert.equal(unit.headcount, 2);
  assert.equal(preview.summary.totals.headcount, 2);
  await fill(page, 'input[placeholder="e.g. before the FTES change"]', 'E2E persisted estimate');
  const saved = await responseFor(page, '/api/class-estimation/runs', () => click(page, 'Save this estimate'));
  const detail = await json(`${desktop}/api/class-estimation/runs/${saved.id}`);
  assert.equal(detail.studentCount, 2);
  assert.equal(detail.totalHeadcount, 2);
  assert.equal(detail.retentionRate, .85);
  assert.equal(detail.units.find(u => u.unitCode === 'COS30002').headcount, 2);
  assert.ok(!JSON.stringify(detail).includes('900000001'), 'Saved run contains aggregates only');
  await page.goto(`${desktop}/class-estimation/report`, { waitUntil: 'networkidle0' });
  await has(page, 'E2E persisted estimate');
  await has(page, 'COS30002');
  await page.reload({ waitUntil: 'networkidle0' });
  await has(page, 'E2E persisted estimate');
  const downloadDir = path.join(temp, 'downloads');
  await fs.mkdir(downloadDir, { recursive: true });
  const session = await page.createCDPSession();
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, browserContextId: page.browserContext().id });
  await page.locator('a::-p-text(Download Excel)').click();
  let file;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    file = (await fs.readdir(downloadDir)).find(name => name.endsWith('.xlsx'));
    if (file) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(file, 'The browser downloaded an Excel workbook');
  const workbook = XLSX.read(await fs.readFile(path.join(downloadDir, file)), { type: 'buffer' });
  const rows = workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }));
  assert.deepEqual(rows.find(row => row[0] === 'COS30002'), ['COS30002', 2, '', '', 2]);
  assert.ok(rows.some(row => row[0] === 'Students read' && row[1] === 2));
  assert.ok(!JSON.stringify(rows).includes('900000001'), 'Workbook contains no student identity');
});


}
