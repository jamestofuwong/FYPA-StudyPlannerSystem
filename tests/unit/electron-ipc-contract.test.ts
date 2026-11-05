/**
 * Contract between the Electron main process, the preload bridge and the renderer.
 * The three files are compiled separately, so a renamed channel type-checks and then
 * fails silently at run time. These tests read the sources and compare the channel names.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const main = fs.readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf8');
const preload = fs.readFileSync(path.join(ROOT, 'electron/preload.ts'), 'utf8');

const all = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]);
const sorted = (a: string[]) => [...new Set(a)].sort();

const invoked = sorted(all(preload, /ipcRenderer\.invoke\(\s*["']([\w-]+)["']/g));
const handled = sorted(all(main, /ipcMain\.handle\(\s*["']([\w-]+)["']/g));
const listened = sorted(all(preload, /ipcRenderer\.(?:on|once)\(\s*["']([\w-]+)["']/g));
const sentDirect = all(main, /webContents\.send\(\s*["']([\w-]+)["']/g);

describe('IPC channels', () => {
  test('every channel the preload invokes has a handler in main', () => {
    expect(invoked.length).toBeGreaterThan(0);
    for (const ch of invoked) expect(handled).toContain(ch);
  });

  test('every channel the preload listens on is sent by main', () => {
    expect(listened.length).toBeGreaterThan(0);
    // "shutdown-progress" and "app-shutting-down" are sent through a helper that takes the channel name.
    const sentViaHelper = all(main, /["']((?:app-shutting-down|shutdown-progress))["']/g);
    for (const ch of listened) {
      expect([...sentDirect, ...sentViaHelper]).toContain(ch);
    }
  });

  test('main registers only handlers that the preload (or the known exception) exposes', () => {
    // get-database-url is registered but nothing exposes it: pinned so removal or exposure is deliberate.
    const orphan = handled.filter((ch) => !invoked.includes(ch));
    expect(orphan).toEqual(['get-database-url']);
  });

  test('handlers are registered only once', () => {
    const raw = all(main, /ipcMain\.handle\(\s*["']([\w-]+)["']/g);
    expect(raw.length).toBe(new Set(raw).size);
  });
});

describe('preload bridge', () => {
  const exposed = sorted(all(preload, /exposeInMainWorld\(\s*["'](\w+)["']/g));

  test('only the documented objects are exposed to the renderer', () => {
    expect(exposed).toEqual(['dbAPI', 'native', 'portalAPI', 'shutdownAPI', 'themeAPI', 'updaterAPI']);
  });

  test('does not expose ipcRenderer or other Electron internals directly', () => {
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*,\s*ipcRenderer\s*\)/);
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*,\s*require\b/);
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*,\s*process\s*\)/);
  });

  test('every renderer use of window.<name>API refers to an exposed object', () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          for (const m of fs.readFileSync(p, 'utf8').matchAll(/window\.(\w+API)\b/g)) used.add(m[1]);
        }
      }
    };
    walk(path.join(ROOT, 'web'));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(exposed).toContain(name);
  });
});

describe('window security flags', () => {
  const prefs = /new BrowserWindow\(\{[\s\S]*?webPreferences:\s*\{([\s\S]*?)\}/.exec(main)?.[1] ?? '';

  test('context isolation and sandbox are on, Node integration is off', () => {
    expect(prefs).toMatch(/contextIsolation:\s*true/);
    expect(prefs).toMatch(/nodeIntegration:\s*false/);
    expect(prefs).toMatch(/sandbox:\s*true/);
  });

  test('web security is never disabled', () => {
    expect(main).not.toMatch(/webSecurity:\s*false/);
    expect(main).not.toMatch(/allowRunningInsecureContent:\s*true/);
  });
});
