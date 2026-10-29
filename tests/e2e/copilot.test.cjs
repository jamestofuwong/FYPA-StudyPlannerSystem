const { test } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

async function open(t, status = { ollama: 'available', model: 'ready' }) {
  const browser = await puppeteer.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  const state = { status, requests: [], reply: 'Two synthetic planners are available.', abort: false, pending: null, hold: false, pulls: 0 };
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    if (path === '/api/copilot/chat') {
      state.requests.push(JSON.parse(request.postData()));
      if (state.abort) return request.abort('failed');
      const respond = () => request.respond({ status: 200, contentType: 'application/x-ndjson', body:
        [{ type: 'status', message: 'Thinking…' }, { type: 'token', content: 'Two synthetic ' },
          { type: 'reply', content: state.reply, workflowId: 'list_planners' }].map(e => JSON.stringify(e)).join('\n') + '\n' });
      if (state.hold) { state.pending = respond; return; }
      return respond();
    }
    if (path === '/api/ollama/pull') { state.pulls++; state.status = { ollama: 'available', model: 'ready' }; }
    const body = path === '/api/ollama/status' ? state.status : path === '/api/privacy/status'
      ? { acknowledged: true } : { sessionStatus: 'idle', studentCount: 0 };
    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${baseURL}/copilot`, { waitUntil: 'networkidle0' });
  return { page, state };
}
const click = (page, name) => page.locator(`::-p-aria(${name}[role="button"])`).click();
const has = (page, text) => page.waitForFunction(t => document.body.innerText.includes(t), {}, text);
async function send(page, text) {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
}
async function settled(page) { await page.waitForFunction(() => !document.querySelector('textarea').disabled); }

test('send a question, block duplicate sends while pending and render NDJSON reply', async t => {
  const { page, state } = await open(t);
  assert.equal(await page.$eval('::-p-aria(Send[role="button"])', b => b.disabled), true);
  state.hold = true;
  await send(page, 'What planners are available?');
  await page.waitForFunction(() => document.querySelector('textarea').disabled);
  assert.equal(await page.$eval('::-p-aria(Send[role="button"])', b => b.disabled), true);
  assert.deepEqual(state.requests, [{ messages: [{ role: 'user', content: 'What planners are available?' }] }]);
  await state.pending();
  await has(page, state.reply);
  await settled(page);
  assert.equal(await page.$eval('textarea', e => e.value), '');
});

test('conversation history survives reload, and new/delete chat keeps chats separate', async t => {
  const { page, state } = await open(t);
  await send(page, 'What planners are available?');
  await has(page, state.reply);
  await settled(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await has(page, state.reply);
  await page.locator('button[title="New chat"]').click();
  await page.waitForFunction(text => !document.body.innerText.includes(text), {}, state.reply);
  await send(page, 'Check system status');
  await has(page, state.reply);
  assert.deepEqual(state.requests[1].messages, [{ role: 'user', content: 'Check system status' }]);
  await page.locator('button[title="Delete chat"]').click();
  await page.waitForFunction(() => document.querySelectorAll('button[title="Delete chat"]').length === 1);
});

test('display unsupported, login-required and unavailable replies without portal login', async t => {
  const { page, state } = await open(t);
  for (const [question, reply] of [
    ['hi', "Sorry, I'm not able to help with that."],
    ['major of 900000001', 'This requires access to the student portal. Please log in to the portal first, then try again.'],
    ['Check system status', 'The AI service is currently unavailable. Make sure Ollama is running and the model is ready.'],
  ]) {
    state.reply = reply;
    await send(page, question);
    await has(page, reply);
    await settled(page);
  }
  assert.equal(state.requests.length, 3);
});

test('network failure allows another message and successful recovery', async t => {
  const { page, state } = await open(t);
  state.abort = true;
  await send(page, 'Check system status');
  await has(page, 'Failed to reach the AI service. Check that Ollama is running.');
  await settled(page);
  state.abort = false;
  await send(page, 'What planners are available?');
  await has(page, state.reply);
  await settled(page);
});

test('unavailable Ollama can be checked again', async t => {
  const { page, state } = await open(t, { ollama: 'unavailable', model: 'unavailable' });
  await has(page, 'Ollama is not running');
  assert.equal(await page.$('textarea'), null);
  state.status = { ollama: 'available', model: 'ready' };
  await click(page, 'Check again');
  await page.waitForSelector('textarea');
});

test('missing model can be downloaded before chatting', async t => {
  const { page, state } = await open(t, { ollama: 'available', model: 'unavailable' });
  await has(page, 'AI model not downloaded');
  await click(page, 'Download model');
  await page.waitForSelector('textarea');
  assert.equal(state.pulls, 1);
});
