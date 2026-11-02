import type { TourPlacement } from './types';

export interface Box { left: number; top: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Placed { left: number; top: number; side: 'top' | 'bottom' | 'left' | 'right' | 'center' }

const GAP = 14;      // space between the highlight and the card
const MARGIN = 12;   // space between the card and the edge of the window

/**
 * Where to put the card next to a highlighted box. It tries the wished side first, then the others, and takes the first
 * one where the whole card is inside the window. If none fits (a very large highlight), the card goes in the corner of
 * the window. Pure, so that it can be tested.
 */
export function placeCard(target: Box | null, card: Size, view: Size, wish: TourPlacement = 'auto'): Placed {
  const maxLeft = Math.max(MARGIN, view.width - card.width - MARGIN);
  const maxTop = Math.max(MARGIN, view.height - card.height - MARGIN);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  // No highlight: bottom right, so the page stays usable.
  if (!target) return { left: maxLeft, top: maxTop, side: 'center' };

  const centreX = target.left + target.width / 2;
  const centreY = target.top + target.height / 2;
  const options: Record<'top' | 'bottom' | 'left' | 'right', Placed> = {
    bottom: { left: clamp(centreX - card.width / 2, MARGIN, maxLeft), top: target.top + target.height + GAP, side: 'bottom' },
    top: { left: clamp(centreX - card.width / 2, MARGIN, maxLeft), top: target.top - card.height - GAP, side: 'top' },
    right: { left: target.left + target.width + GAP, top: clamp(centreY - card.height / 2, MARGIN, maxTop), side: 'right' },
    left: { left: target.left - card.width - GAP, top: clamp(centreY - card.height / 2, MARGIN, maxTop), side: 'left' },
  };
  const fits = (p: Placed) => p.left >= MARGIN && p.top >= MARGIN && p.left + card.width <= view.width - MARGIN && p.top + card.height <= view.height - MARGIN;

  const order: Array<'top' | 'bottom' | 'left' | 'right'> =
    wish === 'auto' ? ['bottom', 'top', 'right', 'left'] : [wish, ...(['bottom', 'top', 'right', 'left'] as const).filter((s) => s !== wish)];
  for (const side of order) if (fits(options[side])) return options[side];

  // Nothing fits: keep the card in the window, in the corner that is farthest from the highlight.
  const left = centreX > view.width / 2 ? MARGIN : maxLeft;
  const top = centreY > view.height / 2 ? MARGIN : maxTop;
  return { left, top, side: 'center' };
}
