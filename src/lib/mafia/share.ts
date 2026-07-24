import { ALIGNMENT } from "./data";
import type { Assignment } from "./storage";

// No image-rendering library is used on purpose — html2canvas-style export
// would add a new dependency and a real chunk of complexity for a feature
// that's really just "give the host something worth pasting into a group
// chat." A clean text block via the native Share Sheet (or clipboard as a
// fallback) gets 90% of the value for 0 new dependencies.

export function buildShareText(
  assignments: Assignment[],
  winnerSide: "town" | "mafia" | null,
): string {
  const lines: string[] = [];
  lines.push("MAFIA CITY \u2014 CASE CLOSED");
  lines.push(
    winnerSide === "town"
      ? "THE TOWN WINS"
      : winnerSide === "mafia"
        ? "THE MAFIA WINS"
        : "Game in progress",
  );
  lines.push("");
  assignments.forEach((a) => {
    const align = ALIGNMENT[a.role];
    const tag = align === "mafia" ? "[MAFIA]" : align === "town" ? "[TOWN]" : "[NEUTRAL]";
    const status = a.alive === false ? " (eliminated)" : "";
    lines.push(`${tag} ${a.name} \u2014 ${a.role}${status}`);
  });
  lines.push("");
  lines.push("Played with Mafia City");
  return lines.join("\n");
}

interface NavigatorWithShare extends Navigator {
  share?: (data: { title?: string; text?: string }) => Promise<void>;
}

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareGameResult(text: string): Promise<ShareOutcome> {
  const nav = typeof navigator !== "undefined" ? (navigator as NavigatorWithShare) : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title: "Mafia City \u2014 Case Closed", text });
      return "shared";
    } catch {
      // User cancelled the share sheet, or the platform rejected it.
      // Fall through to clipboard rather than treating this as an error.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
