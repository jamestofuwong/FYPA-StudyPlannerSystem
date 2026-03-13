export type ThemeMode = "light" | "dark";

interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  border: string;
}

export const themes: Record<ThemeMode, ThemeColors> = {
  light: {
    background: "#F9FAFB",
    surface: "#FFFFFF",
    primary: "#4F46E5",
    secondary: "#6366F1",
    text: "#111827",
    border: "#E5E7EB"
  },

  dark: {
    background: "#111827",
    surface: "#1F2937",
    primary: "#6366F1",
    secondary: "#818CF8",
    text: "#F9FAFB",
    border: "#374151"
  }
};