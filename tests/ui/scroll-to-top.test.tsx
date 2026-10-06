/** @jest-environment jsdom */
// ============================================================
// Tests for web/lib/scrollToTop.ts.
//
// The app scrolls an inner panel rather than the window, and Next.js only resets the window on navigation,
// so a page used to open wherever the previous one was left scrolled. These tests build that shape by hand,
// since jsdom does no layout: a scrolling container with a page inside it, already scrolled down.
// ============================================================

import React, { useRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { useScrollToTopOnMount } from '@/lib/scrollToTop';

function Page() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(rootRef);
  return <div ref={rootRef}>page</div>;
}

/** A container that reports itself as scrollable and already scrolled, as the app's .panels would be. */
function scrolledContainer() {
  const container = document.createElement('div');
  container.style.overflowY = 'auto';
  Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });
  container.scrollTop = 900;
  document.body.appendChild(container);
  return container;
}

describe('useScrollToTopOnMount', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  test('a page opens at the top of the panel that scrolls it', () => {
    const container = scrolledContainer();
    render(<Page />, { container });
    expect(container.scrollTop).toBe(0);
  });

  // The nearest scroller is the one that holds the page, and it is found by walking up rather than by the
  // layout's class name, which CSS modules hash.
  test('finds the scroller however deep the page sits inside it', () => {
    const container = scrolledContainer();
    const inner = document.createElement('div');
    container.appendChild(inner);
    render(<Page />, { container: inner });
    expect(container.scrollTop).toBe(0);
  });

  // A panel that does not scroll is skipped rather than reset, so the right element is the one that moves.
  test('skips an ancestor that cannot actually scroll', () => {
    const outer = scrolledContainer();
    const notScrolling = document.createElement('div');
    notScrolling.style.overflowY = 'visible';
    outer.appendChild(notScrolling);

    render(<Page />, { container: notScrolling });
    expect(outer.scrollTop).toBe(0);
  });

  test('falls back to the window when nothing inside it scrolls', () => {
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const plain = document.createElement('div');
    document.body.appendChild(plain);

    render(<Page />, { container: plain });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
