# web/styles: the two designs

The UI has two designs from one set of components.

| Design | User name | Code id | Files |
|---|---|---|---|
| Classic | Classic | `classic` | `variables.css` (colour modes: light, dark, portal), `theme.ts` |
| Easy | Easy | `meadow` | `meadow.css`, `meadowHue.ts` (the accent colour and shade) |

The id `meadow` is what is saved in `localStorage` (`designPreference`), so it stays. Other saved keys: `themePreference`, `meadowHue`, `meadowShade`.

## Files

- `themeProvider.tsx`: `ThemeProvider`, `useTheme`, `useDesign`. Applies `data-design` and the colour mode to the page.
- `theme.ts`: the types (`ThemeMode`, `DesignMode`, `ThemeColors`) and the palettes.
- `tokens.ts`: helpers for inline styles. Each returns `var(--token, <classic value>)`, so Classic keeps its exact value and `meadow.css` defines the token for Easy (`fs()`, `radius()`).
- `meadowHue.ts`: derives the Easy palette from one accent hue. `MEADOW_TOKEN_KEYS` lists the tokens that carry the accent.
- `globals.css`: global rules.

## Rules

- A design changes colour, type and layout tokens only. A page behaves the same in both.
- Use `fs()` and `radius()` from `tokens.ts` in inline styles. Use the CSS variable names in CSS modules.
- Classic has sharp corners and small text on purpose. It fits a lot of information on screen.
- A new brand colour token: add it to `MEADOW_TOKEN_KEYS` when it should follow the accent.
- `tests/unit/theme/meadow-hue.test.ts` checks the contrast of all 360 hues.

## Add a design token

1. Define it in `variables.css` (Classic) and `meadow.css` (Easy).
2. If it holds an accent colour, add its key to `MEADOW_TOKEN_KEYS`.
3. Run `npx jest tests/unit/theme tests/ui/design-switch.test.tsx tests/ui/meadow-hue.test.tsx`.
