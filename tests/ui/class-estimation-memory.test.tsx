/** @jest-environment jsdom */
/* eslint-disable @typescript-eslint/no-require-imports */
// ============================================================
// The estimator page keeps what it was showing when you leave it, so going to the Head of Department view
// and back does not throw the last run away.
//
// Next.js unmounts a page on navigation, so these tests do exactly that: render, change something, unmount,
// render again. The state lives in module memory rather than sessionStorage because the preview holds
// student names and IDs, and REQ-SEC-101 keeps student data in RAM only. One test pins that too.
//
// Each test loads React, Testing Library and the page together from a fresh module registry. That gives
// every test clean memory, and loading all three together keeps them on one copy of React, which hooks need.
// ============================================================

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: unknown; href: string }) =>
    require('react').createElement('a', { href, ...rest }, children),
}));

// Every request the page makes on mount answers with nothing useful, so the only state on screen is what the
// test puts there or what the page remembered.
const fetchMock = jest.fn(async (_url?: unknown) => ({ ok: true, json: async () => ({}) }));

beforeAll(() => {
  (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});

/** A fresh app, as after a reload: new module memory, one shared copy of React. */
function freshApp() {
  jest.resetModules();
  const React = require('react');
  // The /pure entry skips the auto-cleanup hooks the default one registers, which cannot be added inside a
  // test. Cleanup is done by hand in afterEach instead.
  const rtl = require('@testing-library/react/pure');
  const Page = require('@/app/(pages)/class-estimation/page').default;

  const mount = async () => {
    let view: { unmount: () => void } | undefined;
    await rtl.act(async () => { view = rtl.render(React.createElement(Page)); });
    return view!;
  };
  const minIdInput = () => rtl.screen.getByPlaceholderText('e.g. 102780000') as HTMLInputElement;
  const type = (input: HTMLInputElement, value: string) => rtl.fireEvent.change(input, { target: { value } });

  return { mount, minIdInput, type, cleanup: rtl.cleanup as () => void };
}

const configCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/config')).length;

describe('the estimator remembers its last state across navigation', () => {
  let cleanup: () => void = () => {};

  afterEach(() => {
    cleanup();
    fetchMock.mockClear();
  });

  test('a typed value survives leaving the page and coming back', async () => {
    const app = freshApp();
    cleanup = app.cleanup;

    const first = await app.mount();
    app.type(app.minIdInput(), '102780123');
    first.unmount();                                  // navigated to the HoD view

    await app.mount();                                // and back again
    expect(app.minIdInput().value).toBe('102780123');
  });

  test('a first visit starts empty', async () => {
    const app = freshApp();
    cleanup = app.cleanup;

    await app.mount();
    expect(app.minIdInput().value).toBe('');
  });

  // Coming back, the fields hold what was last typed, which can be newer than what was saved, since saving
  // only happens on a run. The saved-config fetch must not run over them.
  test('returning does not reload the saved figures over what was typed', async () => {
    const app = freshApp();
    cleanup = app.cleanup;

    const first = await app.mount();
    expect(configCalls()).toBeGreaterThan(0);        // a first visit does load them
    first.unmount();

    fetchMock.mockClear();
    await app.mount();
    expect(configCalls()).toBe(0);
  });

  // Student data stays in RAM. The preview carries names and IDs, so browser storage is off limits.
  test('nothing is written to browser storage', async () => {
    const app = freshApp();
    cleanup = app.cleanup;
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    const first = await app.mount();
    app.type(app.minIdInput(), '102780123');
    first.unmount();
    await app.mount();

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  test('a reload starts clean', async () => {
    const before = freshApp();
    const first = await before.mount();
    before.type(before.minIdInput(), '102780123');
    first.unmount();
    before.cleanup();

    const after = freshApp();                         // new module memory, as a reload gives
    cleanup = after.cleanup;
    await after.mount();
    expect(after.minIdInput().value).toBe('');
  });
});
