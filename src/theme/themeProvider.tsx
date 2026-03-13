"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { themes } from "./theme";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  theme: typeof themes.light;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {

  const [mode, setMode] = useState<ThemeMode>("light");

  const applyTheme = (theme: ThemeMode) => {
    const root = document.documentElement;
    root.dataset.theme = theme;

    const palette = themes[theme];
    root.style.setProperty("--color-background", palette.background);
    root.style.setProperty("--color-surface", palette.surface);
    root.style.setProperty("--color-primary", palette.primary);
    root.style.setProperty("--color-secondary", palette.secondary);
    root.style.setProperty("--color-text", palette.text);
    root.style.setProperty("--color-border", palette.border);

    document.body.style.background = palette.background;
    document.body.style.color = palette.text;
  };

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    let cleanup = () => {
      // no-op default
    };

    const initTheme = async () => {
      let theme: ThemeMode = "light";

      if (typeof window !== "undefined" && typeof window.themeAPI === "object" && typeof window.themeAPI.getSystemTheme === "function") {
        try {
          theme = (await window.themeAPI.getSystemTheme()) as ThemeMode;
        } catch {
          // fallback below
        }
      }

      if (theme !== "light" && theme !== "dark") {
        theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }

      setMode(theme);

      if (typeof window !== "undefined" && typeof window.themeAPI === "object" && typeof window.themeAPI.onThemeChange === "function") {
        cleanup = () => {
          // no explicit off API in this sample. Keep minimal.
        };
        window.themeAPI.onThemeChange((next: ThemeMode) => {
          setMode(next);
        });
      } else if (window.matchMedia) {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (event: MediaQueryListEvent) => setMode(event.matches ? "dark" : "light");
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
        mode,
        theme: themes[mode]
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