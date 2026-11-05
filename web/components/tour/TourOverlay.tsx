'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { findElement, targetFor } from '../../lib/tour/findElement';
import { placeCard, type Box } from '../../lib/tour/placeCard';
import { fs, radius } from '../../styles/tokens';
import { useDesign } from '../../styles/themeProvider';
import { useTour } from './TourProvider';

/**
 * Draws the walkthrough: a highlight around the thing that the step is about, a dimmed page around it, and a card that
 * says what to do. The page stays fully usable (the highlight and the dim let every click through), so the person can
 * press the highlighted button, type in the box, or open another page, and the walkthrough waits.
 */

const PAD = 6;            // space between the highlighted thing and its ring
const CARD_WIDTH = 340;
const FIND_EVERY_MS = 200;

export default function TourOverlay() {
  const { tour, step, index, total, pathname, next, back, stop, openStepPage } = useTour();
  const design = useDesign();
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ width: 1280, height: 800 });
  const [cardSize, setCardSize] = useState({ width: CARD_WIDTH, height: 200 });
  const cardRef = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<string | null>(null);

  const stepKey = tour && step ? `${tour.id}/${step.id}` : null;

  // Look for the highlighted thing again and again: it can appear later (after a click), move, or go away.
  useEffect(() => {
    setBox(null);
    const target = step ? targetFor(step.target, design) : null;
    if (!step || !target) return;
    let last = '';
    let scrolled = false;
    const tick = () => {
      const el = findElement(target);
      if (!el) {
        if (last !== 'none') { last = 'none'; setBox(null); }
        return;
      }
      let r = el.getBoundingClientRect();
      if (!scrolled) {
        scrolled = true;
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: 'center', behavior: 'auto' });
          r = el.getBoundingClientRect();
        }
      }
      const key = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
      if (key !== last) {
        last = key;
        setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
      }
    };
    tick();
    const id = window.setInterval(tick, FIND_EVERY_MS);
    window.addEventListener('resize', tick);
    window.addEventListener('scroll', tick, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', tick);
      window.removeEventListener('scroll', tick, true);
    };
  }, [stepKey, design]); // eslint-disable-line react-hooks/exhaustive-deps

  // The window size.
  useEffect(() => {
    const update = () => setView({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Measure the card, so that it can be placed next to the highlight without leaving the window.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCardSize((s) => (Math.round(s.height) === Math.round(r.height) && Math.round(s.width) === Math.round(r.width) ? s : { width: r.width, height: r.height }));
  });

  // A step moves on when the person presses the highlighted thing (for example Import).
  useEffect(() => {
    const target = step ? targetFor(step.target, design) : null;
    if (!step?.advanceOnClick || !target) return;
    let timer: number | undefined;
    const onClick = (e: MouseEvent) => {
      const el = findElement(target);
      if (el && e.target instanceof Node && el.contains(e.target)) {
        timer = window.setTimeout(next, 450);   // let the page react to the click first
      }
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      if (timer) window.clearTimeout(timer);
    };
  }, [stepKey, next, design]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape ends the walkthrough.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, stop]);

  // Put the keyboard focus on the card when a walkthrough starts (not on every step: the person can be typing).
  useEffect(() => {
    if (tour && focusedFor.current !== tour.id) {
      focusedFor.current = tour.id;
      cardRef.current?.focus();
    }
    if (!tour) focusedFor.current = null;
  }, [tour, stepKey]);

  if (!tour || !step) return null;

  const missing = !!targetFor(step.target, design) && !box;
  const placed = placeCard(box ? { left: box.left - PAD, top: box.top - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD } : null,
    cardSize, view, step.placement);
  const last = index === total - 1;
  const onOtherPage = pathname !== step.path;

  const ring: React.CSSProperties = box ? {
    position: 'fixed', left: box.left - PAD, top: box.top - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD,
    borderRadius: radius(6), pointerEvents: 'none', zIndex: 10100,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    outline: '3px solid var(--active-highlight, #0078d4)', outlineOffset: 0,
    animation: 'tour-pulse 1.6s ease-in-out infinite',
  } : {};

  const button = (primary: boolean, disabled = false): React.CSSProperties => ({
    height: 32, padding: '0 14px', fontSize: fs(13), fontWeight: 600, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: radius(4), opacity: disabled ? 0.5 : 1,
    border: primary ? 'none' : '1px solid var(--panel-border, #888)',
    background: primary ? 'var(--active-highlight, #0078d4)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-primary, inherit)',
  });

  return (
    <div data-tour-ui data-testid="tour-root">
      <style>{`
        @keyframes tour-pulse { 0%, 100% { outline-color: var(--active-highlight, #0078d4); } 50% { outline-color: transparent; } }
        @media (prefers-reduced-motion: reduce) { [data-testid="tour-highlight"] { animation: none !important; } }
      `}</style>

      {box && <div data-testid="tour-highlight" aria-hidden="true" style={ring} />}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        tabIndex={-1}
        data-testid="tour-card"
        data-side={placed.side}
        style={{
          position: 'fixed', left: placed.left, top: placed.top, width: Math.min(CARD_WIDTH, view.width - 24), zIndex: 10101,
          boxSizing: 'border-box', padding: 16, outline: 'none',
          background: 'var(--panel-bg, #fff)', color: 'var(--text-primary, #222)',
          border: '1px solid var(--active-highlight, #0078d4)', borderRadius: radius(8),
          boxShadow: '0 8px 28px rgba(0, 0, 0, 0.35)', fontSize: fs(13), lineHeight: 1.5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: fs(11), fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted, #777)' }}>
            {tour.title} · Step {index + 1} of {total}
          </span>
          <button type="button" onClick={stop} aria-label="Close the walkthrough" title="Close the walkthrough (Esc)" data-testid="tour-close"
            style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #777)', padding: 2 }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ height: 3, borderRadius: 2, background: 'var(--panel-border, #ddd)', marginBottom: 10, overflow: 'hidden' }} aria-hidden="true">
          <div style={{ width: `${((index + 1) / total) * 100}%`, height: '100%', background: 'var(--active-highlight, #0078d4)' }} />
        </div>

        <h2 id="tour-title" style={{ margin: '0 0 6px', fontSize: fs(16), fontWeight: 700 }}>{step.title}</h2>
        <p id="tour-text" style={{ margin: 0, color: 'var(--text-secondary, inherit)' }}>{step.text}</p>

        {missing && (
          <div role="status" data-testid="tour-missing" style={{
            marginTop: 10, padding: '8px 10px', borderRadius: radius(4), fontSize: fs(12),
            background: 'var(--active-bg, rgba(0, 120, 212, 0.1))', border: '1px solid var(--panel-border, #ccc)',
          }}>
            {step.missing ?? 'This part is not on the screen yet.'}
            {onOtherPage && (
              <div style={{ marginTop: 6 }}>
                <button type="button" onClick={openStepPage} data-testid="tour-open-page" style={{ ...button(false), height: 28, fontSize: fs(12) }}>
                  Open this page
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={stop} data-testid="tour-skip"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #777)', fontSize: fs(12), fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
            Skip the walkthrough
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={back} disabled={index === 0} data-testid="tour-back" style={button(false, index === 0)}>Back</button>
            <button type="button" onClick={next} data-testid="tour-next" style={button(true)}>{last ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
