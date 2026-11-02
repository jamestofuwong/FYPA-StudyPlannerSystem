import type { DesignTarget, Find } from './types';

/**
 * Finds the element that a walkthrough step points at. This is the same finder that scripts/guide-screenshots.ts uses
 * for the numbered callouts in the user guide, so a screenshot and a walkthrough point at the same thing.
 */

const TEXT_SELECTOR = 'button, a, h1, h2, h3, h4, label, span, p, div, th, li, [role=tab], select, textarea, input';

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

const normalise = (t: string) => t.trim().replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();

function findOne(f: Find, root: ParentNode): Element | null {
  let els: Element[];
  if ('css' in f) {
    els = [...root.querySelectorAll(f.css)].filter(isVisible);
  } else {
    const want = f.text.toLowerCase();
    els = [...root.querySelectorAll(f.tag ?? TEXT_SELECTOR)].filter(isVisible).filter((el) => {
      const t = normalise((el as HTMLElement).innerText ?? el.textContent ?? '');
      return f.contains ? t.includes(want) : f.startsWith ? t.startsWith(want) : t === want;
    });
    // keep only the innermost matches
    els = els.filter((el) => !els.some((o) => o !== el && el.contains(o)));
    if (f.xMin !== undefined) els = els.filter((e) => e.getBoundingClientRect().left >= f.xMin!);
    if (f.xMax !== undefined) els = els.filter((e) => e.getBoundingClientRect().left <= f.xMax!);
    if (f.yMax !== undefined) els = els.filter((e) => e.getBoundingClientRect().top <= f.yMax!);
  }
  return els[f.nth ?? 0] ?? null;
}

function isDesignTarget(t: unknown): t is DesignTarget {
  return typeof t === 'object' && t !== null && !Array.isArray(t) && 'meadow' in t && 'classic' in t;
}

/** The finder(s) for the design that is on the screen. */
export function targetFor(target: Find | Find[] | DesignTarget | null, design: 'meadow' | 'classic'): Find | Find[] | null {
  if (target === null) return null;
  return isDesignTarget(target) ? target[design] : target;
}

/** The first visible element for the first `Find` that matches, or null. The walkthrough's own card is never a match. */
export function findElement(find: Find | Find[] | null, root: ParentNode = document): Element | null {
  if (!find) return null;
  for (const f of Array.isArray(find) ? find : [find]) {
    const el = findOne(f, root);
    if (el && !el.closest('[data-tour-ui]')) return el;
  }
  return null;
}
