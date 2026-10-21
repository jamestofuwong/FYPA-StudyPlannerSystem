/** @jest-environment jsdom */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import UserGuide from '@/app/(pages)/user-guide/page';
import { SHOTS } from '@/app/(pages)/user-guide/shots';
import { ThemeProvider } from '@/styles/themeProvider';
import { PANEL_PATHS } from '@/lib/navigation';

// The Meadow guide leans on pictures with numbered callouts and a contents list. These checks keep them honest:
// every contents link has a section, every picture exists on disk, every legend is numbered the way its picture is.

const PUBLIC_GUIDE = path.join(__dirname, '..', '..', 'web', 'public', 'guide');

function renderGuide() {
  localStorage.clear();
  localStorage.setItem('themePreference', 'light');
  localStorage.setItem('designPreference', 'meadow');
  return render(<ThemeProvider><UserGuide /></ThemeProvider>);
}

describe('Meadow user guide', () => {
  test('every contents link points at a section on the page', () => {
    const { container } = renderGuide();
    const links = [...container.querySelectorAll('nav a[href^="#guide-"]')];
    expect(links.length).toBeGreaterThan(8);
    for (const a of links) {
      const id = a.getAttribute('href')!.slice(1);
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  test('every section is listed in the contents', () => {
    const { container } = renderGuide();
    const listed = new Set([...container.querySelectorAll('nav a[href^="#guide-"]')].map((a) => a.getAttribute('href')!.slice(1)));
    for (const section of container.querySelectorAll('section[id^="guide-"]')) expect(listed.has(section.id)).toBe(true);
  });

  test('every picture on the page exists on disk', () => {
    const { container } = renderGuide();
    const images = [...container.querySelectorAll('img')];
    expect(images.length).toBeGreaterThan(10);
    for (const img of images) {
      const src = img.getAttribute('src')!;
      expect(src).toMatch(/^\/guide\/.+\.webp$/);
      expect(fs.existsSync(path.join(PUBLIC_GUIDE, path.basename(src)))).toBe(true);
      expect(img.getAttribute('alt')).toBeTruthy();
    }
  });

  test('each picture appears once and every picture in the spec is used', () => {
    const { container } = renderGuide();
    const used = [...container.querySelectorAll('img')].map((i) => path.basename(i.getAttribute('src')!));
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual(Object.values(SHOTS).map((s) => s.file).sort());
  });

  test('each legend lists its callouts in order, 1 upwards', () => {
    for (const shot of Object.values(SHOTS)) {
      expect(shot.callouts.map((c) => c.n)).toEqual(shot.callouts.map((_, i) => i + 1));
      for (const c of shot.callouts) {
        expect(c.label.trim()).not.toBe('');
        expect(c.text.trim()).not.toBe('');
      }
    }
    const { container } = renderGuide();
    const legends = [...container.querySelectorAll('ol[aria-label^="What the numbers"]')];
    expect(legends.length).toBe(Object.values(SHOTS).filter((s) => s.callouts.length > 0).length);
  });

  test('the "Open ..." links go to real pages', () => {
    const { container } = renderGuide();
    const known = new Set(Object.values(PANEL_PATHS));
    const hrefs = [...container.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')!);
    expect(hrefs.length).toBeGreaterThan(4);
    for (const href of hrefs) expect(known.has(href)).toBe(true);
  });

  test('no longer sends people to the retired Cloud Sync page', () => {
    const { container } = renderGuide();
    expect(container.textContent).not.toMatch(/Cloud Sync/i);
  });

  test('uses the design\'s name, Easy, and never its old one', () => {
    const { container } = renderGuide();
    const text = container.textContent ?? '';
    expect(text).toMatch(/Easy/);
    expect(text).not.toMatch(/Meadow/);
    for (const shot of Object.values(SHOTS)) {
      expect(`${shot.alt} ${shot.caption} ${shot.callouts.map((c) => `${c.label} ${c.text}`).join(' ')}`).not.toMatch(/Meadow/);
    }
  });

  test('covers the features a new user has to find', () => {
    const { container } = renderGuide();
    const text = container.textContent ?? '';
    for (const phrase of [
      'Generate Custom Pathway', 'Other requirements', 'Match against a different planner', 'Upload Excel', 'Paste Table',
      'No Major Detected', 'Conceded Pass', 'Download PDF', 'Import plan', 'Second major threshold', 'Check for updates',
      'Accent colour', 'Colour wheel', 'Grey, black and white',
    ]) {
      expect(text).toContain(phrase);
    }
  });
});

describe('Classic user guide', () => {
  function renderClassic() {
    localStorage.clear();
    localStorage.setItem('themePreference', 'dark');
    localStorage.setItem('designPreference', 'classic');
    return render(<ThemeProvider><UserGuide /></ThemeProvider>);
  }

  test('has the same sections, pictures and wording as the Easy guide', () => {
    const easy = renderGuide();
    const easySections = [...easy.container.querySelectorAll('section[id^="guide-"]')].map((s) => s.id);
    const easyText = easy.container.textContent ?? '';
    easy.unmount();

    const { container } = renderClassic();
    expect([...container.querySelectorAll('section[id^="guide-"]')].map((s) => s.id)).toEqual(easySections);
    expect(container.querySelectorAll('figure img').length).toBe(Object.keys(SHOTS).length);
    expect(container.textContent).toContain('Generate Custom Pathway');
    expect(container.textContent).toContain('Grey, black and white');
    expect(container.textContent).not.toMatch(/Meadow/);
    expect(easyText.length).toBeGreaterThan(5000);
  });

  test('shows its own Classic pictures, and each one exists', () => {
    const { container } = renderClassic();
    const srcs = [...container.querySelectorAll('figure img')].map((i) => i.getAttribute('src')!);
    const classicShots = srcs.filter((src) => src.startsWith('/guide/classic/'));
    expect(classicShots.length).toBe(Object.keys(SHOTS).length - 2);   // all but the two about Easy's accent colours
    for (const src of srcs) expect(fs.existsSync(path.join(PUBLIC_GUIDE, src.replace('/guide/', '')))).toBe(true);
  });

  test('every classic legend is numbered 1..n with no gaps', () => {
    const { container } = renderClassic();
    for (const legend of container.querySelectorAll('ol[aria-label^="What the numbers"]')) {
      const nums = [...legend.querySelectorAll('li')].map((li) => Number(li.getAttribute('value')));
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    }
  });

  test('every contents link points at a section', () => {
    const { container } = renderClassic();
    const links = [...container.querySelectorAll('nav a[href^="#guide-"]')];
    expect(links.length).toBeGreaterThan(8);
    for (const a of links) expect(container.querySelector(`section#${a.getAttribute('href')!.slice(1)}`)).not.toBeNull();
  });
});
