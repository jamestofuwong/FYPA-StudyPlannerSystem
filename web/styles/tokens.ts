import type { CSSProperties } from 'react';

// Design tokens for inline styles. Each helper returns `var(--token, <classic value>)`:
// the classic design never defines these tokens, so it always renders the exact
// original value, while styles/meadow.css defines them for the Meadow design.
// CSS modules use the same token names directly.

const FONT_SIZE_TOKENS: Record<number, string> = {
  8: '--text-micro',
  9: '--text-tiny',
  10: '--text-caption',
  11: '--text-small',
  11.5: '--text-small',
  12: '--text-body-sm',
  13: '--text-body',
  14: '--text-body-lg',
  15: '--text-title',
  16: '--text-title',
  18: '--text-heading',
  20: '--text-heading',
  22: '--text-display-sm',
  26: '--text-display',
  28: '--text-display',
  36: '--text-hero',
};

/** Font size for a classic pixel size, scaled up by the Meadow type scale. */
export function fs(px: number): string {
  const token = FONT_SIZE_TOKENS[px];
  return token ? `var(${token}, ${px}px)` : `${px}px`;
}

/** Corner radius for a classic pixel radius, softened in Meadow. */
export function radius(px: number): string {
  if (px <= 3) return `var(--radius-sm, ${px}px)`;
  if (px <= 6) return `var(--radius-md, ${px}px)`;
  if (px <= 10) return `var(--radius-lg, ${px}px)`;
  return `${px}px`;
}

/** Letter spacing for small-caps style labels; Meadow drops the tracking. */
export function tracking(value: string): string {
  return `var(--label-tracking, ${value})`;
}

/** Upper-case labels in classic, sentence case in Meadow. */
export const labelCase = 'var(--label-case, uppercase)' as CSSProperties['textTransform'];

/**
 * Fixed table column width, widened in Meadow to fit its larger type.
 * Pass `meadowPx` to give a column its own Meadow width instead of the scale.
 */
export function colWidth(px: number, meadowPx?: number): string {
  if (meadowPx !== undefined) return `calc(${px}px + ${meadowPx - px}px * var(--col-meadow, 0))`;
  return `calc(${px}px * var(--col-scale, 1))`;
}
