export type ThemeMode = "light" | "dark" | "portal";

interface ThemeColors {
  // Backgrounds
  topbarBg: string;
  topbarBorder: string;
  tabbarBg: string;
  tabbarBorder: string;
  sidebarBg: string;
  sidebarSearchBg: string;
  sidebarBorder: string;
  mainBg: string;
  panelBg: string;
  panelBorder: string;
  cardBg: string;
  cardHover: string;
  surfaceBg: string;

  // Highlight
  activeHighlight: string;
  activeBg: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textLogo: string;

  // Accents
  accentBlue: string;
  accentGreen: string;
  accentYellow: string;
  accentOrange: string;
  accentPurple: string;
  accentRed: string;

  // Status bar
  statusbarBg: string;

  // Misc
  rowAlt: string;
  scrollbarThumb: string;
  scrollbarTrack: string;

  // Button
  buttonBg: string;
  btnSecondaryBg: string;

}

export const themes: Record<ThemeMode, ThemeColors> = {
  light: {
    sidebarBg: "#F3F3F3",
    sidebarSearchBg: "#E0E0E0",
    sidebarBorder: "#E0E0E0",
    topbarBg: "#FFFFFF",
    topbarBorder: "#E0E0E0",
    tabbarBg: "#FFFFFF",
    tabbarBorder: "#E0E0E0",
    mainBg: "#FFFFFF",
    panelBg: "#F9F9F9",
    panelBorder: "#E5E5E5",
    cardBg: "#FFFFFF",
    cardHover: "#F5F5F5",
    surfaceBg: "#E0E0E0",

    activeHighlight: "#0078D4",
    activeBg: "rgba(0, 120, 212, 0.1)",

    textPrimary: "#333333",
    textSecondary: "#0078D4",
    textMuted: "#666666",
    textLogo: "#666666",

    accentBlue: "#0078D4",
    accentGreen: "#107C10",
    accentYellow: "#FFB900",
    accentOrange: "#FF8C00",
    accentPurple: "#8764B8",
    accentRed: "#E81123",

    statusbarBg: "#0078D4",

    rowAlt: "#F5F5F5",
    scrollbarThumb: "#C0C0C0",
    scrollbarTrack: "#F0F0F0",

    buttonBg: "#E0E0E0",
    btnSecondaryBg: "#F0F0F0",
  },

  dark: {
    sidebarBg: "#1e1e1e",
    sidebarSearchBg: "#2d2d30",
    sidebarBorder: "#2d2d2d",
    topbarBg: "#252526",
    topbarBorder: "#3e3e42",
    tabbarBg: "#252526",
    tabbarBorder: "#3e3e42",
    mainBg: "#252526",
    panelBg: "#2d2d30",
    panelBorder: "#3e3e42",
    cardBg: "#333337",
    cardHover: "#3a3a3f",
    surfaceBg: "#3e3e42",

    activeHighlight: "#007acc",
    activeBg: "rgba(0, 122, 204, 0.15)",

    textPrimary: "#cccccc",
    textSecondary: "#9cdcfe",
    textMuted: "#cccccc",
    textLogo: "#ffffff",

    accentBlue: "#569cd6",
    accentGreen: "#4ec9b0",
    accentYellow: "#dcdcaa",
    accentOrange: "#ce9178",
    accentPurple: "#c586c0",
    accentRed: "#f48771",

    statusbarBg: "#007acc",

    rowAlt: "#2a2a2d",
    scrollbarThumb: "#424242",
    scrollbarTrack: "#1e1e1e",

    buttonBg: "#3e3e42",
    btnSecondaryBg: "#2d2d30",
  },

  portal: {
    sidebarBg: "#2b2623",
    sidebarSearchBg: "#3a3431",
    sidebarBorder: "#4a4440",

    topbarBg: "#f7f7f7",
    topbarBorder: "#d6d6d6",

    tabbarBg: "#efefef",
    tabbarBorder: "#d0d0d0",

    mainBg: "#f3f3f3",

    panelBg: "#ffffff",
    panelBorder: "#d9d9d9",

    cardBg: "#ffffff",
    cardHover: "#f5f5f5",

    surfaceBg: "#fafafa",

    activeHighlight: "#6fa3c8",
    activeBg: "#e6eef5",

    textPrimary: "#2e2e2e",
    textSecondary: "#5a5a5a",
    textMuted: "#8a8a8a",
    textLogo: "#ffffff",

    accentBlue: "#6fa3c8",
    accentGreen: "#6fbf73",
    accentYellow: "#e6c15a",
    accentOrange: "#e08a4e",
    accentPurple: "#9a7fd1",
    accentRed: "#d96b6b",

    statusbarBg: "#2b2623",

    rowAlt: "#f7f7f7",

    scrollbarThumb: "#c2c2c2",
    scrollbarTrack: "#eeeeee",

    buttonBg: "#6fa3c8",
    btnSecondaryBg: "#e0e0e0",
  },
};

