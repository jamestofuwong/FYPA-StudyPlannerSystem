"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { paletteFor, type DesignMode, type ThemeColors } from "./theme";
import {
  DEFAULT_ACCENT, DEFAULT_MEADOW_HUE, MEADOW_TOKEN_KEYS, accentPalette, accentTokens, isMeadowShade, normalizeHue,
  type MeadowAccent, type MeadowShade,
} from "./meadowHue";

type ThemeMode = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";
export type { DesignMode };

interface ThemeContextType {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  design: DesignMode;
  setDesign: (d: DesignMode) => void;
  /** The hue (0 to 359) Meadow is tinted with. The original green unless the user picked another. */
  meadowHue: number;
  /** Tints Meadow with a hue; null goes back to the original green. Replaces any shade. */
  setMeadowHue: (hue: number | null) => void;
  /** The shade (grey, black or white) Meadow uses instead of a colour, or null when it is using a hue. */
  meadowShade: MeadowShade | null;
  /** Gives Meadow a shade instead of a colour; null goes back to the original green. Replaces any hue. */
  setMeadowShade: (shade: MeadowShade | null) => void;
  /** What Meadow is tinted with right now, whichever kind it is. */
  meadowAccent: MeadowAccent;
  theme: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "themePreference";
const DESIGN_STORAGE_KEY = "designPreference";
const HUE_STORAGE_KEY = "meadowHue";

const SHADE_STORAGE_KEY = "meadowShade";

/** The palette for a design in a colour mode, with Meadow tinted by its accent (null is the original green). */
function paletteWithAccent(design: DesignMode, mode: ThemeMode, accent: MeadowAccent | null): ThemeColors {
  return design === "meadow"
    ? accentPalette(mode === "dark" ? "dark" : "light", accent ?? DEFAULT_ACCENT)
    : paletteFor(design, mode);
}

function readStoredHue(): number | null {
  try {
    const raw = localStorage.getItem(HUE_STORAGE_KEY);
    if (raw === null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? normalizeHue(n) : null;
  } catch {
    return null;
  }
}

function readStoredShade(): MeadowShade | null {
  try {
    const raw = localStorage.getItem(SHADE_STORAGE_KEY);
    return isMeadowShade(raw) ? raw : null;
  } catch {
    return null;
  }
}

function accentOf(hue: number | null, shade: MeadowShade | null): MeadowAccent | null {
  if (shade) return { type: "shade", shade };
  return hue === null ? null : { type: "hue", hue };
}

async function detectSystemTheme(): Promise<ThemeMode> {
  if (
    typeof window !== "undefined" &&
    typeof window.themeAPI === "object" &&
    typeof window.themeAPI.getSystemTheme === "function"
  ) {
    try {
      const t = await window.themeAPI.getSystemTheme();
      if (t === "light" || t === "dark") return t;
    } catch {}
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [design, setDesignState] = useState<DesignMode>("classic");
  const [meadowHue, setMeadowHueState] = useState<number | null>(null);
  const [meadowShade, setMeadowShadeState] = useState<MeadowShade | null>(null);
  const preferenceRef = useRef<ThemePreference>("system");

  const applyTheme = (theme: ThemeMode, activeDesign: DesignMode, accent: MeadowAccent | null) => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // Meadow's type, spacing and shape tokens hang off this attribute (styles/meadow.css).
    root.dataset.design = activeDesign;

    const palette = paletteWithAccent(activeDesign, theme, accent);

    root.style.setProperty("--sidebar-bg", palette.sidebarBg);
    root.style.setProperty("--sidebar-search-bg", palette.sidebarSearchBg);
    root.style.setProperty("--sidebar-border", palette.sidebarBorder);
    root.style.setProperty("--topbar-bg", palette.topbarBg);
    root.style.setProperty("--topbar-border", palette.topbarBorder);
    root.style.setProperty("--tabbar-bg", palette.tabbarBg);
    root.style.setProperty("--tabbar-border", palette.tabbarBorder);
    root.style.setProperty("--main-bg", palette.mainBg);
    root.style.setProperty("--panel-bg", palette.panelBg);
    root.style.setProperty("--panel-border", palette.panelBorder);
    root.style.setProperty("--card-bg", palette.cardBg);
    root.style.setProperty("--card-hover", palette.cardHover);
    root.style.setProperty("--surface-bg", palette.surfaceBg);

    root.style.setProperty("--active-highlight", palette.activeHighlight);
    root.style.setProperty("--active-bg", palette.activeBg);

    root.style.setProperty("--text-primary", palette.textPrimary);
    root.style.setProperty("--text-secondary", palette.textSecondary);
    root.style.setProperty("--text-muted", palette.textMuted);
    root.style.setProperty("--text-logo", palette.textLogo);

    root.style.setProperty("--accent-blue", palette.accentBlue);
    root.style.setProperty("--accent-green", palette.accentGreen);
    root.style.setProperty("--accent-yellow", palette.accentYellow);
    root.style.setProperty("--accent-orange", palette.accentOrange);
    root.style.setProperty("--accent-purple", palette.accentPurple);
    root.style.setProperty("--accent-red", palette.accentRed);

    root.style.setProperty("--statusbar-bg", palette.statusbarBg);

    root.style.setProperty("--row-alt", palette.rowAlt);
    root.style.setProperty("--scrollbar-thumb", palette.scrollbarThumb);
    root.style.setProperty("--scrollbar-track", palette.scrollbarTrack);

    root.style.setProperty("--button-bg", palette.buttonBg);
    root.style.setProperty("--btn-secondary-bg", palette.btnSecondaryBg);

    // Meadow's stylesheet holds a few brand greens of its own (hover, overlays, shadows). They follow a custom
    // hue through inline overrides, which are removed again for the original green and for the classic design.
    for (const key of MEADOW_TOKEN_KEYS) root.style.removeProperty(key);
    if (activeDesign === "meadow") {
      for (const [key, value] of Object.entries(accentTokens(theme === "dark" ? "dark" : "light", accent ?? DEFAULT_ACCENT))) {
        root.style.setProperty(key, value);
      }
    }

    document.body.style.background = palette.mainBg;
    document.body.style.color = palette.textPrimary;
  };

  useEffect(() => {
    applyTheme(mode, design, accentOf(meadowHue, meadowShade));
  }, [mode, design, meadowHue, meadowShade]);

  const setDesign = (d: DesignMode) => {
    setDesignState(d);
    localStorage.setItem(DESIGN_STORAGE_KEY, d);
  };

  // A hue and a shade are alternatives: choosing one clears the other, and null goes back to the original green.
  const setMeadowHue = (hue: number | null) => {
    setMeadowShadeState(null);
    try { localStorage.removeItem(SHADE_STORAGE_KEY); } catch {}
    if (hue === null) {
      setMeadowHueState(null);
      try { localStorage.removeItem(HUE_STORAGE_KEY); } catch {}
      return;
    }
    const next = normalizeHue(hue);
    setMeadowHueState(next);
    try { localStorage.setItem(HUE_STORAGE_KEY, String(next)); } catch {}
  };

  const setMeadowShade = (shade: MeadowShade | null) => {
    setMeadowHueState(null);
    try { localStorage.removeItem(HUE_STORAGE_KEY); } catch {}
    if (shade === null || !isMeadowShade(shade)) {
      setMeadowShadeState(null);
      try { localStorage.removeItem(SHADE_STORAGE_KEY); } catch {}
      return;
    }
    setMeadowShadeState(shade);
    try { localStorage.setItem(SHADE_STORAGE_KEY, shade); } catch {}
  };

  const setPreference = (p: ThemePreference) => {
    preferenceRef.current = p;
    setPreferenceState(p);
    localStorage.setItem(STORAGE_KEY, p);
    if (p !== "system") {
      setMode(p);
    } else {
      void detectSystemTheme().then(setMode);
    }
  };

  useEffect(() => {
    let cleanup = () => {};

    const initTheme = async () => {
      if (localStorage.getItem(DESIGN_STORAGE_KEY) === "meadow") setDesignState("meadow");
      // A shade wins if both are somehow stored
      const storedShade = readStoredShade();
      setMeadowShadeState(storedShade);
      setMeadowHueState(storedShade ? null : readStoredHue());

      const saved = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
      const pref: ThemePreference =
        saved === "light" || saved === "dark" || saved === "system"
          ? saved
          : "system";                   // an unknown value (for example the removed "portal" mode) becomes "system"

      preferenceRef.current = pref;
      setPreferenceState(pref);

      if (pref !== "system") {
        setMode(pref);
        return;
      }

      // pref === 'system' — detect and listen
      const theme = await detectSystemTheme();
      setMode(theme);

      if (
        typeof window !== "undefined" &&
        typeof window.themeAPI === "object" &&
        typeof window.themeAPI.onThemeChange === "function"
      ) {
        window.themeAPI.onThemeChange((next: ThemeMode) => {
          if (preferenceRef.current === "system") setMode(next);
        });
      } else if (window.matchMedia) {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (event: MediaQueryListEvent) => {
          if (preferenceRef.current === "system")
            setMode(event.matches ? "dark" : "light");
        };
        media.addEventListener("change", handler);
        cleanup = () => media.removeEventListener("change", handler);
      }
    };

    void initTheme();

    return () => cleanup();
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        mode, preference, setPreference, design, setDesign,
        meadowHue: meadowHue ?? DEFAULT_MEADOW_HUE, setMeadowHue,
        meadowShade, setMeadowShade,
        meadowAccent: accentOf(meadowHue, meadowShade) ?? DEFAULT_ACCENT,
        theme: paletteWithAccent(design, mode, accentOf(meadowHue, meadowShade)),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be inside ThemeProvider");
  return context;
}

// Layout components read the active design to pick their Meadow markup.
// Outside a ThemeProvider (e.g. a component rendered on its own in a test)
// this falls back to the classic design instead of throwing.
export function useDesign(): DesignMode {
  return useContext(ThemeContext)?.design ?? "classic";
}
