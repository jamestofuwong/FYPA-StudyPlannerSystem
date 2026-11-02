export type ThemeMode = "light" | "dark";

// The overall look: "classic" is the original compact editor-style design,
// "meadow" is the calmer, roomier design, shown to people as "Easy" (the id is
// kept because it is what is saved in settings). A design only changes colour,
// type and layout tokens; every page behaves the same in both.
export type DesignMode = "classic" | "meadow";

export interface ThemeColors {
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

};

// Meadow has its own light and dark ("night") palettes.
export const meadowThemes: Record<"light" | "dark", ThemeColors> = {
  light: {
    sidebarBg: "#FFFFFF",
    sidebarSearchBg: "#F4F6F1",
    sidebarBorder: "#DCE3DA",
    topbarBg: "#FFFFFF",
    topbarBorder: "#DCE3DA",
    tabbarBg: "#F4F6F1",
    tabbarBorder: "#DCE3DA",
    mainBg: "#F4F6F1",
    panelBg: "#FFFFFF",
    panelBorder: "#DCE3DA",
    cardBg: "#FFFFFF",
    cardHover: "#F4F6F1",
    surfaceBg: "#ECEFEA",

    activeHighlight: "#2D6A4F",
    activeBg: "#E4F1E9",

    textPrimary: "#1E2A24",
    textSecondary: "#1F5139",
    textMuted: "#55635A",
    textLogo: "#1E2A24",

    accentBlue: "#2459A8",
    accentGreen: "#2D6A4F",
    accentYellow: "#8A6100",
    accentOrange: "#9A4A0C",
    accentPurple: "#5B4B8A",
    accentRed: "#B42318",

    statusbarBg: "#2D6A4F",

    rowAlt: "#F8FAF7",
    scrollbarThumb: "#C3CEC1",
    scrollbarTrack: "#F4F6F1",

    buttonBg: "#ECEFEA",
    btnSecondaryBg: "#FFFFFF",
  },

  dark: {
    sidebarBg: "#16201A",
    sidebarSearchBg: "#1B271F",
    sidebarBorder: "#2C3A31",
    topbarBg: "#16201A",
    topbarBorder: "#2C3A31",
    tabbarBg: "#111A15",
    tabbarBorder: "#2C3A31",
    mainBg: "#111A15",
    panelBg: "#19241D",
    panelBorder: "#2C3A31",
    cardBg: "#19241D",
    cardHover: "#223028",
    surfaceBg: "#2A382F",

    activeHighlight: "#7FD1A8",
    activeBg: "rgba(127, 209, 168, 0.14)",

    textPrimary: "#E5ECE7",
    textSecondary: "#A8DDBF",
    textMuted: "#A7B6AC",
    textLogo: "#E5ECE7",

    accentBlue: "#8DB4F0",
    accentGreen: "#7FD1A8",
    accentYellow: "#E8C66A",
    accentOrange: "#F2A877",
    accentPurple: "#B9A8E8",
    accentRed: "#F28B82",

    statusbarBg: "#1F5139",

    rowAlt: "#16201A",
    scrollbarThumb: "#3A4A40",
    scrollbarTrack: "#111A15",

    buttonBg: "#2A382F",
    btnSecondaryBg: "#19241D",
  },
};

export function paletteFor(design: DesignMode, mode: ThemeMode): ThemeColors {
  if (design === "meadow") return meadowThemes[mode];
  return themes[mode];
}
