/** @jest-environment jsdom */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TOURS } from '@/lib/tour/tours';
import { findElement } from '@/lib/tour/findElement';
import { placeCard } from '@/lib/tour/placeCard';
import { panelFromPathname } from '@/lib/navigation';
import { TourProvider, useTour } from '@/components/tour/TourProvider';
import TourOverlay from '@/components/tour/TourOverlay';

const mockPush = jest.fn();
let mockPath = '/dashboard';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPath,
}));

/** jsdom has no layout, so a test says where an element is. */
function place(el: Element, box = { left: 300, top: 200, width: 120, height: 36 }) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect;
  return el;
}
function button(text: string, attrs: Record<string, string> = {}) {
  const b = document.createElement('button');
  b.textContent = text;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  document.body.appendChild(b);
  return place(b);
}

beforeEach(() => {
  document.body.innerHTML = '';
  mockPush.mockClear();
  mockPath = '/dashboard';
  window.sessionStorage.clear();
  window.localStorage.clear();
});

// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('the walkthrough definitions', () => {
  test('there is one walkthrough for each job of the user guide, with the same id', () => {
    const guide = fs.readFileSync(path.resolve(__dirname, '../../web/app/(pages)/user-guide/page.tsx'), 'utf8');
    const jobTours = [...guide.matchAll(/^\s{4}tour: '([\w-]+)',/gm)].map((m) => m[1]);
    expect(jobTours.length).toBeGreaterThanOrEqual(6);
    expect(jobTours.sort()).toEqual(TOURS.map((t) => t.id).sort());
  });

  test('every walkthrough and every step is complete and its ids are unique', () => {
    expect(new Set(TOURS.map((t) => t.id)).size).toBe(TOURS.length);
    for (const tour of TOURS) {
      expect(tour.steps.length).toBeGreaterThanOrEqual(3);
      expect(new Set(tour.steps.map((s) => s.id)).size).toBe(tour.steps.length);
      for (const s of tour.steps) {
        expect(s.title.trim().length).toBeGreaterThan(0);
        expect(s.text.trim().length).toBeGreaterThan(15);
        expect(s.path).toMatch(/^\//);
        // the path is one of the pages of the app
        expect(panelFromPathname(s.path)).toBeTruthy();
        // a step that moves on by a click needs something to click
        if (s.advanceOnClick) expect(s.target).not.toBeNull();
      }
    }
  });

  test('every step with a highlight says what to do when the highlight is not on the screen yet', () => {
    // The two exceptions are steps whose target is always on the page the step opens.
    const allowedWithout = new Set(['transcript-import/import', 'add-planner/import', 'advise-student/open-pathway']);
    for (const tour of TOURS) {
      for (const s of tour.steps) {
        if (s.target && !allowedWithout.has(`${tour.id}/${s.id}`)) expect(`${tour.id}/${s.id}: ${s.missing ?? ''}`).toMatch(/: .{12,}/);
      }
    }
  });

  test('the text of a step is plain: no step is longer than 60 words', () => {
    for (const tour of TOURS) for (const s of tour.steps) expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(60);
  });
});

describe('findElement', () => {
  test('finds a button by its text, by a part of its text, and by CSS', () => {
    button('Import');
    button('Download PDF (A4)');
    button('x', { 'aria-label': 'Edit COS10003' });
    expect(findElement({ text: 'Import', tag: 'button' })?.textContent).toBe('Import');
    expect(findElement({ text: 'download pdf', contains: true, tag: 'button' })?.textContent).toBe('Download PDF (A4)');
    expect(findElement({ css: 'button[aria-label^="Edit "]' })?.getAttribute('aria-label')).toBe('Edit COS10003');
    expect(findElement({ text: 'Nothing here' })).toBeNull();
    expect(findElement(null)).toBeNull();
  });

  test('uses the first finder of a list that matches', () => {
    button('Regenerate Pathway');
    expect(findElement([{ text: 'Generate Custom Pathway', tag: 'button' }, { text: 'Regenerate Pathway', tag: 'button' }])?.textContent).toBe('Regenerate Pathway');
  });

  test('keeps to the working area with xMin, and ignores a hidden element', () => {
    place(button('Import'), { left: 20, top: 100, width: 80, height: 30 });       // in the sidebar
    expect(findElement({ text: 'Import', tag: 'button', xMin: 240 })).toBeNull();
    place(button('Import'), { left: 400, top: 100, width: 80, height: 30 });      // in the working area
    expect(findElement({ text: 'Import', tag: 'button', xMin: 240 })).not.toBeNull();
    const hidden = button('Secret') as HTMLElement; hidden.style.display = 'none';
    expect(findElement({ text: 'Secret', tag: 'button' })).toBeNull();
  });

  test('never picks the walkthrough card itself', () => {
    const card = document.createElement('div');
    card.setAttribute('data-tour-ui', '');
    const inner = document.createElement('button'); inner.textContent = 'Next';
    card.appendChild(inner); document.body.appendChild(card); place(inner);
    expect(findElement({ text: 'Next', tag: 'button' })).toBeNull();
  });
});

describe('placeCard', () => {
  const view = { width: 1200, height: 800 };
  const card = { width: 340, height: 180 };
  test('goes below the highlight when there is room', () => {
    const p = placeCard({ left: 500, top: 100, width: 100, height: 30 }, card, view);
    expect(p.side).toBe('bottom');
    expect(p.top).toBeGreaterThan(130);
  });
  test('goes above when the highlight is at the bottom of the window', () => {
    expect(placeCard({ left: 500, top: 740, width: 100, height: 30 }, card, view).side).toBe('top');
  });
  test('stays inside the window at the edges', () => {
    const p = placeCard({ left: 1150, top: 100, width: 40, height: 30 }, card, view);
    expect(p.left + card.width).toBeLessThanOrEqual(view.width);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });
  test('a very large highlight puts the card in a corner, inside the window', () => {
    const p = placeCard({ left: 0, top: 0, width: 1200, height: 800 }, card, view);
    expect(p.side).toBe('center');
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top + card.height).toBeLessThanOrEqual(view.height);
  });
  test('without a highlight the card is in the bottom right corner', () => {
    const p = placeCard(null, card, view);
    expect(p.left + card.width).toBeGreaterThan(view.width - 40);
    expect(p.top + card.height).toBeGreaterThan(view.height - 40);
  });
  test('honours a wished side when it fits', () => {
    expect(placeCard({ left: 500, top: 300, width: 100, height: 30 }, card, view, 'right').side).toBe('right');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────

function Harness({ id = 'transcript-import' }: { id?: string }) {
  const { start, done, tour } = useTour();
  return (
    <>
      <button onClick={() => start(id)}>begin</button>
      <span data-testid="done">{done.join(',')}</span>
      <span data-testid="active">{tour?.id ?? 'none'}</span>
      <TourOverlay />
    </>
  );
}
const mount = (id?: string) => render(<TourProvider><Harness id={id} /></TourProvider>);
const begin = () => fireEvent.click(screen.getByText('begin'));

describe('the walkthrough card', () => {
  test('starts at step 1, highlights the target, and shows the title, the text and the step count', () => {
    button('Import', { id: 'imp' });
    place(document.getElementById('imp')!, { left: 400, top: 100, width: 80, height: 30 });
    mount(); begin();
    expect(screen.getByRole('dialog').textContent).toContain('Open Import');
    expect(screen.getByText(/Step 1 of 5/)).toBeTruthy();
    expect(screen.getByTestId('tour-highlight')).toBeTruthy();
    expect(screen.queryByTestId('tour-missing')).toBeNull();
    expect((screen.getByTestId('tour-back') as HTMLButtonElement).disabled).toBe(true);
  });

  test('Next and Back move between steps, and a step on another page opens that page', () => {
    mount('add-planner'); begin();
    mockPath = '/planners';
    // step 1 is on /planners; step 2 is on /import
    fireEvent.click(screen.getByTestId('tour-next'));
    expect(screen.getByRole('dialog').textContent).toContain('Choose the PDF');
    expect(mockPush).toHaveBeenCalledWith('/import');
    fireEvent.click(screen.getByTestId('tour-back'));
    expect(screen.getByRole('dialog').textContent).toContain('Open Import');
  });

  test('when the highlight is not on the screen, the card says what to do, and finds it when it appears', () => {
    jest.useFakeTimers();
    try {
      mount(); begin();
      expect(screen.getByTestId('tour-missing').textContent).toContain('not on the screen yet');
      expect(screen.queryByTestId('tour-highlight')).toBeNull();
      // the person presses Import and the page shows the button
      button('Import');
      act(() => { jest.advanceTimersByTime(300); });
      expect(screen.queryByTestId('tour-missing')).toBeNull();
      expect(screen.getByTestId('tour-highlight')).toBeTruthy();
    } finally { jest.useRealTimers(); }
  });

  test('a step with its own hint shows that hint', () => {
    mount(); begin();
    fireEvent.click(screen.getByTestId('tour-next'));      // step 2 needs the Import panel to be open
    expect(screen.getByTestId('tour-missing').textContent).toContain('Press Import first');
  });

  test('a step on another page than the person is on offers a button to open it', () => {
    mockPath = '/units';
    mount(); begin();                                   // step 1 is on /dashboard
    expect(screen.getByTestId('tour-missing')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tour-open-page'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  test('a click on the highlighted thing moves the walkthrough on by itself', () => {
    jest.useFakeTimers();
    try {
      const imp = button('Import');
      place(imp, { left: 400, top: 100, width: 80, height: 30 });
      mount(); begin();
      expect(screen.getByRole('dialog').textContent).toContain('Open Import');
      fireEvent.click(imp);
      act(() => { jest.advanceTimersByTime(600); });
      expect(screen.getByRole('dialog').textContent).toContain('Choose how to load the student');
    } finally { jest.useRealTimers(); }
  });

  test('Skip and Escape and the close button end it, and nothing is marked as finished', () => {
    mount(); begin();
    fireEvent.click(screen.getByTestId('tour-skip'));
    expect(screen.queryByRole('dialog')).toBeNull();
    begin(); expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    begin(); fireEvent.click(screen.getByTestId('tour-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('done').textContent).toBe('');
  });

  test('the last step says Finish, ends the walkthrough and remembers that it was finished', () => {
    mount(); begin();
    const total = TOURS.find((t) => t.id === 'transcript-import')!.steps.length;
    for (let i = 1; i < total; i++) fireEvent.click(screen.getByTestId('tour-next'));
    expect(screen.getByTestId('tour-next').textContent).toBe('Finish');
    fireEvent.click(screen.getByTestId('tour-next'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('done').textContent).toBe('transcript-import');
    expect(JSON.parse(localStorage.getItem('walkthroughsDone')!)).toEqual(['transcript-import']);
  });

  test('a reload goes on at the same step', () => {
    const first = mount(); begin();
    fireEvent.click(screen.getByTestId('tour-next'));
    fireEvent.click(screen.getByTestId('tour-next'));
    expect(screen.getByRole('dialog').textContent).toContain('Set the intake');
    first.unmount();
    mount();
    expect(screen.getByRole('dialog').textContent).toContain('Set the intake');
  });

  test('the card is a labelled dialog that does not block the page', () => {
    mount(); begin();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe('tour-title');
    expect(document.getElementById('tour-title')!.textContent).toBe('Open Import');
    expect(screen.getByTestId('tour-close').getAttribute('aria-label')).toBe('Close the walkthrough');
  });

  test('nothing is drawn when no walkthrough runs', () => {
    mount();
    expect(screen.queryByTestId('tour-root')).toBeNull();
  });
});
