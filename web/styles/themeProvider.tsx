"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { themes } from "./theme";

type ThemeMode = "light" | "dark" | "portal";
export type ThemePreference = "system" | "light" | "dark" | "portal";

interface ThemeContextType {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  theme: typeof themes.light;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "themePreference";

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
  const preferenceRef = useRef<ThemePreference>("system");

  const applyTheme = (theme: ThemeMode) => {
    const root = document.documentElement;
    root.dataset.theme = theme;

    const palette = themes[theme];

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

    document.body.style.background = palette.mainBg;
    document.body.style.color = palette.textPrimary;
  };

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

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
      const saved = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
      const pref: ThemePreference =
        saved === "light" || saved === "dark" || saved === "system" || saved === "portal"
          ? saved
          : "system";

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
      value={{ mode, preference, setPreference, theme: themes[mode] }}
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
