/**
 * Re-hues the Meadow design.
 *
 * Meadow's palette (theme.ts) was tuned by hand around one green. To let someone pick any colour for the
 * whole design, this takes that palette and turns every brand-coloured entry (backgrounds, borders, text tints,
 * the highlight) around the colour wheel to the chosen hue, keeping each entry's saturation and lightness, so
 * the calm look and the relationships between the tones survive. The semantic colours (red for errors, blue,
 * yellow, orange, purple and green for statuses) are NOT turned: they mean something on their own.
 *
 * A hue is not equally readable everywhere on the wheel (a yellow of the same lightness as the green is far
 * brighter), so the colours that carry text or sit under white text are then nudged lighter or darker until
 * they meet the same contrast targets for every hue.
 *
 * The default hue returns the original palette untouched.
 */
import { meadowThemes, type ThemeColors } from './theme';

/** The hue of Meadow's original green (#2D6A4F). */
export const DEFAULT_MEADOW_HUE = 153;

/** Semantic colours that keep their own hue whatever the brand hue is. */
const SEMANTIC_KEYS: ReadonlyArray<keyof ThemeColors> = [
  'accentBlue', 'accentGreen', 'accentYellow', 'accentOrange', 'accentPurple', 'accentRed',
];

/** CSS custom properties from meadow.css that hold a brand green and so must follow the hue. */
export const MEADOW_TOKEN_KEYS = [
  '--btn-primary-hover', '--code-emphasis', '--tint-highlight', '--overlay-rgb',
  '--shadow-card', '--scrollbar-thumb-hover', '--on-accent',
] as const;

export type MeadowTokens = Partial<Record<(typeof MEADOW_TOKEN_KEYS)[number], string>>;

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

interface Rgb { r: number; g: number; b: number }
interface Hsl { h: number; s: number; l: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Any number of degrees, wrapped to 0 up to (not including) 360. Non-numbers give the default hue. */
export function normalizeHue(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MEADOW_HUE;
  return ((Math.round(value) % 360) + 360) % 360;
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** The hue (0 to 359) of a colour typed as hex. Null when it is not a colour or has no hue (white, grey, black). */
export function hueFromHex(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  return hsl.s < 0.04 ? null : normalizeHue(hsl.h);
}

/** A mid-lightness swatch of the hue, for previews on the wheel itself. */
export function hueSwatch(hue: number): string {
  return rgbToHex(hslToRgb({ h: normalizeHue(hue), s: 0.55, l: 0.45 }));
}

function luminance(rgb: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return 1;
  const la = luminance(A), lb = luminance(B);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Turns a hex or rgba() colour by `delta` degrees, keeping its saturation, lightness and any alpha. */
function turn(color: string, delta: number): string {
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(color.trim());
  if (rgba) {
    const hsl = rgbToHsl({ r: +rgba[1], g: +rgba[2], b: +rgba[3] });
    const out = hslToRgb({ ...hsl, h: (hsl.h + delta + 360) % 360 });
    return `rgba(${Math.round(out.r)}, ${Math.round(out.g)}, ${Math.round(out.b)}, ${rgba[4]})`;
  }
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const hsl = rgbToHsl(rgb);
  if (hsl.s === 0) return rgbToHex(rgb);
  return rgbToHex(hslToRgb({ ...hsl, h: (hsl.h + delta + 360) % 360 }));
}

/** Moves a hex colour darker or lighter, a point of lightness at a time, until it reaches the contrast target. */
function reach(color: string, against: string | string[], min: number, direction: 'darker' | 'lighter'): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const hsl = rgbToHsl(rgb);
  const targets = Array.isArray(against) ? against : [against];
  const ok = (hex: string) => targets.every((t) => contrast(hex, t) >= min);
  let current = rgbToHex(rgb);
  for (let i = 0; i < 100 && !ok(current); i++) {
    hsl.l = clamp(hsl.l + (direction === 'darker' ? -0.01 : 0.01), 0, 1);
    current = rgbToHex(hslToRgb(hsl));
  }
  return current;
}

/** Shifts a colour's lightness by a number of points (positive is lighter). */
function shade(hex: string, points: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({ ...hsl, l: clamp(hsl.l + points / 100, 0, 1) }));
}

const triplet = (hex: string) => {
  const rgb = hexToRgb(hex)!;
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
};

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

/** Meadow's colours for a light or dark colour mode, turned to the given hue. */
export function meadowPalette(mode: 'light' | 'dark', hue: number = DEFAULT_MEADOW_HUE): ThemeColors {
  const base = meadowThemes[mode];
  const h = normalizeHue(hue);
  if (h === DEFAULT_MEADOW_HUE) return base;

  const delta = h - DEFAULT_MEADOW_HUE;
  const p = { ...base } as Record<keyof ThemeColors, string>;
  for (const key of Object.keys(base) as Array<keyof ThemeColors>) {
    if (!SEMANTIC_KEYS.includes(key)) p[key] = turn(base[key], delta);
  }

  if (mode === 'light') {
    const white = '#FFFFFF';
    p.activeHighlight = reach(p.activeHighlight, [white, p.activeBg], 5, 'darker');
    p.statusbarBg = p.activeHighlight;
    p.textSecondary = reach(p.textSecondary, [p.mainBg, white], 7, 'darker');
    p.textMuted = reach(p.textMuted, [p.mainBg, white, p.surfaceBg], 4.6, 'darker');
    p.textPrimary = reach(p.textPrimary, [p.mainBg, white], 11, 'darker');
    p.textLogo = p.textPrimary;
  } else {
    p.activeHighlight = reach(p.activeHighlight, [p.cardBg, p.mainBg, p.surfaceBg], 5.5, 'lighter');
    const { r, g, b } = hexToRgb(p.activeHighlight)!;
    p.activeBg = `rgba(${r}, ${g}, ${b}, 0.14)`;
    p.statusbarBg = reach(p.statusbarBg, '#FFFFFF', 7, 'darker');
    p.textSecondary = reach(p.textSecondary, [p.mainBg, p.cardBg], 8, 'lighter');
    p.textMuted = reach(p.textMuted, [p.mainBg, p.cardBg, p.surfaceBg], 5, 'lighter');
    p.textPrimary = reach(p.textPrimary, [p.mainBg, p.cardBg], 11, 'lighter');
    p.textLogo = p.textPrimary;
  }
  return p;
}

/**
 * The meadow.css tokens that hold a brand green, as values for the hue. Empty for the default hue, so the
 * stylesheet's own values apply.
 */
export function meadowTokens(mode: 'light' | 'dark', hue: number = DEFAULT_MEADOW_HUE): MeadowTokens {
  const h = normalizeHue(hue);
  if (h === DEFAULT_MEADOW_HUE) return {};
  const delta = h - DEFAULT_MEADOW_HUE;
  const palette = meadowPalette(mode, h);
  const highlight = palette.activeHighlight;
  const tokens: MeadowTokens = { '--tint-highlight': triplet(highlight) };

  if (mode === 'light') {
    const emphasis = shade(highlight, -7);
    tokens['--btn-primary-hover'] = emphasis;
    tokens['--code-emphasis'] = emphasis;
    tokens['--on-accent'] = '#FFFFFF';
    tokens['--overlay-rgb'] = triplet(turn('#1E2A24', delta));
    const shadow = triplet(turn('#1E2A24', delta));
    tokens['--shadow-card'] = `0 1px 2px rgba(${shadow}, 0.04), 0 8px 24px rgba(${shadow}, 0.05)`;
    tokens['--scrollbar-thumb-hover'] = turn('#A9B8A6', delta);
  } else {
    tokens['--btn-primary-hover'] = shade(highlight, 7);
    tokens['--code-emphasis'] = shade(highlight, 8);
    // Dark text for the bright highlight: dark enough to read, tinted to the hue
    const hsl = rgbToHsl(hexToRgb(highlight)!);
    tokens['--on-accent'] = reach(rgbToHex(hslToRgb({ h: hsl.h, s: 0.45, l: 0.09 })), highlight, 7, 'darker');
    tokens['--scrollbar-thumb-hover'] = turn('#4C5F53', delta);
  }
  return tokens;
}

/** A word for a hue, for people who cannot see the wheel. */
export function hueName(hue: number): string {
  const h = normalizeHue(hue);
  const names: Array<[number, string]> = [
    [15, 'red'], [45, 'orange'], [70, 'yellow'], [100, 'lime'], [165, 'green'], [195, 'teal'],
    [255, 'blue'], [290, 'violet'], [345, 'pink'], [360, 'red'],
  ];
  return names.find(([upTo]) => h < upTo)![1];
}

/** Ready-made choices shown beside the wheel. */
export const HUE_PRESETS: ReadonlyArray<{ name: string; hue: number }> = [
  { name: 'Original green', hue: DEFAULT_MEADOW_HUE },
  { name: 'Teal', hue: 182 },
  { name: 'Ocean blue', hue: 214 },
  { name: 'Violet', hue: 264 },
  { name: 'Rose', hue: 338 },
  { name: 'Amber', hue: 32 },
];

// ---------------------------------------------------------------------------
// Shades: grey, black and white
//
// These have no hue to turn the palette to, and they mean different things in light and dark. So each is
// designed for both modes:
//
//   Grey   soft neutral greys with a slate highlight.
//   Black  light: black highlight and buttons on crisp greys. Dark: true-black surfaces with a white highlight.
//   White  light: pure white surfaces; the highlight stays charcoal, because a white button would vanish on
//          white. Dark: the usual dark greys with a white highlight.
//
// Like the colours, they are checked against the same contrast targets.
// ---------------------------------------------------------------------------

export type MeadowShade = 'grey' | 'black' | 'white';

export const MEADOW_SHADES: ReadonlyArray<{ shade: MeadowShade; name: string; swatch: string }> = [
  { shade: 'grey', name: 'Grey', swatch: '#6B7076' },
  { shade: 'black', name: 'Black', swatch: '#141414' },
  { shade: 'white', name: 'White', swatch: '#FFFFFF' },
];

/** What the design is tinted with: a hue on the wheel, or one of the shades. */
export type MeadowAccent = { type: 'hue'; hue: number } | { type: 'shade'; shade: MeadowShade };

export const DEFAULT_ACCENT: MeadowAccent = { type: 'hue', hue: DEFAULT_MEADOW_HUE };

export function isMeadowShade(value: unknown): value is MeadowShade {
  return value === 'grey' || value === 'black' || value === 'white';
}

/** Takes the colour out of a hex or rgba() colour, keeping its lightness and any alpha. */
function grey(color: string): string {
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(color.trim());
  if (rgba) {
    const l = rgbToHsl({ r: +rgba[1], g: +rgba[2], b: +rgba[3] }).l * 255;
    return `rgba(${Math.round(l)}, ${Math.round(l)}, ${Math.round(l)}, ${rgba[4]})`;
  }
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const l = rgbToHsl(rgb).l * 255;
  return rgbToHex({ r: l, g: l, b: l });
}

const rgbaOf = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex)!;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function shadePalette(mode: 'light' | 'dark', shade: MeadowShade): ThemeColors {
  const base = meadowThemes[mode];
  const p = { ...base } as Record<keyof ThemeColors, string>;
  for (const key of Object.keys(base) as Array<keyof ThemeColors>) {
    if (!SEMANTIC_KEYS.includes(key)) p[key] = grey(base[key]);
  }

  if (mode === 'light') {
    if (shade === 'black') {
      Object.assign(p, {
        mainBg: '#F4F4F4', tabbarBg: '#F4F4F4', sidebarSearchBg: '#F4F4F4', cardHover: '#F4F4F4', surfaceBg: '#E9E9E9',
        sidebarBorder: '#D2D2D2', topbarBorder: '#D2D2D2', tabbarBorder: '#D2D2D2', panelBorder: '#D2D2D2',
        activeHighlight: '#111111', activeBg: '#E8E8E8', textPrimary: '#0C0C0C', textSecondary: '#111111',
        textMuted: '#4A4A4A', textLogo: '#0C0C0C', statusbarBg: '#111111', buttonBg: '#E9E9E9',
      });
    } else if (shade === 'white') {
      Object.assign(p, {
        mainBg: '#FFFFFF', sidebarBg: '#FFFFFF', topbarBg: '#FFFFFF', tabbarBg: '#FAFAFA', sidebarSearchBg: '#F6F6F6',
        cardBg: '#FFFFFF', panelBg: '#FFFFFF', cardHover: '#F7F7F7', surfaceBg: '#F2F2F2', rowAlt: '#FBFBFB',
        sidebarBorder: '#E6E6E6', topbarBorder: '#E6E6E6', tabbarBorder: '#E6E6E6', panelBorder: '#E6E6E6',
        activeHighlight: '#2B2B2B', activeBg: '#F0F0F0', textPrimary: '#1A1A1A', textSecondary: '#2B2B2B',
        textMuted: '#5C5C5C', textLogo: '#1A1A1A', statusbarBg: '#2B2B2B', buttonBg: '#F0F0F0', btnSecondaryBg: '#FFFFFF',
        scrollbarThumb: '#D0D0D0', scrollbarTrack: '#FAFAFA',
      });
    }
    const white = '#FFFFFF';
    p.activeHighlight = reach(p.activeHighlight, [white, p.activeBg], 5, 'darker');
    p.statusbarBg = reach(p.statusbarBg, white, 5.5, 'darker');
    p.textSecondary = reach(p.textSecondary, [p.mainBg, white], 7, 'darker');
    p.textMuted = reach(p.textMuted, [p.mainBg, white, p.surfaceBg], 4.6, 'darker');
    p.textPrimary = reach(p.textPrimary, [p.mainBg, white], 11, 'darker');
    p.textLogo = p.textPrimary;
  } else {
    if (shade === 'black') {
      Object.assign(p, {
        sidebarBg: '#0A0A0A', topbarBg: '#0A0A0A', mainBg: '#050505', tabbarBg: '#050505', sidebarSearchBg: '#141414',
        panelBg: '#0F0F0F', cardBg: '#0F0F0F', cardHover: '#1A1A1A', surfaceBg: '#1E1E1E', rowAlt: '#0B0B0B',
        sidebarBorder: '#262626', topbarBorder: '#262626', tabbarBorder: '#262626', panelBorder: '#262626',
        activeHighlight: '#F2F2F2', textPrimary: '#F5F5F5', textSecondary: '#E4E4E4', textMuted: '#A9A9A9',
        textLogo: '#F5F5F5', statusbarBg: '#262626', buttonBg: '#1E1E1E', btnSecondaryBg: '#0F0F0F',
        scrollbarThumb: '#3A3A3A', scrollbarTrack: '#050505',
      });
    } else if (shade === 'white') {
      Object.assign(p, { activeHighlight: '#FFFFFF', textSecondary: '#F0F0F0', statusbarBg: '#3A3A3A' });
    }
    p.activeHighlight = reach(p.activeHighlight, [p.cardBg, p.mainBg, p.surfaceBg], 5.5, 'lighter');
    p.activeBg = rgbaOf(p.activeHighlight, shade === 'white' ? 0.14 : 0.12);
    p.statusbarBg = reach(p.statusbarBg, '#FFFFFF', 7, 'darker');
    p.textSecondary = reach(p.textSecondary, [p.mainBg, p.cardBg], 8, 'lighter');
    p.textMuted = reach(p.textMuted, [p.mainBg, p.cardBg, p.surfaceBg], 5, 'lighter');
    p.textPrimary = reach(p.textPrimary, [p.mainBg, p.cardBg], 11, 'lighter');
    p.textLogo = p.textPrimary;
  }
  return p;
}

function shadeTokens(mode: 'light' | 'dark', shade: MeadowShade): MeadowTokens {
  const highlight = shadePalette(mode, shade).activeHighlight;
  const tokens: MeadowTokens = { '--tint-highlight': triplet(highlight) };
  if (mode === 'light') {
    const hover = shade === 'black' ? '#2E2E2E' : shade === 'white' ? '#444444' : shade_(highlight, -7);
    tokens['--btn-primary-hover'] = hover;
    tokens['--code-emphasis'] = highlight;
    tokens['--on-accent'] = '#FFFFFF';
    tokens['--overlay-rgb'] = '17, 17, 17';
    tokens['--shadow-card'] = '0 1px 2px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.06)';
    tokens['--scrollbar-thumb-hover'] = '#A6A6A6';
  } else {
    tokens['--btn-primary-hover'] = shade === 'grey' ? shade_(highlight, 7) : '#FFFFFF';
    tokens['--code-emphasis'] = shade === 'grey' ? shade_(highlight, 8) : '#FFFFFF';
    tokens['--on-accent'] = reach('#0C0C0C', highlight, 7, 'darker');
    tokens['--scrollbar-thumb-hover'] = shade === 'black' ? '#555555' : '#5A5A5A';
  }
  return tokens;
}
// `shade` is also the name of the parameter above, so the lightness helper gets a second name here
const shade_ = shade;

/** Meadow's colours for an accent: a hue on the wheel, or one of the shades. */
export function accentPalette(mode: 'light' | 'dark', accent: MeadowAccent = DEFAULT_ACCENT): ThemeColors {
  return accent.type === 'shade' ? shadePalette(mode, accent.shade) : meadowPalette(mode, accent.hue);
}

/** The meadow.css tokens for an accent. Empty for the original green. */
export function accentTokens(mode: 'light' | 'dark', accent: MeadowAccent = DEFAULT_ACCENT): MeadowTokens {
  return accent.type === 'shade' ? shadeTokens(mode, accent.shade) : meadowTokens(mode, accent.hue);
}

/** The accent a typed colour code stands for: a colour gives its hue, a grey, black or white gives a shade. */
export function accentFromHex(hex: string): MeadowAccent | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  if (hsl.s >= 0.04) return { type: 'hue', hue: normalizeHue(hsl.h) };
  return { type: 'shade', shade: hsl.l < 0.22 ? 'black' : hsl.l > 0.88 ? 'white' : 'grey' };
}

export function accentName(accent: MeadowAccent): string {
  return accent.type === 'shade' ? MEADOW_SHADES.find((s) => s.shade === accent.shade)!.name.toLowerCase() : hueName(accent.hue);
}
