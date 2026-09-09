export interface Theme {
  name: "dark";
  colors: {
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
  };
  gradients: {
    accent: string;
    page: string;
    glowTop: string;
    glowBottom: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  font: {
    sans: string;
    mono: string;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };
  transition: {
    fast: string;
    base: string;
  };
  z: {
    dropdown: number;
    overlay: number;
    sidebar: number;
    modal: number;
  };
}

export const darkTheme: Theme = {
  name: "dark",
  colors: {
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
  },
  gradients: {
    accent: "linear-gradient(135deg, #5b6cff 0%, #8b5cf6 100%)",
    page: "radial-gradient(1200px 800px at 15% -10%, #1c2440 0%, transparent 55%), radial-gradient(1000px 700px at 110% 110%, #2a1d4d 0%, transparent 55%), linear-gradient(160deg, #0b0e16 0%, #121829 48%, #141226 100%)",
    glowTop: "radial-gradient(circle, #5b6cff 0%, transparent 70%)",
    glowBottom: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "22px",
    full: "999px",
  },
  font: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "JetBrains Mono", "Courier New", monospace',
  },
  shadow: {
    sm: "0 1px 3px rgba(0, 0, 0, 0.2)",
    md: "0 8px 24px rgba(0, 0, 0, 0.3)",
    lg: "0 30px 80px rgba(0, 0, 0, 0.45)",
  },
  transition: {
    fast: "0.12s ease",
    base: "0.2s ease",
  },
  z: {
    dropdown: 20,
    overlay: 25,
    sidebar: 30,
    modal: 40,
  },
};
