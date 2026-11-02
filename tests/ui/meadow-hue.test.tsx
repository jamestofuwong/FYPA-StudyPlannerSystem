/** @jest-environment jsdom */
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/styles/themeProvider';
import HueWheel from '@/components/common/HueWheel';
import {
  DEFAULT_MEADOW_HUE, MEADOW_TOKEN_KEYS, accentPalette, accentTokens, meadowPalette, meadowTokens, type MeadowShade,
} from '@/styles/meadowHue';
import { meadowThemes, themes } from '@/styles/theme';

const root = () => document.documentElement;
const prop = (name: string) => root().style.getPropertyValue(name);

function Probe() {
  const { meadowHue, setMeadowHue, meadowShade, setMeadowShade, design, setDesign } = useTheme();
  return (
    <div>
      <span data-testid="hue">{meadowHue}</span>
      <span data-testid="shade">{meadowShade ?? 'none'}</span>
      <button onClick={() => setMeadowShade('black')}>black</button>
      <button onClick={() => setMeadowShade('white')}>white</button>
      <button onClick={() => setMeadowShade('grey')}>grey</button>
      <button onClick={() => setMeadowShade(null)}>no shade</button>
      <span data-testid="design">{design}</span>
      <button onClick={() => setMeadowHue(220)}>blue</button>
      <button onClick={() => setMeadowHue(-40)}>wrap</button>
      <button onClick={() => setMeadowHue(null)}>reset</button>
      <button onClick={() => setDesign('classic')}>classic</button>
      <button onClick={() => setDesign('meadow')}>meadow</button>
    </div>
  );
}

async function renderProvider(storage: Record<string, string> = {}) {
  localStorage.clear();
  localStorage.setItem('themePreference', 'light');
  localStorage.setItem('designPreference', 'meadow');
  for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  const view = render(<ThemeProvider><Probe /></ThemeProvider>);
  await act(async () => {});
  return view;
}

describe('Meadow accent hue in the theme provider', () => {
  test('starts as the original green, with no overrides', async () => {
    await renderProvider();
    expect(screen.getByTestId('hue').textContent).toBe(String(DEFAULT_MEADOW_HUE));
    expect(prop('--active-highlight')).toBe(meadowThemes.light.activeHighlight);
    for (const key of MEADOW_TOKEN_KEYS) expect(prop(key)).toBe('');
  });

  test('a chosen hue re-tints the palette and the stylesheet tokens, and is remembered', async () => {
    await renderProvider();
    fireEvent.click(screen.getByText('blue'));
    const expected = meadowPalette('light', 220);
    expect(prop('--active-highlight')).toBe(expected.activeHighlight);
    expect(prop('--main-bg')).toBe(expected.mainBg);
    expect(prop('--panel-border')).toBe(expected.panelBorder);
    const tokens = meadowTokens('light', 220);
    for (const [key, value] of Object.entries(tokens)) expect(prop(key)).toBe(value);
    expect(prop('--tint-highlight')).toMatch(/^\d+, \d+, \d+$/);
    expect(localStorage.getItem('meadowHue')).toBe('220');
    expect(document.body.style.background).not.toBe('');
  });

  test('status colours do not change with the hue', async () => {
    await renderProvider();
    fireEvent.click(screen.getByText('blue'));
    expect(prop('--accent-red').toLowerCase()).toBe(meadowThemes.light.accentRed.toLowerCase());
    expect(prop('--accent-green').toLowerCase()).toBe(meadowThemes.light.accentGreen.toLowerCase());
  });

  test('going back to the original green clears everything', async () => {
    await renderProvider();
    fireEvent.click(screen.getByText('blue'));
    fireEvent.click(screen.getByText('reset'));
    expect(prop('--active-highlight')).toBe(meadowThemes.light.activeHighlight);
    for (const key of MEADOW_TOKEN_KEYS) expect(prop(key)).toBe('');
    expect(localStorage.getItem('meadowHue')).toBeNull();
    expect(screen.getByTestId('hue').textContent).toBe(String(DEFAULT_MEADOW_HUE));
  });

  test('a hue is wrapped into range', async () => {
    await renderProvider();
    fireEvent.click(screen.getByText('wrap'));
    expect(screen.getByTestId('hue').textContent).toBe('320');
    expect(localStorage.getItem('meadowHue')).toBe('320');
  });

  test('is restored from the last visit', async () => {
    await renderProvider({ meadowHue: '280' });
    expect(screen.getByTestId('hue').textContent).toBe('280');
    expect(prop('--active-highlight')).toBe(meadowPalette('light', 280).activeHighlight);
  });

  test.each(['abc', '', 'NaN'])('ignores a stored value of "%s"', async (stored) => {
    await renderProvider({ meadowHue: stored });
    expect(screen.getByTestId('hue').textContent).toBe(String(DEFAULT_MEADOW_HUE));
    expect(prop('--active-highlight')).toBe(meadowThemes.light.activeHighlight);
  });

  test('follows the dark colour mode', async () => {
    await renderProvider({ themePreference: 'dark', meadowHue: '30' });
    expect(prop('--active-highlight')).toBe(meadowPalette('dark', 30).activeHighlight);
    expect(prop('--on-accent')).toBe(meadowTokens('dark', 30)['--on-accent']);
  });

  describe('shades', () => {
    test('a shade re-tints the palette and the stylesheet tokens, and is remembered', async () => {
      await renderProvider();
      fireEvent.click(screen.getByText('black'));
      const expected = accentPalette('light', { type: 'shade', shade: 'black' });
      expect(prop('--active-highlight')).toBe(expected.activeHighlight);
      expect(prop('--main-bg')).toBe(expected.mainBg);
      for (const [key, value] of Object.entries(accentTokens('light', { type: 'shade', shade: 'black' }))) expect(prop(key)).toBe(value);
      expect(screen.getByTestId('shade').textContent).toBe('black');
      expect(localStorage.getItem('meadowShade')).toBe('black');
    });

    test('choosing a shade replaces a hue, and choosing a hue replaces a shade', async () => {
      await renderProvider({ meadowHue: '220' });
      fireEvent.click(screen.getByText('white'));
      expect(localStorage.getItem('meadowHue')).toBeNull();
      expect(localStorage.getItem('meadowShade')).toBe('white');
      expect(screen.getByTestId('hue').textContent).toBe(String(DEFAULT_MEADOW_HUE));
      fireEvent.click(screen.getByText('blue'));
      expect(localStorage.getItem('meadowShade')).toBeNull();
      expect(localStorage.getItem('meadowHue')).toBe('220');
      expect(screen.getByTestId('shade').textContent).toBe('none');
      expect(prop('--active-highlight')).toBe(meadowPalette('light', 220).activeHighlight);
    });

    test('the status colours do not change with a shade either', async () => {
      await renderProvider();
      fireEvent.click(screen.getByText('grey'));
      expect(prop('--accent-red').toLowerCase()).toBe(meadowThemes.light.accentRed.toLowerCase());
    });

    test('going back to the original green clears a shade', async () => {
      await renderProvider();
      fireEvent.click(screen.getByText('black'));
      fireEvent.click(screen.getByText('reset'));
      expect(prop('--active-highlight')).toBe(meadowThemes.light.activeHighlight);
      for (const key of MEADOW_TOKEN_KEYS) expect(prop(key)).toBe('');
      expect(localStorage.getItem('meadowShade')).toBeNull();
      expect(screen.getByTestId('shade').textContent).toBe('none');
    });

    test('clearing the shade goes back to the original green', async () => {
      await renderProvider({ meadowShade: 'grey' });
      fireEvent.click(screen.getByText('no shade'));
      expect(prop('--active-highlight')).toBe(meadowThemes.light.activeHighlight);
      expect(localStorage.getItem('meadowShade')).toBeNull();
    });

    test('is restored from the last visit, and wins over a stored hue', async () => {
      await renderProvider({ meadowShade: 'black', meadowHue: '220' });
      expect(screen.getByTestId('shade').textContent).toBe('black');
      expect(prop('--active-highlight')).toBe(accentPalette('light', { type: 'shade', shade: 'black' }).activeHighlight);
    });

    test.each(['', 'gray', 'purple', 'WHITE'])('ignores a stored shade of "%s"', async (stored) => {
      await renderProvider({ meadowShade: stored });
      expect(screen.getByTestId('shade').textContent).toBe('none');
      expect(prop('--active-highlight')).toBe(meadowThemes.light.activeHighlight);
    });

    test('follows the dark colour mode', async () => {
      await renderProvider({ themePreference: 'dark', meadowShade: 'black' });
      expect(prop('--active-highlight')).toBe(accentPalette('dark', { type: 'shade', shade: 'black' }).activeHighlight);
      expect(prop('--on-accent')).toBe(accentTokens('dark', { type: 'shade', shade: 'black' })['--on-accent']);
      expect(prop('--main-bg')).toBe(accentPalette('dark', { type: 'shade', shade: 'black' }).mainBg);
    });

    test('the classic design never takes a shade, and it is still there when Meadow returns', async () => {
      await renderProvider({ meadowShade: 'black' });
      fireEvent.click(screen.getByText('classic'));
      expect(prop('--active-highlight')).toBe(themes.light.activeHighlight);
      for (const key of MEADOW_TOKEN_KEYS) expect(prop(key)).toBe('');
      fireEvent.click(screen.getByText('meadow'));
      expect(prop('--active-highlight')).toBe(accentPalette('light', { type: 'shade', shade: 'black' }).activeHighlight);
    });
  });

  test('the classic design never takes the hue', async () => {
    await renderProvider({ meadowHue: '220' });
    fireEvent.click(screen.getByText('classic'));
    expect(prop('--active-highlight')).toBe(themes.light.activeHighlight);
    for (const key of MEADOW_TOKEN_KEYS) expect(prop(key)).toBe('');
    // ...and the choice is still there when Meadow comes back
    fireEvent.click(screen.getByText('meadow'));
    expect(prop('--active-highlight')).toBe(meadowPalette('light', 220).activeHighlight);
    expect(screen.getByTestId('hue').textContent).toBe('220');
  });
});

// jsdom has no PointerEvent, so a mouse event of the pointer type carries the coordinates instead
const pointer = (el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x = 0, y = 0) =>
  fireEvent(el, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
const RECT = { left: 0, top: 0, width: 196, height: 196, right: 196, bottom: 196, x: 0, y: 0, toJSON: () => ({}) };

describe('HueWheel', () => {
  function Harness({ start = DEFAULT_MEADOW_HUE, startShade = null }: { start?: number; startShade?: MeadowShade | null }) {
    const [hue, setHue] = useState(start);
    const [shade, setShade] = useState<MeadowShade | null>(startShade);
    return (
      <HueWheel
        hue={hue}
        onChange={(h) => { setShade(null); setHue(h); }}
        shade={shade}
        onShade={setShade}
        onReset={() => { setShade(null); setHue(DEFAULT_MEADOW_HUE); }}
        accent={accentPalette('light', shade ? { type: 'shade', shade } : { type: 'hue', hue }).activeHighlight}
      />
    );
  }
  const wheel = () => screen.getByRole('slider', { name: 'Accent colour hue' });
  const code = () => screen.getByLabelText('Colour code') as HTMLInputElement;

  test('exposes the hue to assistive technology', () => {
    render(<Harness start={220} />);
    expect(wheel().getAttribute('aria-valuenow')).toBe('220');
    expect(wheel().getAttribute('aria-valuemin')).toBe('0');
    expect(wheel().getAttribute('aria-valuemax')).toBe('359');
    expect(wheel().getAttribute('aria-valuetext')).toMatch(/blue/);
  });

  test('arrow keys turn it a degree, with Shift ten, and wrap around', () => {
    render(<Harness start={0} />);
    fireEvent.keyDown(wheel(), { key: 'ArrowRight' });
    expect(wheel().getAttribute('aria-valuenow')).toBe('1');
    fireEvent.keyDown(wheel(), { key: 'ArrowRight', shiftKey: true });
    expect(wheel().getAttribute('aria-valuenow')).toBe('11');
    fireEvent.keyDown(wheel(), { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(wheel(), { key: 'ArrowLeft' });
    fireEvent.keyDown(wheel(), { key: 'ArrowLeft' });
    expect(wheel().getAttribute('aria-valuenow')).toBe('359');
    fireEvent.keyDown(wheel(), { key: 'PageUp' });
    expect(wheel().getAttribute('aria-valuenow')).toBe('14');
  });

  test('Home goes back to the original green', () => {
    render(<Harness start={90} />);
    fireEvent.keyDown(wheel(), { key: 'Home' });
    expect(wheel().getAttribute('aria-valuenow')).toBe(String(DEFAULT_MEADOW_HUE));
  });

  test('clicking the ring picks the hue under the pointer (0 is the top, turning clockwise)', () => {
    render(<Harness />);
    const el = wheel();
    el.getBoundingClientRect = () => RECT;
    const at = (x: number, y: number) => pointer(el, 'pointerdown', x, y);
    at(98, 98 - 80);   // straight up
    expect(el.getAttribute('aria-valuenow')).toBe('0');
    at(98 + 80, 98);   // right
    expect(el.getAttribute('aria-valuenow')).toBe('90');
    at(98, 98 + 80);   // down
    expect(el.getAttribute('aria-valuenow')).toBe('180');
    at(98 - 80, 98);   // left
    expect(el.getAttribute('aria-valuenow')).toBe('270');
  });

  test('dragging follows the pointer, and stops when it is released', () => {
    render(<Harness />);
    const el = wheel();
    el.getBoundingClientRect = () => RECT;
    pointer(el, 'pointerdown', 98, 18);
    pointer(el, 'pointermove', 178, 98);
    expect(el.getAttribute('aria-valuenow')).toBe('90');
    pointer(el, 'pointerup');
    pointer(el, 'pointermove', 98, 178);
    expect(el.getAttribute('aria-valuenow')).toBe('90');
  });

  test('pressing the middle of the wheel does nothing', () => {
    render(<Harness start={50} />);
    const el = wheel();
    el.getBoundingClientRect = () => RECT;
    pointer(el, 'pointerdown', 98, 98);
    expect(el.getAttribute('aria-valuenow')).toBe('50');
    // and an event with no position at all is ignored rather than guessed at
    fireEvent(el, new Event('pointerdown', { bubbles: true }));
    expect(el.getAttribute('aria-valuenow')).toBe('50');
  });

  test('a ready-made colour sets the hue and is marked as chosen', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Ocean blue' }));
    expect(wheel().getAttribute('aria-valuenow')).toBe('214');
    expect(screen.getByRole('button', { name: 'Ocean blue' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Original green' }).getAttribute('aria-pressed')).toBe('false');
  });

  test('typing a colour code takes its hue', () => {
    render(<Harness />);
    fireEvent.focus(code());
    fireEvent.change(code(), { target: { value: '#2459A8' } });
    fireEvent.keyDown(code(), { key: 'Enter' });
    const hue = Number(wheel().getAttribute('aria-valuenow'));
    expect(hue).toBeGreaterThan(205);
    expect(hue).toBeLessThan(225);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a code without the # works too, and takes effect when leaving the box', () => {
    render(<Harness />);
    fireEvent.focus(code());
    fireEvent.change(code(), { target: { value: 'FF0000' } });
    fireEvent.blur(code());
    expect(wheel().getAttribute('aria-valuenow')).toBe('0');
  });

  test('something that is not a colour is refused with a message', () => {
    render(<Harness start={90} />);
    fireEvent.focus(code());
    fireEvent.change(code(), { target: { value: 'banana' } });
    fireEvent.blur(code());
    expect(screen.getByRole('alert').textContent).toMatch(/colour code/);
    expect(wheel().getAttribute('aria-valuenow')).toBe('90');
  });

  test.each([
    ['#808080', 'Grey'], ['#B0B0B0', 'Grey'], ['#000000', 'Black'], ['#0A0A0A', 'Black'], ['#FFFFFF', 'White'], ['#F5F5F5', 'White'],
  ])('a grey, black or white code (%s) picks the %s shade', (value, name) => {
    render(<Harness start={90} />);
    fireEvent.focus(code());
    fireEvent.change(code(), { target: { value } });
    fireEvent.blur(code());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-pressed')).toBe('true');
  });

  test('the code box shows the colour the design is actually using', () => {
    render(<Harness start={220} />);
    expect(code().value).toBe(meadowPalette('light', 220).activeHighlight.toUpperCase());
    fireEvent.keyDown(wheel(), { key: 'ArrowRight', shiftKey: true });
    expect(code().value).toBe(meadowPalette('light', 230).activeHighlight.toUpperCase());
  });

  test('Use the original green resets, and is disabled when already green', () => {
    render(<Harness start={220} />);
    const reset = screen.getByRole('button', { name: 'Use the original green' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(wheel().getAttribute('aria-valuenow')).toBe(String(DEFAULT_MEADOW_HUE));
    expect(reset.disabled).toBe(true);
  });

  describe('shades', () => {
    const shadeButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

    test('there are three, none chosen to begin with', () => {
      render(<Harness />);
      for (const name of ['Grey', 'Black', 'White']) expect(shadeButton(name).getAttribute('aria-pressed')).toBe('false');
    });

    test('choosing one marks it and says so on the wheel', () => {
      render(<Harness />);
      fireEvent.click(shadeButton('Black'));
      expect(shadeButton('Black').getAttribute('aria-pressed')).toBe('true');
      expect(shadeButton('Grey').getAttribute('aria-pressed')).toBe('false');
      expect(wheel().getAttribute('aria-valuetext')).toMatch(/black, no colour/);
    });

    test('the ready-made colours stop looking chosen while a shade is', () => {
      render(<Harness start={DEFAULT_MEADOW_HUE} />);
      expect(screen.getByRole('button', { name: 'Original green' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(shadeButton('White'));
      expect(screen.getByRole('button', { name: 'Original green' }).getAttribute('aria-pressed')).toBe('false');
    });

    test('turning the wheel goes back to a colour', () => {
      render(<Harness startShade="grey" />);
      fireEvent.keyDown(wheel(), { key: 'ArrowRight' });
      expect(shadeButton('Grey').getAttribute('aria-pressed')).toBe('false');
      expect(wheel().getAttribute('aria-valuetext')).toMatch(/hue/);
    });

    test('picking a ready-made colour goes back to a colour', () => {
      render(<Harness startShade="black" />);
      fireEvent.click(screen.getByRole('button', { name: 'Violet' }));
      expect(shadeButton('Black').getAttribute('aria-pressed')).toBe('false');
      expect(wheel().getAttribute('aria-valuenow')).toBe('264');
    });

    test('the code box shows the shade’s own highlight', () => {
      render(<Harness />);
      fireEvent.click(shadeButton('Black'));
      expect(code().value).toBe(accentPalette('light', { type: 'shade', shade: 'black' }).activeHighlight.toUpperCase());
    });

    test('Use the original green is available for a shade and clears it', () => {
      render(<Harness startShade="grey" start={DEFAULT_MEADOW_HUE} />);
      const reset = screen.getByRole('button', { name: 'Use the original green' }) as HTMLButtonElement;
      expect(reset.disabled).toBe(false);
      fireEvent.click(reset);
      expect(shadeButton('Grey').getAttribute('aria-pressed')).toBe('false');
      expect(reset.disabled).toBe(true);
    });

    test('something that is not a colour is still refused', () => {
      render(<Harness startShade="grey" />);
      fireEvent.focus(code());
      fireEvent.change(code(), { target: { value: 'banana' } });
      fireEvent.blur(code());
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(shadeButton('Grey').getAttribute('aria-pressed')).toBe('true');
    });
  });
});
