const { realTest: test, assert, fs, path, XLSX, desktop, student, temp, json, post, has, click, fill, pageFor, responseFor, softwareId } = require('./helpers/real-app.cjs');

test('PDF planner extraction → save → reopen from the database', { timeout: 180000 }, async t => {
  const page = await pageFor(t, `${desktop}/import`);
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(path.join(temp, 'planner.pdf'));
  // Use the actual extractor response rather than substituting parsed planner JSON.
  const parsed = await responseFor(page, '/api/planners', () => click(page, 'Upload'));
  assert.equal(parsed.planner.course_information.major, 'Synthetic Extraction');
  const codes = parsed.planner.categories.core_units.map(u => u.unit_code);
  assert.deepEqual(codes.sort(), ['TST10001', 'TST10002']);
  const saved = await responseFor(page, '/api/planners/save', () => click(page, 'Confirm & Save'));
  assert.ok(saved.plannerId);
  await page.goto(`${desktop}/planners?plannerId=${saved.plannerId}`, { waitUntil: 'networkidle0' });
  await has(page, 'Synthetic Extraction');
  await has(page, 'TST10001');
  await page.reload({ waitUntil: 'networkidle0' });
  await has(page, 'TST10002');
  const detail = await json(`${desktop}/api/planners/${saved.plannerId}`);
  assert.deepEqual(detail.units.map(u => u.unit.unit_code).sort(), ['TST10001', 'TST10002']);
  const duplicate = await fetch(`${desktop}/api/planners/save`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planner: parsed.planner }) });
  assert.equal(duplicate.status, 409);
});

