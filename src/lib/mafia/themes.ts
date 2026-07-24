// Theme packs. "classic" is the original free look; the rest are premium
// unlocks (Phase 3 gates these behind Play Billing). Applying a theme just
// overwrites the CSS custom properties defined in :root inside styles.css —
// no new component tree, no new dependency.

export type ThemeId = "classic" | "midnight" | "crimson";

export type ThemeTokens = {
  ink: string;
  ink2: string;
  paper: string;
  paperDim: string;
  blood: string;
  bloodBright: string;
  brass: string;
  smoke: string;
  smokeDim: string;
};

export type ThemeDef = {
  label: string;
  premium: boolean;
  tokens: ThemeTokens;
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: {
    label: "Classic Bureau",
    premium: false,
    tokens: {
      ink: "#131113",
      ink2: "#1c191b",
      paper: "#e8dfc9",
      paperDim: "#d8cca8",
      blood: "#7a1f1f",
      bloodBright: "#9c2b2b",
      brass: "#a9822f",
      smoke: "#8f8a82",
      smokeDim: "#5c5952",
    },
  },
  midnight: {
    label: "Midnight Precinct",
    premium: true,
    tokens: {
      ink: "#0a0e17",
      ink2: "#111827",
      paper: "#dbe6f5",
      paperDim: "#c3d2e8",
      blood: "#1f4e7a",
      bloodBright: "#2b6b9c",
      brass: "#5c8fa9",
      smoke: "#7d8ea3",
      smokeDim: "#4a5568",
    },
  },
  crimson: {
    label: "Crimson Syndicate",
    premium: true,
    tokens: {
      ink: "#150808",
      ink2: "#1f0d0d",
      paper: "#f5e3d8",
      paperDim: "#e8cdb8",
      blood: "#c23616",
      bloodBright: "#e0451f",
      brass: "#d98e04",
      smoke: "#a68a82",
      smokeDim: "#6b5652",
    },
  },
};

const DEFAULT_THEME: ThemeId = "classic";

export function isThemeId(v: string): v is ThemeId {
  return v === "classic" || v === "midnight" || v === "crimson";
}

/** Overwrites the CSS custom properties on <html> so every existing
 * component (which already reads var(--ink), var(--paper), etc.) re-themes
 * instantly with zero markup changes. */
export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  root.style.setProperty("--ink", theme.tokens.ink);
  root.style.setProperty("--ink-2", theme.tokens.ink2);
  root.style.setProperty("--paper", theme.tokens.paper);
  root.style.setProperty("--paper-dim", theme.tokens.paperDim);
  root.style.setProperty("--blood", theme.tokens.blood);
  root.style.setProperty("--blood-bright", theme.tokens.bloodBright);
  root.style.setProperty("--brass", theme.tokens.brass);
  root.style.setProperty("--smoke", theme.tokens.smoke);
  root.style.setProperty("--smoke-dim", theme.tokens.smokeDim);
}
