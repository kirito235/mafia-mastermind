import { ADDON_ROLES, OPTIONAL_ROLES, type ActionCard, type AddonRole, type OptionalRole, type Role } from "./data";

export type RoleSettings = Record<OptionalRole, boolean>;
export type AddonSettings = Record<AddonRole, boolean>;
export type CardSettings = { disabled: string[]; custom: ActionCard[] };

export const KEYS = {
  role: "mafiaCityRoleSettingsV1",
  addon: "mafiaCityAddonSettingsV1",
  card: "mafiaCityCardSettingsV1",
  mute: "mafiaCityMutedV1",
  score: "mafiaCityScoreboardV1",
  live: "mafiaCityLiveGameV1",
  history: "mafiaCityHistoryV1",
};

export function defaultRoleSettings(): RoleSettings {
  return { Doctor: true, Detective: true, Jailer: true, Terrorist: true };
}
export function defaultAddonSettings(): AddonSettings {
  return { Vigilante: false, Bodyguard: false, SerialKiller: false };
}

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function safeRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export function loadRoleSettings(): RoleSettings {
  return { ...defaultRoleSettings(), ...safeGet<Partial<RoleSettings>>(KEYS.role, {}) };
}
export function saveRoleSettings(s: RoleSettings) {
  safeSet(KEYS.role, s);
}

export function loadAddonSettings(): AddonSettings {
  return { ...defaultAddonSettings(), ...safeGet<Partial<AddonSettings>>(KEYS.addon, {}) };
}
export function saveAddonSettings(s: AddonSettings) {
  safeSet(KEYS.addon, s);
}

export function loadCardSettings(): CardSettings {
  const raw = safeGet<CardSettings | null>(KEYS.card, null);
  return raw && Array.isArray(raw.disabled) && Array.isArray(raw.custom) ? raw : { disabled: [], custom: [] };
}
export function saveCardSettings(s: CardSettings) {
  safeSet(KEYS.card, s);
}

export function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEYS.mute) === "1";
  } catch {
    return false;
  }
}
export function saveMuted(m: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEYS.mute, m ? "1" : "0");
  } catch {}
}

export type ScoreRow = { wins: number; losses: number; games: number };
export type Scores = Record<string, ScoreRow>;
export function loadScores(): Scores {
  return safeGet<Scores>(KEYS.score, {});
}
export function saveScores(s: Scores) {
  safeSet(KEYS.score, s);
}

export type LiveSave = {
  screen: string;
  state: unknown;
  neIdx: number;
};
export function loadLiveSave(): LiveSave | null {
  return safeGet<LiveSave | null>(KEYS.live, null);
}
export function saveLive(v: LiveSave) {
  safeSet(KEYS.live, v);
}
export function clearLive() {
  safeRemove(KEYS.live);
}

// Helper to filter active role counts based on settings.
// Optional roles (Doctor/Detective/Jailer/Terrorist) fold their slots into
// Civilian when disabled. Addon roles (Vigilante/Bodyguard/SerialKiller)
// consume a Civilian slot when enabled, only if one is available.
import { ROLE_TABLE } from "./data";
export function getActiveRoleCounts(
  n: number,
  settings: RoleSettings,
  addons: AddonSettings = defaultAddonSettings()
): Record<string, number> {
  const base: Record<string, number> = { ...(ROLE_TABLE[n] as Record<string, number>) };
  let extraCiv = 0;
  OPTIONAL_ROLES.forEach((role) => {
    if (!settings[role] && base[role]) {
      extraCiv += base[role];
      delete base[role];
    }
  });
  base.Civilian = (base.Civilian || 0) + extraCiv;
  ADDON_ROLES.forEach((role) => {
    if (addons[role] && (base.Civilian || 0) > 0) {
      base.Civilian--;
      base[role] = (base[role] || 0) + 1;
    }
  });
  if (base.Civilian === 0) delete base.Civilian;
  return base;
}

export type HistoryEntry = {
  date: string;
  winner: "town" | "mafia";
  players: { name: string; role: Role; won: boolean }[];
};
export function loadHistory(): HistoryEntry[] {
  return safeGet<HistoryEntry[]>(KEYS.history, []);
}
export function saveHistory(h: HistoryEntry[]) {
  safeSet(KEYS.history, h.slice(0, 50)); // cap at 50 most recent
}
export function appendHistory(entry: HistoryEntry) {
  const h = loadHistory();
  h.unshift(entry);
  saveHistory(h);
}
export function clearHistory() {
  safeRemove(KEYS.history);
}

export function getActiveCardPool(cards: CardSettings, defaults: ActionCard[]): ActionCard[] {
  const all = defaults.concat(cards.custom);
  const pool = all.filter((c) => !cards.disabled.includes(c[0]));
  return pool.length ? pool : defaults;
}

export type Assignment = {
  name: string;
  role: Role;
  card: ActionCard | null;
  alive: boolean;
};
