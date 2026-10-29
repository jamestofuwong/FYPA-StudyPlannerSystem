const { realTest: test, assert, fs, path, XLSX, desktop, student, temp, json, post, has, click, fill, pageFor, responseFor, softwareId } = require('./helpers/real-app.cjs');

test('synthetic transcript → real matching → graduation audit → generated pathway', { timeout: 180000 }, async t => {
  const page = await pageFor(t, `${desktop}/dashboard`);
  await page.locator('button::-p-text(Import)').click();
  await fill(page, 'input[type="number"][min="2000"]', '2024');
  assert.equal(await page.$eval('input[type="number"][min="2000"]', e => e.value), '2024');
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(path.join(temp, 'synthetic-dpa.xlsx'));
  const matched = await responseFor(page, '/api/match', () => click(page, 'Load'));
  assert.equal(matched.success, true);
  assert.equal(matched.data.rankedPlanners[0].plannerID, softwareId, JSON.stringify(matched.data));
  await has(page, 'E2E Software');
  await page.locator('[role="tab"]::-p-text(Graduation)').click();
  await has(page, 'Graduation Check');
  await has(page, 'INELIGIBLE');
  await has(page, '1 Remaining');
  await has(page, 'COS30002'); // the only outstanding unit in the synthetic planner
  await page.locator('[role="tab"]::-p-text(Student Pathway)').click();
  await click(page, 'Open Student Pathway');
  await page.waitForFunction(() => location.pathname === '/pathway');
  const generated = await responseFor(page, '/api/custom-planner', () => click(page, 'Generate Custom Pathway'));
  assert.equal(generated.success, true);
  const plannedCodes = generated.data.semesters.flatMap(s => s.units.map(u => u.code));
  assert.deepEqual(plannedCodes, ['COS30002']);
  await has(page, 'COS30002');
});

