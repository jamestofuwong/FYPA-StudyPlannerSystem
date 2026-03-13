export {};

declare global {
  interface Window {
    themeAPI: {
      getSystemTheme: () => Promise<"light" | "dark">;
      onThemeChange: (callback: (theme: "light" | "dark") => void) => void;
    };
  }
}