/**
 * Contract: every panel id is declared in all the places that must know about it.
 * Adding a panel to PANEL_IDS and forgetting the tab, status bar, icon or page
 * produces a blank label or a 404 at run time. These tests make that a build failure.
 */
import fs from 'fs';
import path from 'path';
import { PANEL_IDS, PANEL_PATHS, NAV_SECTIONS, isPanelId, panelFromPathname, panelToPath } from '../../web/lib/navigation';
import { PANEL_ICONS } from '../../web/lib/panelIcons';

const WEB = path.resolve(__dirname, '../../web');
const read = (p: string) => fs.readFileSync(path.join(WEB, p), 'utf8');

/** Keys of the object literal that follows `marker` in `src`. */
function keysOf(src: string, marker: string): string[] {
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(src.indexOf('{', src.indexOf('=', start)), src.indexOf('\n};', start));
  return [...body.matchAll(/^\s{2,4}(?:'([\w-]+)'|"([\w-]+)"|([A-Za-z][\w]*))\s*:/gm)].map((m) => m[1] ?? m[2] ?? m[3]);
}

describe('panel registry', () => {
  const sorted = (a: string[]) => [...a].sort();

  test('ids are unique', () => {
    expect(new Set(PANEL_IDS).size).toBe(PANEL_IDS.length);
  });

  test('PANEL_PATHS has exactly one path per panel, and each path is "/<id>"', () => {
    expect(sorted(Object.keys(PANEL_PATHS))).toEqual(sorted(PANEL_IDS));
    for (const id of PANEL_IDS) expect(PANEL_PATHS[id]).toBe(`/${id}`);
  });

  test('every panel has an app page', () => {
    for (const id of PANEL_IDS) {
      expect(fs.existsSync(path.join(WEB, 'app/(pages)', id, 'page.tsx'))).toBe(true);
    }
  });

  test('every app page folder is a registered panel', () => {
    const folders = fs
      .readdirSync(path.join(WEB, 'app/(pages)'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(sorted(folders)).toEqual(sorted(PANEL_IDS));
  });

  test('tab bar, status bar and meadow icons cover every panel', () => {
    expect(sorted(keysOf(read('components/layout/TabBar.tsx'), 'const TAB_META'))).toEqual(sorted(PANEL_IDS));
    expect(sorted(keysOf(read('components/layout/StatusBar.tsx'), 'const PANEL_LABELS'))).toEqual(sorted(PANEL_IDS));
    expect(sorted(Object.keys(PANEL_ICONS))).toEqual(sorted(PANEL_IDS));
    for (const id of PANEL_IDS) expect(PANEL_ICONS[id]).toBeTruthy();
  });

  test('the tab label equals the status-bar label for each panel', () => {
    const tabs = read('components/layout/TabBar.tsx');
    const status = read('components/layout/StatusBar.tsx');
    for (const id of PANEL_IDS) {
      const key = `(?:'${id}'|"${id}"|${id})`;
      const tab = new RegExp(`${key}:\\s*\\{[^}]*label:\\s*'([^']+)'`).exec(tabs)?.[1];
      const label = new RegExp(`${key}:\\s*'([^']+)'`).exec(status)?.[1];
      expect(tab).toBeDefined();
      expect(label).toBe(tab);
    }
  });

  test('the sidebar only links to registered panels and never lists a panel twice', () => {
    const ids = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id));
    for (const id of ids) expect(PANEL_IDS).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('helpers round-trip', () => {
    for (const id of PANEL_IDS) {
      expect(isPanelId(id)).toBe(true);
      expect(panelFromPathname(panelToPath(id))).toBe(id);
      expect(panelFromPathname(`${panelToPath(id)}/deep/link`)).toBe(id);
    }
  });

  test('unknown or empty paths fall back to the dashboard', () => {
    expect(isPanelId('nope')).toBe(false);
    expect(panelFromPathname('/')).toBe('dashboard');
    expect(panelFromPathname('')).toBe('dashboard');
    expect(panelFromPathname('/does-not-exist')).toBe('dashboard');
  });
});
