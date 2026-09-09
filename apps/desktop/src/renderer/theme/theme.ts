/**
 * Pine design tokens.
 *
 * Every component reads its visual values from `theme` — never hardcoded:
 *   • `theme.colors`  → colors (light / dark aware)
 *   • `theme.spaces`  → distances & gaps (Tailwind-style numeric scale)
 *   • `theme.radius`  → corner radii
 *   • `theme.font`    → font stacks
 *   • `theme.shadow`  → elevation shadows
 *   • `theme.z`       → z-index layers
 *
 * There are exactly two themes: `dark` (default) and `light`.
 */

export type ThemeName = "dark" | "light";

/* ─────────────────────────────── colors ─────────────────────────────── */

export interface Colors {
  bg: string;
  bgDeep: string;
  surface: string;
  surface2: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  codeBg: string;
  codeHead: string;
  codeText: string;
  scrollbar: string;
}

const darkColors: Colors = {
  bg: "#0b0e16",
  bgDeep: "#0a0c12",
  surface: "rgba(255, 255, 255, 0.045)",
  surface2: "rgba(255, 255, 255, 0.06)",
  surfaceHover: "rgba(255, 255, 255, 0.08)",
  border: "rgba(255, 255, 255, 0.09)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  text: "#f4f6fb",
  textMuted: "#c7cddc",
  textDim: "#8a93a6",
  accent: "#5b6cff",
  accent2: "#8b5cf6",
  accentSoft: "rgba(91, 108, 255, 0.16)",
  accentText: "#ffffff",
  danger: "#f87171",
  dangerSoft: "rgba(248, 113, 113, 0.1)",
  success: "#34d399",
  successSoft: "rgba(52, 211, 153, 0.12)",
  warning: "#fbbf24",
  codeBg: "#0e1117",
  codeHead: "#1c2129",
  codeText: "#e6edf3",
  scrollbar: "rgba(255, 255, 255, 0.14)",
};

const lightColors: Colors = {
  bg: "#ffffff",
  bgDeep: "#f4f6fa",
  surface: "rgba(17, 24, 39, 0.03)",
  surface2: "rgba(17, 24, 39, 0.05)",
  surfaceHover: "rgba(17, 24, 39, 0.08)",
  border: "rgba(17, 24, 39, 0.1)",
  borderStrong: "rgba(17, 24, 39, 0.2)",
  text: "#1a1d24",
  textMuted: "#3f4654",
  textDim: "#6b7280",
  accent: "#4f5df0",
  accent2: "#7c3aed",
  accentSoft: "rgba(79, 93, 240, 0.12)",
  accentText: "#ffffff",
  danger: "#dc2626",
  dangerSoft: "rgba(220, 38, 38, 0.08)",
  success: "#059669",
  successSoft: "rgba(5, 150, 105, 0.1)",
  warning: "#d97706",
  codeBg: "#f8fafc",
  codeHead: "#eef1f5",
  codeText: "#1f2937",
  scrollbar: "rgba(17, 24, 39, 0.2)",
};

/* ─────────────────────────────── spaces ─────────────────────────────── */
/**
 * Tailwind-style spacing scale: `spaces[1]` = 4px, `spaces[4]` = 16px, …
 * Spacing is theme-independent, so both themes share this table.
 */
export type SpaceKey =
  | "0"
  | "0.5"
  | "1"
  | "1.5"
  | "2"
  | "2.5"
  | "3"
  | "3.5"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "10"
  | "12"
  | "16"
  | "20"
  | "24"
  | "32";

const spaces: Record<SpaceKey, string> = {
  "0": "0px",
  "0.5": "2px",
  "1": "4px",
  "1.5": "6px",
  "2": "8px",
  "2.5": "10px",
  "3": "12px",
  "3.5": "14px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "7": "28px",
  "8": "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
  "20": "80px",
  "24": "96px",
  "32": "128px",
};

/* ─────────────────────────────── shared ─────────────────────────────── */

interface Radius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

const radius: Radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "22px",
  full: "999px",
};

interface Font {
  sans: string;
  mono: string;
}

const font: Font = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "JetBrains Mono", "Courier New", monospace',
};

interface Shadow {
  sm: string;
  md: string;
  lg: string;
}

const darkShadow: Shadow = {
  sm: "0 1px 3px rgba(0, 0, 0, 0.2)",
  md: "0 8px 24px rgba(0, 0, 0, 0.3)",
  lg: "0 30px 80px rgba(0, 0, 0, 0.45)",
};

const lightShadow: Shadow = {
  sm: "0 1px 2px rgba(17, 24, 39, 0.06)",
  md: "0 8px 24px rgba(17, 24, 39, 0.1)",
  lg: "0 30px 80px rgba(17, 24, 39, 0.16)",
};

interface Transition {
  fast: string;
  base: string;
}

const transition: Transition = {
  fast: "0.12s ease",
  base: "0.2s ease",
};

interface ZIndex {
  dropdown: number;
  overlay: number;
  sidebar: number;
  modal: number;
}

const z: ZIndex = {
  dropdown: 20,
  overlay: 25,
  sidebar: 30,
  modal: 40,
};

/* ─────────────────────────────── gradients ──────────────────────────── */

interface Gradients {
  accent: string;
  page: string;
  glowTop: string;
  glowBottom: string;
}

const darkGradients: Gradients = {
  accent: "linear-gradient(135deg, #5b6cff 0%, #8b5cf6 100%)",
  page: "radial-gradient(1200px 800px at 15% -10%, #1c2440 0%, transparent 55%), radial-gradient(1000px 700px at 110% 110%, #2a1d4d 0%, transparent 55%), linear-gradient(160deg, #0b0e16 0%, #121829 48%, #141226 100%)",
  glowTop: "radial-gradient(circle, #5b6cff 0%, transparent 70%)",
  glowBottom: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
};

const lightGradients: Gradients = {
  accent: "linear-gradient(135deg, #4f5df0 0%, #7c3aed 100%)",
  page: "radial-gradient(1200px 800px at 15% -10%, #eef1ff 0%, transparent 55%), radial-gradient(1000px 700px at 110% 110%, #f5f0ff 0%, transparent 55%), linear-gradient(160deg, #ffffff 0%, #f6f7fb 48%, #f3f1fb 100%)",
  glowTop: "radial-gradient(circle, #4f5df0 0%, transparent 70%)",
  glowBottom: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
};

/* ─────────────────────────────── theme ──────────────────────────────── */

export interface Theme {
  name: ThemeName;
  colors: Colors;
  spaces: Record<SpaceKey, string>;
  radius: Radius;
  font: Font;
  shadow: Shadow;
  transition: Transition;
  z: ZIndex;
  gradients: Gradients;
}

export const darkTheme: Theme = {
  name: "dark",
  colors: darkColors,
  spaces,
  radius,
  font,
  shadow: darkShadow,
  transition,
  z,
  gradients: darkGradients,
};

export const lightTheme: Theme = {
  name: "light",
  colors: lightColors,
  spaces,
  radius,
  font,
  shadow: lightShadow,
  transition,
  z,
  gradients: lightGradients,
};

export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
};

export function getTheme(name: ThemeName): Theme {
  return themes[name];
}
