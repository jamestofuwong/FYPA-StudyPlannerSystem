const { realTest: test, assert, fs, path, XLSX, desktop, student, temp, json, post, has, click, fill, pageFor, responseFor, softwareId } = require('./helpers/real-app.cjs');

test('CMS rejects anonymous/invalid login, saves content, publishes it and logs out', { timeout: 180000 }, async t => {
  const page = await pageFor(t, `${student}/cms/help/faq`);
  await page.waitForFunction(() => location.pathname === '/cms/login');
  await fill(page, '#email', 'e2e@example.invalid');
  await fill(page, '#password', 'wrong-password');
  await click(page, 'Sign in');
  await has(page, 'Invalid credentials');
  await fill(page, '#password', process.env.REAL_CMS_PASSWORD);
  await click(page, 'Sign in');
  await page.waitForFunction(() => location.pathname.startsWith('/cms/') && location.pathname !== '/cms/login');
  await page.goto(`${student}/cms/help/faq`, { waitUntil: 'networkidle0' });
  t.diagnostic('Authenticated CMS editor opened');
  await click(page, '+ Add FAQ Item');
  await fill(page, 'textarea[placeholder="FAQ question..."]', 'E2E synthetic question?');
  await fill(page, 'textarea[placeholder="FAQ answer..."]', 'E2E synthetic answer.');
  await page.locator('button::-p-text(Save Changes)').click();
  await has(page, 'FAQ items saved successfully.');
  await page.reload({ waitUntil: 'networkidle0' });
  await has(page, 'E2E synthetic question?');
  const publicPage = await page.browserContext().newPage();
  await publicPage.goto(`${student}/help`, { waitUntil: 'networkidle0' });
  await click(publicPage, 'E2E synthetic question?');
  await has(publicPage, 'E2E synthetic answer.');
  await click(page, 'Sign out');
  await page.waitForFunction(() => location.pathname === '/cms/login');
  await page.goto(`${student}/cms/help/faq`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => location.pathname === '/cms/login');
  const cookies = await page.cookies();
  assert.ok(!cookies.some(c => c.name === 'cms_access' || c.name === 'cms_refresh'));
});

