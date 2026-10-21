import {
  DEFAULT_ACCENT, DEFAULT_MEADOW_HUE, HUE_PRESETS, MEADOW_SHADES, MEADOW_TOKEN_KEYS, accentFromHex, accentName, accentPalette,
  accentTokens, contrast, hexToRgb, hueFromHex, hueName, hueSwatch, isMeadowShade, meadowPalette, meadowTokens, normalizeHue,
  type MeadowShade,
} from '../../../web/styles/meadowHue';
import { meadowThemes, type ThemeColors } from '../../../web/styles/theme';

const HUES = Array.from({ length: 72 }, (_, i) => i * 5);
const SEMANTIC: Array<keyof ThemeColors> = ['accentBlue', 'accentGreen', 'accentYellow', 'accentOrange', 'accentPurple', 'accentRed'];

describe('normalizeHue', () => {
  it('wraps any angle into 0 to 359', () => {
    expect(normalizeHue(0)).toBe(0);
    expect(normalizeHue(360)).toBe(0);
    expect(normalizeHue(-10)).toBe(350);
    expect(normalizeHue(725)).toBe(5);
    expect(normalizeHue(153.6)).toBe(154);
  });
  it('falls back to the default for anything that is not a number', () => {
    expect(normalizeHue(NaN)).toBe(DEFAULT_MEADOW_HUE);
    expect(normalizeHue(Infinity)).toBe(DEFAULT_MEADOW_HUE);
  });
});

describe('hueFromHex', () => {
  it('reads the hue of a colour code', () => {
    expect(hueFromHex('#FF0000')).toBe(0);
    expect(hueFromHex('#00FF00')).toBe(120);
    expect(hueFromHex('#0000FF')).toBe(240);
    expect(hueFromHex('2459A8')).toBeGreaterThan(205);
    expect(hueFromHex('#2d6a4f')).toBeGreaterThanOrEqual(150);
    expect(hueFromHex('#2d6a4f')).toBeLessThanOrEqual(156);
  });
  it('accepts short codes', () => {
    expect(hueFromHex('#f00')).toBe(0);
  });
  it('has no hue for grey, white, black or rubbish', () => {
    expect(hueFromHex('#808080')).toBeNull();
    expect(hueFromHex('#FFFFFF')).toBeNull();
    expect(hueFromHex('#000')).toBeNull();
    expect(hueFromHex('banana')).toBeNull();
    expect(hueFromHex('')).toBeNull();
  });
});

describe('the default hue', () => {
  it('returns the original palette exactly, light and dark', () => {
    expect(meadowPalette('light')).toBe(meadowThemes.light);
    expect(meadowPalette('dark', DEFAULT_MEADOW_HUE)).toBe(meadowThemes.dark);
    expect(meadowPalette('light', DEFAULT_MEADOW_HUE + 360)).toBe(meadowThemes.light);
  });
  it('leaves the stylesheet tokens alone', () => {
    expect(meadowTokens('light')).toEqual({});
    expect(meadowTokens('dark', DEFAULT_MEADOW_HUE)).toEqual({});
  });
  it('is the hue of the original green', () => {
    const rgb = hexToRgb(meadowThemes.light.activeHighlight)!;
    expect(rgb).toBeTruthy();
    expect(Math.abs(hueFromHex(meadowThemes.light.activeHighlight)! - DEFAULT_MEADOW_HUE)).toBeLessThanOrEqual(2);
  });
});

describe('a custom hue', () => {
  it('turns the brand colours but not the status colours', () => {
    for (const mode of ['light', 'dark'] as const) {
      const base = meadowThemes[mode];
      const p = meadowPalette(mode, 220);
      for (const key of SEMANTIC) expect(p[key]).toBe(base[key]);
      expect(p.activeHighlight).not.toBe(base.activeHighlight);
      expect(p.mainBg).not.toBe(base.mainBg);
      expect(p.panelBorder).not.toBe(base.panelBorder);
    }
  });

  it('keeps white white', () => {
    const p = meadowPalette('light', 300);
    expect(p.cardBg.toUpperCase()).toBe('#FFFFFF');
    expect(p.sidebarBg.toUpperCase()).toBe('#FFFFFF');
  });

  it('puts the highlight where the hue says', () => {
    for (const hue of [20, 90, 200, 280, 330]) {
      const got = hueFromHex(meadowPalette('light', hue).activeHighlight)!;
      const apart = Math.min(Math.abs(got - hue), 360 - Math.abs(got - hue));
      expect(apart).toBeLessThanOrEqual(6);
    }
  });

  it('only returns valid colours', () => {
    const hex = /^#[0-9A-F]{6}$/;
    const rgba = /^rgba\(\d+, \d+, \d+, [\d.]+\)$/;
    for (const mode of ['light', 'dark'] as const) {
      for (const hue of [0, 77, 153, 210, 359]) {
        for (const [key, value] of Object.entries(meadowPalette(mode, hue))) {
          expect(`${key}: ${value}`).toMatch(new RegExp(`^${key}: (#[0-9a-fA-F]{6}|rgba\\(.*\\))$`));
          expect(hex.test(value.toUpperCase()) || rgba.test(value)).toBe(true);
        }
      }
    }
  });

  it('is deterministic', () => {
    expect(meadowPalette('dark', 250)).toEqual(meadowPalette('dark', 250));
  });
});

describe('text stays readable on every hue', () => {
  it.each(HUES)('light, hue %i', (hue) => {
    const p = meadowPalette('light', hue);
    const bar = (a: string, b: string, min: number, what: string) => {
      const got = contrast(a, b);
      if (got < min) throw new Error(`${what}: ${got.toFixed(2)} is below ${min} (${a} on ${b})`);
    };
    bar(p.textPrimary, p.mainBg, 11, 'primary text on the page');
    bar(p.textPrimary, p.cardBg, 11, 'primary text on a card');
    bar(p.textSecondary, p.mainBg, 7, 'secondary text on the page');
    bar(p.textMuted, p.mainBg, 4.5, 'muted text on the page');
    bar(p.textMuted, p.surfaceBg, 4.5, 'muted text on a surface');
    bar('#FFFFFF', p.activeHighlight, 5, 'white text on the highlight');
    bar(p.activeHighlight, p.activeBg, 4.5, 'highlight text on its tint');
    bar('#FFFFFF', p.statusbarBg, 5, 'white text on the status bar');
    const tokens = meadowTokens('light', hue);
    bar(tokens['--on-accent']!, tokens['--btn-primary-hover']!, 4.5, 'text on the hover button');
  });

  it.each(HUES)('dark, hue %i', (hue) => {
    const p = meadowPalette('dark', hue);
    const tokens = meadowTokens('dark', hue);
    const bar = (a: string, b: string, min: number, what: string) => {
      const got = contrast(a, b);
      if (got < min) throw new Error(`${what}: ${got.toFixed(2)} is below ${min} (${a} on ${b})`);
    };
    bar(p.textPrimary, p.mainBg, 11, 'primary text on the page');
    bar(p.textPrimary, p.cardBg, 11, 'primary text on a card');
    bar(p.textSecondary, p.mainBg, 7, 'secondary text on the page');
    bar(p.textMuted, p.cardBg, 4.5, 'muted text on a card');
    bar(p.activeHighlight, p.cardBg, 5, 'highlight on a card');
    bar(p.activeHighlight, p.mainBg, 5, 'highlight on the page');
    bar(tokens['--on-accent']!, p.activeHighlight, 6, 'text on the highlight');
    bar(tokens['--on-accent']!, tokens['--btn-primary-hover']!, 4.5, 'text on the hover button');
    bar('#FFFFFF', p.statusbarBg, 5, 'white text on the status bar');
  });
});

describe('every single hue', () => {
  it('meets the contrast targets for text, in both colour modes', () => {
    const failures: string[] = [];
    for (let hue = 0; hue < 360; hue++) {
      const l = meadowPalette('light', hue);
      const d = meadowPalette('dark', hue);
      const dt = meadowTokens('dark', hue);
      const lt = meadowTokens('light', hue);
      const checks: Array<[string, number, number]> = [
        ['light primary', contrast(l.textPrimary, l.mainBg), 11],
        ['light secondary', contrast(l.textSecondary, l.mainBg), 7],
        ['light muted', contrast(l.textMuted, l.surfaceBg), 4.5],
        ['light white on highlight', contrast('#FFFFFF', l.activeHighlight), 5],
        ['light highlight on tint', contrast(l.activeHighlight, l.activeBg), 4.5],
        // the original green keeps the stylesheet's own values, so no override exists for it
        ['light on hover', contrast(lt['--on-accent'] ?? '#FFFFFF', lt['--btn-primary-hover'] ?? '#1F5139'), 4.5],
        ['dark primary', contrast(d.textPrimary, d.cardBg), 11],
        ['dark secondary', contrast(d.textSecondary, d.mainBg), 7],
        ['dark muted', contrast(d.textMuted, d.cardBg), 4.5],
        ['dark highlight on card', contrast(d.activeHighlight, d.cardBg), 5],
        ['dark on accent', contrast(dt['--on-accent'] ?? '#0E2219', d.activeHighlight), 6],
        ['dark white on status bar', contrast('#FFFFFF', d.statusbarBg), 5],
      ];
      for (const [what, got, min] of checks) if (got < min) failures.push(`hue ${hue} ${what}: ${got.toFixed(2)} < ${min}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('stylesheet tokens', () => {
  it('cover exactly the properties meadow.css defines, and nothing else', () => {
    const light = Object.keys(meadowTokens('light', 200));
    const dark = Object.keys(meadowTokens('dark', 200));
    for (const key of [...light, ...dark]) expect(MEADOW_TOKEN_KEYS as readonly string[]).toContain(key);
    expect(light).toEqual(expect.arrayContaining(['--tint-highlight', '--btn-primary-hover', '--code-emphasis', '--on-accent', '--shadow-card']));
    expect(dark).toEqual(expect.arrayContaining(['--tint-highlight', '--btn-primary-hover', '--code-emphasis', '--on-accent']));
  });
  it('gives the highlight as an r, g, b triple', () => {
    expect(meadowTokens('light', 200)['--tint-highlight']).toMatch(/^\d+, \d+, \d+$/);
  });
  it('makes the light hover colour darker than the highlight and the dark one lighter', () => {
    const light = meadowTokens('light', 40);
    expect(contrast(light['--btn-primary-hover']!, '#FFFFFF')).toBeGreaterThan(contrast(meadowPalette('light', 40).activeHighlight, '#FFFFFF'));
    const dark = meadowTokens('dark', 40);
    expect(contrast(dark['--btn-primary-hover']!, '#000000')).toBeGreaterThan(contrast(meadowPalette('dark', 40).activeHighlight, '#000000'));
  });
});

describe('helpers for the wheel', () => {
  it('names hues', () => {
    expect(hueName(0)).toBe('red');
    expect(hueName(30)).toBe('orange');
    expect(hueName(60)).toBe('yellow');
    expect(hueName(153)).toBe('green');
    expect(hueName(180)).toBe('teal');
    expect(hueName(220)).toBe('blue');
    expect(hueName(270)).toBe('violet');
    expect(hueName(320)).toBe('pink');
    expect(hueName(340)).toBe('pink');
    expect(hueName(350)).toBe('red');
    expect(hueName(359)).toBe('red');
  });
  it('gives each preset a distinct hue, starting with the original green', () => {
    expect(HUE_PRESETS[0].hue).toBe(DEFAULT_MEADOW_HUE);
    expect(new Set(HUE_PRESETS.map((p) => p.hue)).size).toBe(HUE_PRESETS.length);
  });
  it('draws a swatch for any hue', () => {
    for (const hue of [0, 120, 359]) expect(hueSwatch(hue)).toMatch(/^#[0-9A-F]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Shades: grey, black and white
// ---------------------------------------------------------------------------

const SHADES: MeadowShade[] = ['grey', 'black', 'white'];
const MODES = ['light', 'dark'] as const;
const isNeutral = (value: string) => {
  const rgb = hexToRgb(value);
  if (rgb) return rgb.r === rgb.g && rgb.g === rgb.b;
  const m = /^rgba\((\d+), (\d+), (\d+), [\d.]+\)$/.exec(value);
  return !!m && m[1] === m[2] && m[2] === m[3];
};

describe('shades', () => {
  it('are grey, black and white, each with a swatch', () => {
    expect(MEADOW_SHADES.map((s) => s.shade)).toEqual(SHADES);
    for (const s of MEADOW_SHADES) expect(s.swatch).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('can be recognised', () => {
    expect(isMeadowShade('grey')).toBe(true);
    expect(isMeadowShade('black')).toBe(true);
    expect(isMeadowShade('white')).toBe(true);
    expect(isMeadowShade('gray')).toBe(false);
    expect(isMeadowShade('')).toBe(false);
    expect(isMeadowShade(null)).toBe(false);
    expect(isMeadowShade(153)).toBe(false);
  });

  describe.each(MODES)('in %s mode', (mode) => {
    it.each(SHADES)('%s is made only of greys, apart from the status colours', (shade) => {
      const p = accentPalette(mode, { type: 'shade', shade });
      for (const [key, value] of Object.entries(p)) {
        if (SEMANTIC.includes(key as keyof ThemeColors)) expect(value).toBe(meadowThemes[mode][key as keyof ThemeColors]);
        else expect(`${key} ${value} ${isNeutral(value)}`).toBe(`${key} ${value} true`);
      }
    });

    it.each(SHADES)('%s meets the contrast targets', (shade) => {
      const p = accentPalette(mode, { type: 'shade', shade });
      const t = accentTokens(mode, { type: 'shade', shade });
      const failures: string[] = [];
      const need = (what: string, a: string, b: string, min: number) => {
        const got = contrast(a, b);
        if (got < min) failures.push(`${what}: ${got.toFixed(2)} < ${min} (${a} on ${b})`);
      };
      need('primary text', p.textPrimary, p.mainBg, 11);
      need('primary text on cards', p.textPrimary, p.cardBg, 11);
      need('secondary text', p.textSecondary, p.mainBg, 7);
      need('muted text', p.textMuted, p.surfaceBg, 4.5);
      need('muted text on cards', p.textMuted, p.cardBg, 4.5);
      need('white on the status bar', '#FFFFFF', p.statusbarBg, mode === 'light' ? 5 : 5);
      if (mode === 'light') {
        need('white on the highlight', '#FFFFFF', p.activeHighlight, 5);
        need('highlight on its tint', p.activeHighlight, p.activeBg, 4.5);
        need('white on the hover button', '#FFFFFF', t['--btn-primary-hover']!, 4.5);
      } else {
        need('highlight on cards', p.activeHighlight, p.cardBg, 5);
        need('highlight on the page', p.activeHighlight, p.mainBg, 5);
        need('text on the highlight', t['--on-accent']!, p.activeHighlight, 6);
      }
      expect(failures).toEqual([]);
    });

    it.each(SHADES)('%s gives valid stylesheet tokens', (shade) => {
      const t = accentTokens(mode, { type: 'shade', shade });
      expect(Object.keys(t)).toEqual(expect.arrayContaining(['--tint-highlight', '--btn-primary-hover', '--on-accent']));
      for (const key of Object.keys(t)) expect(MEADOW_TOKEN_KEYS as readonly string[]).toContain(key);
      expect(t['--tint-highlight']).toMatch(/^\d+, \d+, \d+$/);
    });
  });

  it('black is the darkest highlight in light mode and white the lightest in dark mode', () => {
    const lum = (hex: string) => contrast(hex, '#000000');
    const light = (shade: MeadowShade) => accentPalette('light', { type: 'shade', shade }).activeHighlight;
    const dark = (shade: MeadowShade) => accentPalette('dark', { type: 'shade', shade }).activeHighlight;
    expect(lum(light('black'))).toBeLessThan(lum(light('grey')));
    expect(lum(light('black'))).toBeLessThan(lum(light('white')));
    expect(lum(dark('white'))).toBeGreaterThanOrEqual(lum(dark('grey')));
    expect(dark('white').toUpperCase()).toBe('#FFFFFF');
  });

  it('white is the whitest page in light mode, black the blackest in dark mode', () => {
    expect(accentPalette('light', { type: 'shade', shade: 'white' }).mainBg).toBe('#FFFFFF');
    expect(contrast(accentPalette('light', { type: 'shade', shade: 'white' }).mainBg, '#FFFFFF')).toBe(1);
    const darkest = (shade: MeadowShade) => contrast(accentPalette('dark', { type: 'shade', shade }).mainBg, '#000000');
    expect(darkest('black')).toBeLessThan(darkest('grey'));
    expect(darkest('black')).toBeLessThan(1.1);
  });

  it('each shade looks different from the others', () => {
    for (const mode of MODES) {
      const looks = SHADES.map((shade) => JSON.stringify(accentPalette(mode, { type: 'shade', shade })));
      expect(new Set(looks).size).toBe(3);
    }
  });

  it('is deterministic', () => {
    expect(accentPalette('dark', { type: 'shade', shade: 'black' })).toEqual(accentPalette('dark', { type: 'shade', shade: 'black' }));
  });
});

describe('accentPalette and accentTokens', () => {
  it('give the original green for the default accent', () => {
    expect(accentPalette('light', DEFAULT_ACCENT)).toBe(meadowThemes.light);
    expect(accentPalette('dark')).toBe(meadowThemes.dark);
    expect(accentTokens('light', DEFAULT_ACCENT)).toEqual({});
  });
  it('give what meadowPalette and meadowTokens give for a hue', () => {
    expect(accentPalette('light', { type: 'hue', hue: 200 })).toEqual(meadowPalette('light', 200));
    expect(accentTokens('dark', { type: 'hue', hue: 200 })).toEqual(meadowTokens('dark', 200));
  });
});

describe('accentFromHex', () => {
  it('turns a colour into a hue', () => {
    expect(accentFromHex('#0000FF')).toEqual({ type: 'hue', hue: 240 });
    expect(accentFromHex('FF0000')).toEqual({ type: 'hue', hue: 0 });
  });
  it('turns a grey into a shade by how light it is', () => {
    expect(accentFromHex('#000000')).toEqual({ type: 'shade', shade: 'black' });
    expect(accentFromHex('#111')).toEqual({ type: 'shade', shade: 'black' });
    expect(accentFromHex('#808080')).toEqual({ type: 'shade', shade: 'grey' });
    expect(accentFromHex('#B0B0B0')).toEqual({ type: 'shade', shade: 'grey' });
    expect(accentFromHex('#FFFFFF')).toEqual({ type: 'shade', shade: 'white' });
    expect(accentFromHex('#f5f5f5')).toEqual({ type: 'shade', shade: 'white' });
  });
  it('is null for anything that is not a colour code', () => {
    expect(accentFromHex('banana')).toBeNull();
    expect(accentFromHex('')).toBeNull();
    expect(accentFromHex('#12')).toBeNull();
  });
  it('names accents', () => {
    expect(accentName({ type: 'shade', shade: 'black' })).toBe('black');
    expect(accentName({ type: 'hue', hue: 220 })).toBe('blue');
  });
});
