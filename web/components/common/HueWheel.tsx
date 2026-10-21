'use client';

/**
 * A colour wheel for choosing what Meadow is tinted with.
 *
 * Drag around the ring (or click it), use the arrow keys, pick a ready-made colour or a shade (grey, black or
 * white), or type a colour code. A colour gives only its hue: Meadow keeps its own softness and makes sure text
 * stays readable (styles/meadowHue.ts).
 */
import { useEffect, useRef, useState } from 'react';
import styles from './HueWheel.module.css';
import {
  DEFAULT_MEADOW_HUE, HUE_PRESETS, MEADOW_SHADES, accentFromHex, hueName, hueSwatch, normalizeHue, type MeadowShade,
} from '../../styles/meadowHue';

export interface HueWheelProps {
  hue: number;
  onChange: (hue: number) => void;
  /** The shade in use instead of a colour, or null when a colour is in use. */
  shade?: MeadowShade | null;
  onShade?: (shade: MeadowShade) => void;
  /** Back to the original green. */
  onReset: () => void;
  /** The colour the design is actually using for highlights at this hue, shown in the middle and in the code box. */
  accent: string;
}

const SIZE = 196;
const RING = 30;
const CENTER = SIZE / 2;
const OUTER = SIZE / 2;
const INNER = OUTER - RING;

export default function HueWheel({ hue, onChange, shade = null, onShade, onReset, accent }: HueWheelProps) {
  const ringRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [code, setCode] = useState(accent.toUpperCase());
  const [problem, setProblem] = useState('');

  // Keep the code box in step with the wheel, unless someone is typing in it
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setCode(accent.toUpperCase());
  }, [accent]);

  const fromPointer = (clientX: number, clientY: number) => {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const box = ringRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    // 0 degrees is straight up, increasing clockwise
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onChange(normalizeHue(angle));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
    const box = e.currentTarget.getBoundingClientRect();
    const dist = Math.hypot(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2));
    if (dist < INNER - 6) return; // the middle is not part of the wheel
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    fromPointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) fromPointer(e.clientX, e.clientY);
  };
  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const move = (by: number) => { e.preventDefault(); onChange(normalizeHue(hue + by)); };
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') move(step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') move(-step);
    else if (e.key === 'PageUp') move(15);
    else if (e.key === 'PageDown') move(-15);
    else if (e.key === 'Home') { e.preventDefault(); onReset(); }
  };

  const applyCode = () => {
    typing.current = false;
    const text = code.trim();
    if (text === '' || text.toUpperCase() === accent.toUpperCase()) { setCode(accent.toUpperCase()); setProblem(''); return; }
    const parsed = accentFromHex(text);
    if (parsed === null) {
      setProblem('Type a colour code such as #2459A8.');
      setCode(accent.toUpperCase());
      return;
    }
    setProblem('');
    if (parsed.type === 'hue') onChange(parsed.hue);
    else onShade?.(parsed.shade);
  };

  const radians = ((hue - 90) * Math.PI) / 180;
  const mid = INNER + RING / 2;
  const thumbX = CENTER + mid * Math.cos(radians);
  const thumbY = CENTER + mid * Math.sin(radians);

  return (
    <div className={styles.root}>
      <div
        ref={ringRef}
        className={styles.wheel}
        style={{ width: SIZE, height: SIZE }}
        role="slider"
        tabIndex={0}
        aria-label="Accent colour hue"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={hue}
        aria-valuetext={shade ? `${shade}, no colour chosen. Turn the wheel to pick a colour` : `${hueName(hue)}, hue ${hue} degrees`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        data-testid="hue-wheel"
      >
        <div className={styles.ring} style={{ ['--ring' as string]: `${RING}px` }} />
        <div className={styles.centre} style={{ background: accent, inset: RING + 6 }} aria-hidden="true">
          <span>{shade ?? hueName(hue)}</span>
        </div>
        {!shade && <div className={styles.thumb} style={{ left: thumbX, top: thumbY, background: hueSwatch(hue) }} aria-hidden="true" />}
      </div>

      <div className={styles.side}>
        <label className={styles.codeLabel}>
          Colour code
          <input
            className={styles.code}
            value={code}
            spellCheck={false}
            maxLength={9}
            aria-invalid={problem !== ''}
            aria-describedby="hue-wheel-help"
            onFocus={() => { typing.current = true; }}
            onChange={(e) => setCode(e.target.value)}
            onBlur={applyCode}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } }}
          />
        </label>
        <p id="hue-wheel-help" className={problem ? styles.problem : styles.help} role={problem ? 'alert' : undefined}>
          {problem || 'Turn the wheel, use the arrow keys, pick a shade, or type a colour code. A grey, black or white code picks that shade.'}
        </p>

        <div className={styles.presets} role="group" aria-label="Ready-made colours">
          {HUE_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className={`${styles.preset} ${!shade && hue === p.hue ? styles.presetActive : ''}`}
              style={{ background: hueSwatch(p.hue) }}
              onClick={() => onChange(p.hue)}
              aria-label={p.name}
              aria-pressed={!shade && hue === p.hue}
              title={p.name}
            />
          ))}
        </div>

        <div className={styles.shades} role="group" aria-label="Shades">
          {MEADOW_SHADES.map((sh) => (
            <button
              key={sh.shade}
              type="button"
              className={`${styles.shade} ${shade === sh.shade ? styles.shadeActive : ''}`}
              onClick={() => onShade?.(sh.shade)}
              aria-pressed={shade === sh.shade}
              title={`${sh.name}: no colour`}
            >
              <i style={{ background: sh.swatch }} aria-hidden="true" />
              {sh.name}
            </button>
          ))}
        </div>

        <div className={styles.sample} aria-hidden="true">
          <span className={styles.sampleButton}>Button</span>
          <span className={styles.sampleBadge}>Badge</span>
          <span className={styles.sampleBar}><i /></span>
        </div>

        <button type="button" className={styles.reset} onClick={onReset} disabled={!shade && hue === DEFAULT_MEADOW_HUE}>
          Use the original green
        </button>
      </div>
    </div>
  );
}
