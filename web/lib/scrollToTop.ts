// ============================================================
// Starts a page at the top when it is navigated to.
//
// The app shell scrolls an inner panel rather than the window (.panels in app/(pages)/layout.module.css),
// and Next.js only resets the window's scroll on navigation. So a page inherits wherever the previous page
// was scrolled to: leave the class estimator scrolled down to its log, and the Head of Department view opens
// scrolled down too.
//
// This walks up from a page's root to the first ancestor that actually scrolls and resets that, rather than
// naming the layout's class, which is hashed by CSS modules and would break silently if the layout changed.
// ============================================================

import { useEffect, type RefObject } from 'react';

function scrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** Scrolls whatever contains the page back to the top, once, when the page mounts. */
export function useScrollToTopOnMount(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = scrollableAncestor(rootRef.current);
    if (container) container.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [rootRef]);
}
