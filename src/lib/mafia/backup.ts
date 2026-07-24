import {
  defaultAddonSettings,
  defaultRoleSettings,
  loadAddonSettings,
  loadCardSettings,
  loadHistory,
  loadMuted,
  loadRoleSettings,
  loadScores,
  loadThemeId,
  saveAddonSettings,
  saveCardSettings,
  saveHistory,
  saveMuted,
  saveRoleSettings,
  saveScores,
  saveThemeId,
  type AddonSettings,
  type CardSettings,
  type HistoryEntry,
  type RoleSettings,
  type Scores,
} from "./storage";

// This is the no-backend substitute for cloud sync: a single JSON file the
// host can save to Drive/email/etc and restore on a new phone. No account,
// no server, no ongoing cost — solves the actual problem (lost scoreboard on
// a new device) without any of the risk cloud sync would add at this stage.

const BACKUP_VERSION = 1;

export type BackupPayload = {
  version: number;
  exportedAt: string;
  roleSettings: RoleSettings;
  addonSettings: AddonSettings;
  cardSettings: CardSettings;
  scores: Scores;
  history: HistoryEntry[];
  muted: boolean;
  themeId: string;
};

export function buildBackupPayload(): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    roleSettings: loadRoleSettings(),
    addonSettings: loadAddonSettings(),
    cardSettings: loadCardSettings(),
    scores: loadScores(),
    history: loadHistory(),
    muted: loadMuted(),
    themeId: loadThemeId(),
  };
}

export function exportBackupToFile() {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `mafia-city-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ImportResult = { ok: true } | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function importBackupFromJSON(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!isPlainObject(parsed) || typeof parsed.version !== "number") {
    return { ok: false, error: "That file doesn't look like a Mafia City backup." };
  }

  try {
    const p = parsed as Partial<BackupPayload>;

    if (isPlainObject(p.roleSettings)) {
      saveRoleSettings({ ...defaultRoleSettings(), ...(p.roleSettings as Partial<RoleSettings>) });
    }
    if (isPlainObject(p.addonSettings)) {
      saveAddonSettings({
        ...defaultAddonSettings(),
        ...(p.addonSettings as Partial<AddonSettings>),
      });
    }
    if (
      isPlainObject(p.cardSettings) &&
      Array.isArray((p.cardSettings as CardSettings).disabled) &&
      Array.isArray((p.cardSettings as CardSettings).custom)
    ) {
      saveCardSettings(p.cardSettings as CardSettings);
    }
    if (isPlainObject(p.scores)) {
      saveScores(p.scores as Scores);
    }
    if (Array.isArray(p.history)) {
      saveHistory(p.history as HistoryEntry[]);
    }
    if (typeof p.muted === "boolean") {
      saveMuted(p.muted);
    }
    if (typeof p.themeId === "string") {
      saveThemeId(p.themeId);
    }
  } catch {
    return { ok: false, error: "The backup file was read but couldn't be applied." };
  }

  return { ok: true };
}
