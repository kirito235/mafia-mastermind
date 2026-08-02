import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTION_CARDS,
  ADDON_ROLES,
  ALIGNMENT,
  DOCTOR_CHANCES,
  OPTIONAL_ROLES,
  ROLE_INFO,
  buildCardPool,
  shuffle,
  type ActionCard,
  type Role,
} from "@/lib/mafia/data";
import {
  appendHistory,
  clearHistory,
  clearLive,
  defaultAddonSettings,
  defaultMafiaCount,
  defaultRoleSettings,
  getActiveCardPool,
  getActiveRoleCounts,
  loadAddonSettings,
  loadCardSettings,
  loadDimPref,
  loadHistory,
  loadLiveSave,
  loadMuted,
  loadPremium,
  loadReviewPromptState,
  loadRoleSettings,
  loadScores,
  loadThemeId,
  maxMafiaCount,
  saveAddonSettings,
  saveCardSettings,
  saveDimPref,
  saveLive,
  saveMuted,
  savePremium,
  saveReviewPromptState,
  saveRoleSettings,
  saveScores,
  saveThemeId,
  type AddonSettings,
  type Assignment,
  type CardSettings,
  type HistoryEntry,
  type RoleSettings,
} from "@/lib/mafia/storage";
import {
  announceBuzz,
  cancelSpeakSequence,
  cancelSpeech,
  eliminationBell,
  phaseCue,
  roleStinger,
  sealBreakFeedback,
  speak,
  speakSequence,
  timerBuzzer,
} from "@/lib/mafia/audio";
import { applyTheme, THEMES, isThemeId, type ThemeId } from "@/lib/mafia/themes";
import { buildShareText, shareGameResult } from "@/lib/mafia/share";
import { exportBackupToFile, importBackupFromJSON } from "@/lib/mafia/backup";
import { initAds, showBanner, hideBanner, showInterstitialOnNewGame } from "@/lib/mafia/ads";
import { checkPremiumStatus, purchasePremium } from "@/lib/mafia/billing";
import { Seal } from "./Seal";
import { Modal, ModalDivider } from "./Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// TODO: replace with the real Play Store listing once the app is published.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.yourcompany.mafiacity";

type Screen =
  | "title"
  | "leaderboard"
  | "shop"
  | "settings"
  | "nameEntry"
  | "nameReview"
  | "pass"
  | "reveal"
  | "finalSeal"
  | "dashboard"
  | "gameOver";

const HUB_SCREENS: Screen[] = ["title", "leaderboard", "shop", "settings"];

type Phase = "night" | "day";

type GameState = {
  n: number;
  names: string[];
  assignments: Assignment[];
  idx: number;
  doctorSavesUsed: number;
  lastWinnerSide: "town" | "mafia" | null;
  lastGameTime: string | null;
  godfatherChoice: string | null;
  phase: Phase;
  round: number;
  mafiaOverride: number | null;
  /** Names eliminated this game, in order — powers the Phase 2 "undo" button. */
  eliminationLog: string[];
};

const RESUMABLE_SCREENS: Screen[] = ["nameEntry", "nameReview", "pass", "reveal", "finalSeal", "dashboard"];

function initialState(): GameState {
  return {
    n: 9,
    names: [],
    assignments: [],
    idx: 0,
    doctorSavesUsed: 0,
    lastWinnerSide: null,
    lastGameTime: null,
    godfatherChoice: null,
    phase: "night",
    round: 1,
    mafiaOverride: null,
    eliminationLog: [],
  };
}

export function MafiaCity() {
  const [screen, setScreen] = useState<Screen>("title");
  const [state, setState] = useState<GameState>(initialState);
  const [neIdx, setNeIdx] = useState(0);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewAssign, setPreviewAssign] = useState<Assignment | null>(null);

  const [muted, setMuted] = useState(false);
  const [roleSettings, setRoleSettings] = useState<RoleSettings>(defaultRoleSettings());
  const [addonSettings, setAddonSettings] = useState<AddonSettings>(defaultAddonSettings());
  const [cardSettings, setCardSettings] = useState<CardSettings>({ disabled: [], custom: [] });
  const [showHistory, setShowHistory] = useState(false);
  const [dashTab, setDashTab] = useState<"roster" | "tools" | "script">("roster");

  const [showInfo, setShowInfo] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [pendingResume, setPendingResume] = useState<{ screen: Screen; state: GameState; neIdx: number } | null>(null);
  const [announceMsg, setAnnounceMsg] = useState<{ head: string; sub: string } | null>(null);
  const [detailModal, setDetailModal] = useState<Assignment | null>(null);
  const [winnerModal, setWinnerModal] = useState(false);
  const [clearScoreModal, setClearScoreModal] = useState(false);
  const [setupErr, setSetupErr] = useState("");
  const [playerCountRaw, setPlayerCountRaw] = useState("");

  // ---- Phase 1/2 additions ----
  const [themeId, setThemeId] = useState<ThemeId>("classic");
  const [isPremium, setIsPremium] = useState(false);
  const [dimEnabled, setDimEnabled] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [showPremiumPrompt, setShowPremiumPrompt] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseMsg, setPurchaseMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persisted settings on mount, offer to resume interrupted game
  useEffect(() => {
    setMuted(loadMuted());
    setRoleSettings(loadRoleSettings());
    setAddonSettings(loadAddonSettings());
    setCardSettings(loadCardSettings());

    const storedTheme = loadThemeId();
    const resolvedTheme: ThemeId = isThemeId(storedTheme) ? storedTheme : "classic";
    setThemeId(resolvedTheme);
    applyTheme(resolvedTheme);
    setDimEnabled(loadDimPref());
    // Real Play Billing check on native; falls back to the local dev-toggle
    // flag automatically when running in the browser/Lovable preview.
    checkPremiumStatus().then(setIsPremium);
    initAds();

    const saved = loadLiveSave();
    if (saved && (saved.state as GameState)?.assignments?.length) {
      setPendingResume({
        screen: saved.screen as Screen,
        state: saved.state as GameState,
        neIdx: saved.neIdx || 0,
      });
      setShowResume(true);
    } else {
      clearLive();
    }
  }, []);

  // Autosave in-progress game
  useEffect(() => {
    if (previewMode) return;
    if (!RESUMABLE_SCREENS.includes(screen)) return;
    saveLive({ screen, state, neIdx });
  }, [screen, state, neIdx, previewMode]);

  // Wake lock while playing
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const req = async () => {
      try {
        if ("wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch { }
    };
    const onVis = () => {
      if (document.visibilityState === "visible" && !lock) req();
    };
    document.addEventListener("visibilitychange", onVis);
    const onFirstPointer = () => req();
    document.addEventListener("pointerdown", onFirstPointer, { once: true });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("pointerdown", onFirstPointer);
      try {
        lock?.release();
      } catch { }
    };
  }, []);

  // Phase 3: banner only on screens where it won't crowd the seal-reveal
  // flow — title (setup) and the Godfather's dashboard. Never during a
  // private role reveal.
  useEffect(() => {
    if (isPremium) {
      hideBanner();
      return;
    }
    if (screen === "title" || screen === "dashboard") {
      showBanner();
    } else {
      hideBanner();
    }
  }, [screen, isPremium]);

  // ---- helpers ----
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    saveMuted(m);
  };

  const toggleDim = () => {
    const next = !dimEnabled;
    setDimEnabled(next);
    saveDimPref(next);
  };

  const announce = useCallback(
    (head: string, sub: string) => {
      setAnnounceMsg({ head, sub });
      announceBuzz(muted);
      speak(sub ? `${head}. ${sub}` : head, muted);
    },
    [muted]
  );

  const doReset = () => {
    setState(initialState());
    setNeIdx(0);
    setEditingFromReview(false);
    setPreviewMode(false);
    setPlayerCountRaw("");
    setSetupErr("");
    clearLive();
    setScreen("title");
  };

  // Interstitial only fires here — starting a fresh game from Game Over —
  // never from the top-bar ⟲ reset, which people tap by accident mid-game.
  const startNewGameFromGameOver = () => {
    showInterstitialOnNewGame(isPremium);
    doReset();
  };

  const resumeLiveGame = () => {
    if (!pendingResume) return;
    const s = pendingResume.state;
    if (!s.phase) s.phase = "night";
    if (!s.round) s.round = 1;
    if (s.godfatherChoice === undefined) s.godfatherChoice = null;
    if (!Array.isArray(s.eliminationLog)) s.eliminationLog = [];
    s.assignments?.forEach((a) => {
      if (a.alive === undefined) a.alive = true;
    });
    setState(s);
    setNeIdx(pendingResume.neIdx);
    setEditingFromReview(false);
    setPreviewMode(false);
    setShowResume(false);
    setScreen(pendingResume.screen);
    setPendingResume(null);
  };

  // ---- title / setup ----
  const startFromTitle = () => {
    const n = parseInt(playerCountRaw.trim(), 10);
    if (!playerCountRaw || isNaN(n) || n < 6 || n > 20) {
      setSetupErr("Enter a number of players between 6 and 20.");
      return;
    }
    setSetupErr("");
    setState((s) => ({ ...initialState(), n, names: new Array(n).fill(""), mafiaOverride: s.mafiaOverride }));
    setNeIdx(0);
    setScreen("nameEntry");
  };

  const openPreview = () => {
    const roles = Object.keys(ROLE_INFO) as Role[];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const card = role === "Godfather" ? null : ACTION_CARDS[Math.floor(Math.random() * ACTION_CARDS.length)];
    setPreviewAssign({ name: "Sample Player", role, card, alive: true });
    setPreviewMode(true);
    setScreen("reveal");
  };

  // ---- name entry ----
  const [neInput, setNeInput] = useState("");
  const [neErr, setNeErr] = useState("");
  const neInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (screen === "nameEntry") {
      setNeInput(state.names[neIdx] || "");
      setNeErr("");
      setTimeout(() => neInputRef.current?.focus(), 60);
    }
  }, [screen, neIdx, state.names]);

  const confirmNameEntry = () => {
    const val = neInput.trim();
    if (!val) {
      setNeErr("Type a name to continue.");
      return;
    }
    const dupe = state.names.some((n, i) => i !== neIdx && n && n.toLowerCase() === val.toLowerCase());
    if (dupe) {
      setNeErr("Someone already used that name - add a last initial.");
      return;
    }
    const prev = state.names[neIdx] || "";
    const next = [...state.names];
    next[neIdx] = val;

    if (editingFromReview) {
      setState((s) => ({
        ...s,
        names: next,
        godfatherChoice: s.godfatherChoice === prev ? val : s.godfatherChoice,
      }));
      setEditingFromReview(false);
      setScreen("nameReview");
      return;
    }
    setState((s) => ({ ...s, names: next }));
    if (neIdx + 1 >= state.n) {
      setScreen("nameReview");
    } else {
      setNeIdx(neIdx + 1);
    }
  };

  const neBack = () => {
    if (editingFromReview) {
      setEditingFromReview(false);
      setScreen("nameReview");
      return;
    }
    if (neIdx === 0) return;
    const next = [...state.names];
    next[neIdx] = neInput.trim();
    setState((s) => ({ ...s, names: next }));
    setNeIdx(neIdx - 1);
  };

  // ---- name review ----
  const reorderName = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= state.names.length) return;
    setState((s) => {
      const n = [...s.names];
      [n[i], n[j]] = [n[j], n[i]];
      return { ...s, names: n };
    });
  };
  const editNameFromReview = (i: number) => {
    setEditingFromReview(true);
    setNeIdx(i);
    setScreen("nameEntry");
  };

  // ---- deal roles ----
  const finalizeAssignments = () => {
    const table = getActiveRoleCounts(state.n, roleSettings, addonSettings, state.mafiaOverride);
    let rolePool: Role[] = [];
    Object.entries(table).forEach(([role, count]) => {
      for (let i = 0; i < count; i++) rolePool.push(role as Role);
    });
    const chosenGf = state.godfatherChoice && state.names.includes(state.godfatherChoice) ? state.godfatherChoice : null;
    if (chosenGf) {
      const slot = rolePool.indexOf("Godfather");
      if (slot > -1) rolePool.splice(slot, 1);
    }
    rolePool = shuffle(rolePool);

    const cardSource = getActiveCardPool(cardSettings, ACTION_CARDS);
    const cardPool = buildCardPool(state.n - 1, cardSource);
    let cardCursor = 0;
    let poolCursor = 0;

    const assignments: Assignment[] = state.names.map((name) => {
      const role: Role = chosenGf && name === chosenGf ? "Godfather" : rolePool[poolCursor++];
      let card: ActionCard | null = null;
      if (role !== "Godfather") {
        card = cardPool[cardCursor++];
      }
      return { name, role, card, alive: true };
    });

    setState((s) => ({
      ...s,
      assignments,
      idx: 0,
      doctorSavesUsed: 0,
      lastWinnerSide: null,
      phase: "night",
      round: 1,
      eliminationLog: [],
    }));
    setScreen("pass");
  };

  // ---- reveal flow ----
  const currentAssign = previewMode ? previewAssign : state.assignments[state.idx];
  const isLastReveal = !previewMode && state.idx === state.n - 1;

  const onSealBreak = () => {
    sealBreakFeedback(muted);
    setPreviewMode(false);
    setScreen("reveal");
    const a = previewMode ? previewAssign : state.assignments[state.idx];
    if (a) setTimeout(() => roleStinger(a.role, muted), 220);
  };

  const onSealAgain = () => {
    if (previewMode) {
      setPreviewMode(false);
      setPreviewAssign(null);
      setScreen("title");
      return;
    }
    if (state.idx + 1 >= state.n) {
      setScreen("finalSeal");
    } else {
      setState((s) => ({ ...s, idx: s.idx + 1 }));
      setScreen("pass");
    }
  };

  const onFinalSealBreak = () => {
    sealBreakFeedback(muted);
    setScreen("dashboard");
  };

  // ---- dashboard: phase, elimination, doctor, timer ----
  const advancePhase = () => {
    setState((s) => {
      const next: Phase = s.phase === "night" ? "day" : "night";
      phaseCue(next, muted);
      return next === "day" ? { ...s, phase: "day" } : { ...s, phase: "night", round: s.round + 1 };
    });
  };
  const eliminatePlayer = (name: string) => {
    const a = state.assignments.find((x) => x.name === name && x.alive !== false);
    if (!a) return;
    setState((s) => ({
      ...s,
      assignments: s.assignments.map((x) => (x.name === name ? { ...x, alive: false } : x)),
      eliminationLog: [...s.eliminationLog, name],
    }));
    eliminationBell(muted);
    const wasMafia = ALIGNMENT[a.role] === "mafia";
    if (state.phase === "night") {
      announce(`${name} was killed`, `They didn't make it through the night.`);
    } else {
      announce(`${name} was voted out`, `${name} ${wasMafia ? "was" : "was not"} aligned with the Mafia.`);
    }
  };

  // Phase 2: undo the most recent elimination — a mis-tap shouldn't require
  // restarting the whole game.
  const undoLastElimination = () => {
    setState((s) => {
      if (!s.eliminationLog.length) return s;
      const log = [...s.eliminationLog];
      const name = log.pop() as string;
      return {
        ...s,
        eliminationLog: log,
        assignments: s.assignments.map((x) => (x.name === name ? { ...x, alive: true } : x)),
      };
    });
  };

  const doctorMax = DOCTOR_CHANCES[state.n];
  const hasDoctor = state.assignments.some((a) => a.role === "Doctor");
  const aliveNoGf = state.assignments.filter((a) => a.alive !== false && a.role !== "Godfather");
  const [eliminatePick, setEliminatePick] = useState<string>("");
  useEffect(() => {
    if (aliveNoGf.length && !aliveNoGf.some((a) => a.name === eliminatePick)) {
      setEliminatePick(aliveNoGf[0].name);
    } else if (!aliveNoGf.length) {
      setEliminatePick("");
    }
  }, [aliveNoGf, eliminatePick]);

  const aliveMafia = state.assignments.filter((a) => a.alive !== false && ALIGNMENT[a.role] === "mafia").length;
  const aliveTown = state.assignments.filter((a) => a.alive !== false && ALIGNMENT[a.role] === "town").length;
  const winHint =
    aliveMafia === 0
      ? "All Mafia-aligned players are eliminated — looks like the Town has won."
      : aliveMafia >= aliveTown
        ? "Mafia now equal or outnumber the Town — looks like the Mafia has won."
        : `Still alive: ${aliveTown} Town-aligned, ${aliveMafia} Mafia-aligned. No side has won yet.`;

  // Timer
  const [timerTotal, setTimerTotal] = useState(120);
  const [timerRemaining, setTimerRemaining] = useState(120);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerIntRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timerIntRef.current) window.clearInterval(timerIntRef.current);
    };
  }, []);
  const setTimerPreset = (secs: number) => {
    if (timerRunning) return;
    setTimerTotal(secs);
    setTimerRemaining(secs);
  };
  const startTimer = () => {
    if (timerRunning) return;
    if (timerRemaining <= 0) setTimerRemaining(timerTotal);
    setTimerRunning(true);
    timerIntRef.current = window.setInterval(() => {
      setTimerRemaining((r) => {
        if (r <= 1) {
          if (timerIntRef.current) window.clearInterval(timerIntRef.current);
          setTimerRunning(false);
          timerBuzzer(muted);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  };
  const pauseTimer = () => {
    if (timerIntRef.current) window.clearInterval(timerIntRef.current);
    setTimerRunning(false);
  };
  const resetTimer = () => {
    pauseTimer();
    setTimerRemaining(timerTotal);
  };
  const timerText = useMemo(() => {
    const s = Math.max(0, timerRemaining);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }, [timerRemaining]);

  // Night script
  const nightScript = useMemo(() => {
    const gf = state.assignments.find((a) => a.role === "Godfather");
    if (!gf) return null;
    const chances = DOCTOR_CHANCES[state.n];
    const has = (r: Role) => state.assignments.some((a) => a.role === r);
    const steps: { head: string; say: string; body: string }[] = [
      {
        head: "① NIGHT BEGINS",
        say: "Everyone, close your eyes. The city goes to sleep.",
        body: "Wait until the table is fully quiet before continuing.",
      },
    ];
    if (has("Jailer"))
      steps.push({
        head: "② JAILER",
        say: "Jailer, wake up. Point to the player you want to jail tonight.",
        body: "Note who they pick, then say: \"Jailer, go back to sleep.\" That player skips all night actions.",
      });
    steps.push({
      head: "③ MAFIA",
      say: "Mafia, wake up. Choose your target together and point.",
      body: 'Once they agree, say: "Mafia, go back to sleep."',
    });
    if (has("Doctor"))
      steps.push({
        head: "④ DOCTOR",
        say: "Doctor, wake up. Do you want to save tonight's target?",
        body: `Point to the Mafia's target. Doctor nods to save, shakes their head to pass. ${chances} saves total this game — track them below, then say: "Doctor, go back to sleep."`,
      });
    if (has("Detective"))
      steps.push({
        head: "⑤ DETECTIVE",
        say: "Detective, wake up. Point to the player you want to investigate.",
        body: 'Nod for a correct guess, shake your head if wrong. Then: "Detective, go back to sleep."',
      });
    steps.push({
      head: "⑥ DAY BEGINS",
      say: "Everyone, wake up.",
      body: 'If someone died, name them and nothing else. If nobody did, say "no one was eliminated last night." Then open the floor, hold a vote, and announce who\'s voted out.',
    });
    if (has("Jailer"))
      steps.push({
        head: "HOUSE RULE — DON'T SAY ALOUD",
        say: "(reminder for you only)",
        body: "Never explain why nobody died. Staying flat protects the Jailer's identity just as much as everyone else's.",
      });
    return steps;
  }, [state.assignments, state.n]);

  // Phase 2: auto-narration — chains the night script through speech synth
  // instead of the Godfather reading it line by line. Gated behind premium.
  const startNarration = () => {
    if (!isPremium) {
      setShowPremiumPrompt(true);
      return;
    }
    if (!nightScript || narrating) return;
    setNarrating(true);
    const lines = nightScript.filter((step) => !step.head.startsWith("HOUSE RULE")).map((step) => step.say);
    speakSequence(lines, muted, () => setNarrating(false));
  };
  const stopNarration = () => {
    cancelSpeakSequence();
    setNarrating(false);
  };

  // ---- winner / scoreboard ----
  const finishGame = (side: "town" | "mafia") => {
    const scores = loadScores();
    state.assignments.forEach((a) => {
      const align = ALIGNMENT[a.role];
      if (!scores[a.name]) scores[a.name] = { wins: 0, losses: 0, games: 0 };
      scores[a.name].games++;
      if (align !== "neutral") {
        if (align === side) scores[a.name].wins++;
        else scores[a.name].losses++;
      }
    });
    saveScores(scores);
    appendHistory({
      date: new Date().toISOString(),
      winner: side,
      players: state.assignments.map((a) => ({
        name: a.name,
        role: a.role,
        won: ALIGNMENT[a.role] !== "neutral" && ALIGNMENT[a.role] === side,
      })),
    });
    setState((s) => ({ ...s, lastWinnerSide: side, lastGameTime: new Date().toLocaleString() }));
    setWinnerModal(false);
    clearLive();
    setScreen("gameOver");
    announce(side === "town" ? "The Town wins!" : "The Mafia wins!", "Every case file is now closed.");

    // Phase 2: review prompt, spaced out so it doesn't collide with the
    // winner announcement modal, and only after a couple of completed games
    // so it's not the very first thing a new host sees.
    const rp = loadReviewPromptState();
    const updatedRp = { ...rp, gamesCompleted: rp.gamesCompleted + 1 };
    saveReviewPromptState(updatedRp);
    if (!updatedRp.shown && updatedRp.gamesCompleted >= 2) {
      window.setTimeout(() => setShowReviewPrompt(true), 1800);
    }
  };

  const dismissReviewPrompt = (permanent: boolean) => {
    const rp = loadReviewPromptState();
    saveReviewPromptState({ ...rp, shown: permanent });
    setShowReviewPrompt(false);
  };

  const openPlayStore = () => {
    dismissReviewPrompt(true);
    window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer");
  };

  // Phase 2: shareable results — native share sheet with clipboard fallback.
  const doShareResult = async () => {
    const text = buildShareText(state.assignments, state.lastWinnerSide);
    const outcome = await shareGameResult(text);
    setShareMsg(
      outcome === "shared" ? "Shared!" : outcome === "copied" ? "Copied to clipboard!" : "Couldn't share — try again.",
    );
    window.setTimeout(() => setShareMsg(null), 2500);
  };

  // Phase 2: theme selection — premium themes open the upsell prompt instead
  // of applying until isPremium is true (real gate arrives with Play Billing).
  const selectTheme = (id: ThemeId) => {
    if (THEMES[id].premium && !isPremium) {
      setShowPremiumPrompt(true);
      return;
    }
    setThemeId(id);
    saveThemeId(id);
    applyTheme(id);
  };

  const toggleSimulatedPremium = (v: boolean) => {
    setIsPremium(v);
    savePremium(v);
  };

  const handlePurchasePremium = async () => {
    setPurchasing(true);
    setPurchaseMsg(null);
    const result = await purchasePremium();
    setPurchasing(false);
    if (result.ok) {
      setIsPremium(true);
      setShowPremiumPrompt(false);
    } else {
      setPurchaseMsg(result.error ?? "Purchase failed.");
    }
  };

  // Phase 1: backup export/import
  const onImportFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const result = importBackupFromJSON(text);
    if (result.ok) {
      setRoleSettings(loadRoleSettings());
      setAddonSettings(loadAddonSettings());
      setCardSettings(loadCardSettings());
      setMuted(loadMuted());
      const storedTheme = loadThemeId();
      const resolvedTheme: ThemeId = isThemeId(storedTheme) ? storedTheme : "classic";
      setThemeId(resolvedTheme);
      applyTheme(resolvedTheme);
      setImportMsg("Backup restored successfully.");
    } else {
      setImportMsg(result.error);
    }
    window.setTimeout(() => setImportMsg(null), 3500);
  };

  // ---- settings screen actions ----
  const addCustomCard = (name: string, desc: string) => {
    if (!name.trim() || !desc.trim()) return false;
    const exists = ACTION_CARDS.concat(cardSettings.custom).some((c) => c[0].toLowerCase() === name.trim().toLowerCase());
    if (exists) return false;
    setCardSettings((cs) => ({ ...cs, custom: [...cs.custom, [name.trim(), desc.trim()]] }));
    return true;
  };
  const removeCustomCard = (name: string) => {
    setCardSettings((cs) => ({
      disabled: cs.disabled.filter((n) => n !== name),
      custom: cs.custom.filter((c) => c[0] !== name),
    }));
  };
  const toggleCard = (name: string, on: boolean) => {
    setCardSettings((cs) => {
      const disabled = on ? cs.disabled.filter((n) => n !== name) : cs.disabled.includes(name) ? cs.disabled : [...cs.disabled, name];
      return { ...cs, disabled };
    });
  };
  const settingsDone = () => {
    saveRoleSettings(roleSettings);
    saveAddonSettings(addonSettings);
    saveCardSettings(cardSettings);
    setScreen("title");
  };
  const settingsReset = () => {
    setRoleSettings(defaultRoleSettings());
    setAddonSettings(defaultAddonSettings());
    setCardSettings({ disabled: [], custom: [] });
  };

  // ------- RENDER -------
  const showBottomNav = HUB_SCREENS.includes(screen);

  return (
    <div className={`mc-app-bg${dimEnabled ? " mc-dim" : ""}`} style={{ minHeight: "100dvh" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          minHeight: "100dvh",
          padding: `20px 16px calc(${showBottomNav ? 78 : 20}px + env(safe-area-inset-bottom))`,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            minHeight: "calc(100dvh - 40px)",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* Top bar */}
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingBottom: 10, flexShrink: 0 }}>
            <button
              className="mc-icon-btn"
              onClick={toggleDim}
              title={dimEnabled ? "Turn off dim mode" : "Dim the screen for a dark room"}
              aria-label="Toggle dim mode"
            >
              {dimEnabled ? "☀" : "☾"}
            </button>
            <button
              className="mc-icon-btn"
              onClick={toggleMute}
              title={muted ? "Unmute" : "Mute seal-break sound & vibration"}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? "⊘" : "♪"}
            </button>
            <Sheet>
              <SheetTrigger asChild>
                <button className="mc-icon-btn" title="Menu" aria-label="Menu">
                  ☰
                </button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Mafia City</SheetTitle>
                </SheetHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
                  <button className="mc-ghost-btn" onClick={() => setShowInfo(true)}>
                    📖 Rules & How to Play
                  </button>
                  <button className="mc-ghost-btn" onClick={() => setShowHistory(true)}>
                    🗂 Game History
                  </button>
                  <button className="mc-ghost-btn" onClick={() => setScreen("settings")}>
                    ⚙ Roles & Action Cards
                  </button>
                  <div className="mc-divider" />
                  <button
                    className="mc-ghost-btn"
                    style={{ color: "var(--blood)", borderColor: "var(--blood)" }}
                    onClick={() => setShowConfirmReset(true)}
                  >
                    ⟲ Start New Game
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {screen === "title" && (
            <div className="mc-screen" style={{ justifyContent: "center", textAlign: "center", padding: "10px 6px" }}>
              <div>
                <div className="mc-crest" aria-hidden="true">
                  <span>✶</span>
                  <span className="mc-crest-line" />
                  <span className="mc-crest-mark">MC</span>
                  <span className="mc-crest-line" />
                  <span>✶</span>
                </div>
                <h1 style={{ fontSize: 38, lineHeight: 1.05, color: "var(--paper)" }}>
                  MAFIA <span style={{ color: "var(--blood-bright)" }}>CITY</span>
                </h1>
                <div style={{ color: "var(--smoke)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 6 }}>
                  For the Godfather's eyes only
                </div>
              </div>
              <div className="mc-divider" />
              <div style={{ textAlign: "left" }}>
                <div className="mc-eyebrow" style={{ marginBottom: 10 }}>Headcount at the table</div>
                <input
                  className="mc-big-input"
                  type="number"
                  inputMode="numeric"
                  min={6}
                  max={20}
                  placeholder="6–20"
                  value={playerCountRaw}
                  onChange={(e) => setPlayerCountRaw(e.target.value)}
                />
                <div className="mc-hint">
                  Between six and twenty souls. The Bureau assigns every dossier.
                </div>
                <div style={{ minHeight: 96 }}>
                  {(() => {
                    const n = parseInt(playerCountRaw.trim(), 10);
                    if (!n || n < 6 || n > 20) return null;
                    const def = defaultMafiaCount(n, roleSettings, addonSettings);
                    const max = maxMafiaCount(n, roleSettings, addonSettings);
                    const current = state.mafiaOverride ?? def;
                    const setMafia = (v: number) => {
                      const clamped = Math.max(1, Math.min(max, v));
                      setState((s) => ({ ...s, mafiaOverride: clamped === def ? null : clamped }));
                    };
                    return (
                      <div style={{ marginTop: 14 }}>
                        <div className="mc-eyebrow" style={{ marginBottom: 8 }}>Made men on the payroll</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <button
                            type="button"
                            className="mc-ghost-btn"
                            style={{ padding: "6px 14px", minWidth: 44 }}
                            onClick={() => setMafia(current - 1)}
                            disabled={current <= 1}
                            aria-label="Fewer Mafia"
                          >−</button>
                          <div style={{ flex: 1, textAlign: "center", fontFamily: "'Courier Prime', monospace", color: "var(--paper)" }}>
                            <div style={{ fontSize: 24, lineHeight: 1 }}>{current}</div>
                            <div style={{ fontSize: 10, color: "var(--smoke-dim)", letterSpacing: "0.14em", marginTop: 4 }}>
                              MAFIA {state.mafiaOverride === null ? "· BUREAU DEFAULT" : "· ADJUSTED"}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="mc-ghost-btn"
                            style={{ padding: "6px 14px", minWidth: 44 }}
                            onClick={() => setMafia(current + 1)}
                            disabled={current >= max}
                            aria-label="More Mafia"
                          >+</button>
                        </div>
                        <div className="mc-hint" style={{ marginTop: 6 }}>
                          Default {def} · min 1 · max {max}. Extra goons swap in for civilians.
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ color: "var(--blood-bright)", fontSize: 12, minHeight: 16 }}>{setupErr}</div>
                <button className="mc-primary-btn" onClick={startFromTitle}>
                  Open the Files
                </button>
                <button className="mc-ghost-btn" onClick={openPreview}>
                  Inspect a Sample Dossier
                </button>
              </div>
          )}

              {screen === "leaderboard" && <LeaderboardScreen />}

              {screen === "shop" && (
                <ShopScreen
                  themeId={themeId}
                  selectTheme={selectTheme}
                  isPremium={isPremium}
                  purchasing={purchasing}
                  purchaseMsg={purchaseMsg}
                  onPurchase={handlePurchasePremium}
                />
              )}

              {screen === "settings" && (
                <SettingsScreen
                  roleSettings={roleSettings}
                  setRoleSettings={setRoleSettings}
                  addonSettings={addonSettings}
                  setAddonSettings={setAddonSettings}
                  cardSettings={cardSettings}
                  toggleCard={toggleCard}
                  addCustomCard={addCustomCard}
                  removeCustomCard={removeCustomCard}
                  onDone={settingsDone}
                  onReset={settingsReset}
                  themeId={themeId}
                  selectTheme={selectTheme}
                  isPremium={isPremium}
                  onToggleSimulatedPremium={toggleSimulatedPremium}
                  onExportBackup={exportBackupToFile}
                  onImportFileChosen={onImportFileChosen}
                  fileInputRef={fileInputRef}
                  importMsg={importMsg}
                />
              )}

              {screen === "nameEntry" && (
                <div className="mc-screen" style={{ justifyContent: "center", textAlign: "center" }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    {Array.from({ length: state.n }).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: idx <= neIdx ? "var(--brass)" : "var(--paper-dim)",
                          opacity: idx <= neIdx ? 1 : 0.3,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--smoke-dim)" }}>
                    {editingFromReview ? `EDITING PLAYER ${neIdx + 1}` : `PLAYER ${neIdx + 1} OF ${state.n}`}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div className="mc-eyebrow">Pass the phone to this player</div>
                    <input
                      ref={neInputRef}
                      className="mc-big-input"
                      type="text"
                      maxLength={24}
                      autoComplete="off"
                      placeholder="Type your name"
                      value={neInput}
                      onChange={(e) => setNeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmNameEntry();
                        }
                      }}
                    />
                  </div>
                  <div style={{ color: "var(--blood-bright)", fontSize: 12, minHeight: 16 }}>{neErr}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="mc-ghost-btn"
                      style={{ flex: 1, visibility: editingFromReview || neIdx > 0 ? "visible" : "hidden" }}
                      onClick={neBack}
                    >
                      {editingFromReview ? "Cancel" : "Back"}
                    </button>
                    <button className="mc-primary-btn" style={{ flex: 1 }} onClick={confirmNameEntry}>
                      {editingFromReview ? "Save" : neIdx === state.n - 1 ? "Review the list" : "Next player"}
                    </button>
                  </div>
                  <div className="mc-hint">Type your own name, then hand the phone onward. Case files go out in this exact order.</div>
                </div>
              )}

              {screen === "nameReview" && (
                <div className="mc-screen" style={{ gap: 16 }}>
                  <div>
                    <div className="mc-eyebrow">Godfather's check</div>
                    <h2>Confirm the order</h2>
                    <div className="mc-hint">
                      Tap a name to fix a typo, or use the arrows to reorder. Case files go out top to bottom.
                    </div>
                  </div>
                  <div className="mc-file-card" style={{ textAlign: "left" }}>
                    <div>
                      {state.names.map((name, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "9px 0",
                            borderBottom: i === state.names.length - 1 ? "none" : "1px solid var(--paper-dim)",
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--smoke-dim)", width: 18, flexShrink: 0 }}>
                            {i + 1}.
                          </span>
                          <span
                            onClick={() => editNameFromReview(i)}
                            style={{
                              flex: 1,
                              fontSize: 15,
                              color: "#2a2620",
                              cursor: "pointer",
                              padding: "4px 6px",
                              borderRadius: 3,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {name}
                            <span style={{ fontSize: 11, opacity: 0.5 }}>✎</span>
                          </span>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              aria-label="Move up"
                              onClick={() => reorderName(i, -1)}
                              disabled={i === 0}
                              style={arrowBtnStyle(i === 0)}
                            >
                              ▲
                            </button>
                            <button
                              aria-label="Move down"
                              onClick={() => reorderName(i, 1)}
                              disabled={i === state.names.length - 1}
                              style={arrowBtnStyle(i === state.names.length - 1)}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      ))}
                      <div style={{ fontSize: 10.5, color: "var(--smoke-dim)", fontStyle: "italic", marginTop: 2 }}>
                        Tap any name to fix a typo.
                      </div>
                    </div>
                  </div>
                  <div className="mc-file-card" style={{ textAlign: "left" }}>
                    <div className="mc-file-label">Godfather</div>


                    <Select
                      value={state.godfatherChoice ?? "__random__"}
                      onValueChange={(v) => setState((s) => ({ ...s, godfatherChoice: v === "__random__" ? null : v }))}
                    >
                      <SelectTrigger className="mc-gf-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__random__">Random (recommended)</SelectItem>
                        {state.names.map((n) => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div style={{ fontSize: 10.5, color: "var(--smoke-dim)", fontStyle: "italic", marginTop: 6 }}>
                      Leave it on Random unless someone specific needs to run tonight's game.
                    </div>
                  </div>
                  <button className="mc-primary-btn" onClick={finalizeAssignments}>
                    Deal the case files
                  </button>
                </div>
              )}

              {screen === "pass" && currentAssign && (
                <div className="mc-screen" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 26 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.3em", color: "var(--smoke)" }}>
                      FILE {state.idx + 1} OF {state.n}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 40, color: "var(--paper)" }}>{currentAssign.name}</div>
                  </div>
                  <Seal onComplete={onSealBreak} />
                  <div style={{ color: "var(--smoke)", fontSize: 12.5, maxWidth: 280, lineHeight: 1.6 }}>
                    {isLastReveal ? (
                      <>
                        This is the last personal case file to go out. Make sure only <b style={{ color: "var(--paper)" }}>{currentAssign.name}</b> can
                        see the screen before breaking the seal — once it's sealed, whoever's the Godfather takes over.
                      </>
                    ) : (
                      <>
                        Make sure only <b style={{ color: "var(--paper)" }}>{currentAssign.name}</b> can see the screen before breaking the seal.
                      </>
                    )}
                  </div>
                </div>
              )}

              {screen === "reveal" && currentAssign && (
                <div className="mc-screen" style={{ justifyContent: "flex-start", gap: 16 }}>
                  <div className="mc-file-card">
                    <div className="mc-stamp">{previewMode ? "SAMPLE" : "CONFIDENTIAL"}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.2em", color: "var(--smoke-dim)", textTransform: "uppercase" }}>
                      {previewMode ? "Preview — not a real deal" : "Your role"}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--blood)", margin: "4px 0 10px", textTransform: "uppercase" }}>
                      {currentAssign.role}
                    </div>
                    <div
                      className="mc-file-text"
                      style={{
                        borderLeft: "2px solid var(--blood)",
                        paddingLeft: 10,
                        marginTop: 4,
                      }}
                    >
                      {ROLE_INFO[currentAssign.role]}
                    </div>
                    <div className="mc-file-divider" />
                    <div className="mc-file-label">
                      Your action card <span style={{ color: "var(--smoke-dim)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(one-time use)</span>
                    </div>
                    {currentAssign.card ? (
                      <>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#2a2620" }}>{currentAssign.card[0]}</div>
                        <div className="mc-file-text">{currentAssign.card[1]}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#2a2620" }}>— none —</div>
                        <div className="mc-file-text">
                          Only the Godfather has no action card. If that's you, remember it — you'll break the final seal once every file is out.
                        </div>
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      background: previewMode || isLastReveal ? "var(--ink-2)" : "var(--blood)",
                      border: `1px solid ${previewMode || isLastReveal ? "var(--blood)" : "var(--blood-bright)"}`,
                      borderRadius: 4,
                      padding: "10px 12px",
                      fontSize: 11.5,
                      fontWeight: previewMode || isLastReveal ? 400 : 600,
                      color: "var(--paper)",
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span>⚠</span>
                    <span>
                      {previewMode
                        ? "This is a sample file. It won't count toward any game."
                        : isLastReveal
                          ? "That's everyone. If you're the Godfather, take the phone — you'll break the final seal next."
                          : "Memorize this, then seal it. Don't say it out loud."}
                    </span>
                  </div>
                  <button className="mc-primary-btn" onClick={onSealAgain}>
                    {previewMode
                      ? "Done previewing — back to setup"
                      : isLastReveal
                        ? "Seal file — every player has one now"
                        : "Seal file & pass to next player"}
                  </button>
                </div>
              )}

              {screen === "finalSeal" && (
                <div className="mc-screen" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 26 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.3em", color: "var(--smoke)" }}>
                      FINAL SEAL
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 40, color: "var(--paper)" }}>Godfather</div>
                  </div>
                  <Seal onComplete={onFinalSealBreak} />
                  <div style={{ color: "var(--smoke)", fontSize: 12.5, maxWidth: 280, lineHeight: 1.6 }}>
                    Every player now has their own case file.{" "}
                    <b style={{ color: "var(--paper)" }}>Whoever is the Godfather, reveal yourself and take the phone</b> — only you should see what's behind this seal.
                  </div>
                </div>
              )}

              {screen === "dashboard" && (
                <div className="mc-screen" style={{ gap: 10, height: "calc(100dvh - 100px)", overflow: "hidden" }}>
                  <div style={{ flexShrink: 0 }}>
                    <div className="mc-eyebrow">For the Godfather's eyes only</div>
                    <h2>Master File</h2>
                  </div>
                  <div className="mc-file-card" style={{ textAlign: "center", flexShrink: 0 }}>
                    <div className="mc-file-label" style={{ textAlign: "center" }}>Current phase</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--brass)", letterSpacing: "0.1em", textAlign: "center", margin: "2px 0 10px" }}>
                      {state.phase === "night" ? "NIGHT" : "DAY"} {state.round}
                    </div>
                    <button className="mc-ghost-btn" style={{ width: "100%", color: "#2a2620", borderColor: "#8a8474" }} onClick={advancePhase}>
                      {state.phase === "night" ? "Move to Day" : "Move to Night"}
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {(
                      [
                        { id: "roster" as const, label: "Roster & Vote" },
                        { id: "tools" as const, label: "Doctor & Timer" },
                        ...(nightScript ? [{ id: "script" as const, label: "Script" }] : []),
                      ]
                    ).map((t) => (
                      <button
                        key={t.id}
                        className="mc-ghost-btn"
                        style={{
                          flex: 1,
                          fontSize: 11,
                          padding: "8px 4px",
                          color: dashTab === t.id ? "var(--paper)" : "#2a2620",
                          background: dashTab === t.id ? "var(--blood)" : "transparent",
                          borderColor: dashTab === t.id ? "var(--blood)" : "#8a8474",
                        }}
                        onClick={() => setDashTab(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                    {dashTab === "roster" && (
                      <div className="mc-file-card">
                        <div className="mc-file-label">Master roster</div>
                        <table className="mc-roster">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Role</th>
                              <th>Action card</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.assignments.map((a, i) => (
                              <tr
                                key={i}
                                onClick={() => setDetailModal(a)}
                                style={{ opacity: a.alive === false ? 0.45 : 1, cursor: "pointer" }}
                              >
                                <td>
                                  {a.alive === false ? (
                                    <>
                                      <span style={{ textDecoration: "line-through" }}>{a.name}</span> ☠
                                    </>
                                  ) : (
                                    a.name
                                  )}
                                </td>
                                <td className={ALIGNMENT[a.role] === "mafia" ? "mc-role-mafia" : "mc-role-normal"}>{a.role}</td>
                                <td>{a.card ? a.card[0] : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ fontSize: 10.5, color: "var(--smoke-dim)", marginTop: 6, fontStyle: "italic" }}>
                          Tap any row to read that role's full description. Eliminated players stay listed, struck through.
                        </div>

                        <div className="mc-file-divider" />
                        <div className="mc-file-label">
                          {state.phase === "night" ? "Night action — who was eliminated?" : "Day vote — who was voted out?"}
                        </div>
                        <select className="mc-gf-select" value={eliminatePick} onChange={(e) => setEliminatePick(e.target.value)}>
                          {aliveNoGf.map((a) => (
                            <option key={a.name} value={a.name}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                          <button
                            className="mc-ghost-btn"
                            style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }}
                            disabled={!aliveNoGf.length}
                            onClick={() =>
                              state.phase === "night"
                                ? announce("No one was eliminated", "The night passed without a kill.")
                                : announce("No one was voted out", "The vote didn't reach a majority.")
                            }
                          >
                            No one this round
                          </button>
                          <button
                            className="mc-primary-btn"
                            style={{ flex: 2 }}
                            disabled={!aliveNoGf.length}
                            onClick={() => eliminatePick && eliminatePlayer(eliminatePick)}
                          >
                            Confirm
                          </button>
                        </div>
                        <button
                          className="mc-ghost-btn"
                          style={{ width: "100%", marginTop: 8, color: "#2a2620", borderColor: "#8a8474" }}
                          disabled={!state.eliminationLog.length}
                          title="Undo the most recent elimination — for a mis-tap"
                          onClick={undoLastElimination}
                        >
                          Undo last elimination
                        </button>
                        <div style={{ fontSize: 11.5, color: "var(--smoke-dim)", marginTop: 8, fontStyle: "italic" }}>{winHint}</div>
                      </div>
                    )}

                    {dashTab === "tools" && (
                      <>
                        {hasDoctor && (
                          <div className="mc-file-card">
                            <div className="mc-file-label" style={{ marginTop: 0 }}>Doctor saves used</div>
                            <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "6px 0 4px" }}>
                              {Array.from({ length: doctorMax }).map((_, i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    background: i < state.doctorSavesUsed ? "var(--blood)" : "transparent",
                                    border: "2px solid var(--blood)",
                                  }}
                                />
                              ))}
                            </div>
                            <div style={{ textAlign: "center", fontSize: 11, color: "var(--smoke-dim)", marginBottom: 6 }}>
                              {state.doctorSavesUsed} of {doctorMax} saves used
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                              <button
                                className="mc-ghost-btn"
                                style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474", visibility: state.doctorSavesUsed > 0 ? "visible" : "hidden" }}
                                onClick={() => setState((s) => ({ ...s, doctorSavesUsed: Math.max(0, s.doctorSavesUsed - 1) }))}
                              >
                                −1
                              </button>
                              <button
                                className="mc-primary-btn"
                                style={{ flex: 2 }}
                                disabled={state.doctorSavesUsed >= doctorMax}
                                onClick={() => setState((s) => ({ ...s, doctorSavesUsed: Math.min(doctorMax, s.doctorSavesUsed + 1) }))}
                              >
                                Doctor used a save
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="mc-file-card">
                          <div className="mc-file-label" style={{ marginTop: 0 }}>Day Phase discussion timer</div>
                          <div className={`mc-timer-display ${!timerRunning && timerRemaining <= 0 ? "mc-timer-done" : ""}`}>{timerText}</div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            {[60, 120, 180].map((secs) => (
                              <button
                                key={secs}
                                onClick={() => setTimerPreset(secs)}
                                style={{
                                  flex: 1,
                                  padding: "9px 6px",
                                  fontSize: 11,
                                  fontFamily: "var(--font-display)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.1em",
                                  borderRadius: 3,
                                  cursor: "pointer",
                                  border: `1px solid ${timerTotal === secs ? "var(--blood)" : "#8a8474"}`,
                                  background: timerTotal === secs ? "var(--blood)" : "transparent",
                                  color: timerTotal === secs ? "var(--paper)" : "#2a2620",
                                }}
                              >
                                {secs / 60} min
                              </button>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 10 }}>
                            <button className="mc-primary-btn" style={{ flex: 2 }} onClick={() => (timerRunning ? pauseTimer() : startTimer())}>
                              {timerRunning ? "Pause" : "Start"}
                            </button>
                            <button className="mc-ghost-btn" style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }} onClick={resetTimer}>
                              Reset
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {dashTab === "script" && nightScript && (
                      <>
                        <button
                          className="mc-ghost-btn"
                          onClick={narrating ? stopNarration : startNarration}
                          title={isPremium ? undefined : "Premium feature — see Settings"}
                        >
                          {narrating ? "■ Stop narration" : `▶ Auto-narrate night script${isPremium ? "" : " 🔒"}`}
                        </button>
                        <NightScriptStepper steps={nightScript} resetKey={state.round} />
                      </>
                    )}
                  </div>

                  <button className="mc-primary-btn" style={{ flexShrink: 0 }} onClick={() => setWinnerModal(true)}>
                    Declare winner & end game
                  </button>
                </div>
              )}

              {screen === "gameOver" && (
                <div className="mc-screen" style={{ gap: 18 }}>
                  <div>
                    <div className="mc-eyebrow" style={{ textAlign: "center" }}>Every file is sealed</div>
                    <div style={{ fontSize: 26, textAlign: "center", color: "var(--paper)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {state.lastWinnerSide === "town" ? "THE TOWN WINS" : "THE MAFIA WINS"}
                    </div>
                    <div style={{ textAlign: "center", fontSize: 11, color: "var(--smoke-dim)" }}>
                      Recorded {state.lastGameTime}
                    </div>
                  </div>
                  <div className="mc-file-card">
                    <div className="mc-file-label">Final roster</div>
                    <table className="mc-roster">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Role</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.assignments.map((a) => {
                          const align = ALIGNMENT[a.role];
                          const result = align === "neutral" ? "—" : align === state.lastWinnerSide ? "Won" : "Lost";
                          return (
                            <tr key={a.name}>
                              <td>{a.name}</td>
                              <td className={align === "mafia" ? "mc-role-mafia" : "mc-role-normal"}>{a.role}</td>
                              <td>{result}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mc-file-card">
                    <div className="mc-file-label">Scoreboard — saved on this device</div>
                    <Scoreboard />
                    <div
                      style={{ fontSize: 10.5, color: "var(--smoke-dim)", marginTop: 6, fontStyle: "italic", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setClearScoreModal(true)}
                    >
                      Wipe the scoreboard on this device
                    </div>
                  </div>
                  <button className="mc-ghost-btn" onClick={doShareResult}>
                    Share results
                  </button>
                  {shareMsg && (
                    <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--brass)", marginTop: -10 }}>{shareMsg}</div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="mc-ghost-btn" style={{ flex: 1 }} onClick={finalizeAssignments}>
                      Replay — same players
                    </button>
                    <button className="mc-primary-btn" style={{ flex: 1 }} onClick={startNewGameFromGameOver}>
                      Start new game
                    </button>
                  </div>
                  <div style={{ textAlign: "center", color: "var(--smoke-dim)", fontSize: 10.5, marginTop: "auto", paddingTop: 24, letterSpacing: "0.06em" }}>
                    Case records stay on this device — nothing leaves the precinct.
                  </div>
                </div>
              )}
            </div>
      </div>

        {showBottomNav && <BottomNav active={screen} onNavigate={setScreen} />}

        {/* Modals */}
        <Modal open={!!announceMsg} onClose={() => { setAnnounceMsg(null); cancelSpeech(); }}>
          <h2 style={{ fontSize: 20, color: "var(--blood)", marginBottom: 4, textAlign: "center" }}>{announceMsg?.head}</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6, textAlign: "center" }}>{announceMsg?.sub}</p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
            <button className="mc-primary-btn" onClick={() => { setAnnounceMsg(null); cancelSpeech(); }}>
              Continue
            </button>
          </div>
        </Modal>

        <Modal open={showInfo} onClose={() => setShowInfo(false)}>
          <InfoContent />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button className="mc-primary-btn" onClick={() => setShowInfo(false)}>Close</button>
          </div>
        </Modal>

        <Modal open={!!detailModal} onClose={() => setDetailModal(null)}>
          {detailModal && (
            <>
              <h2 style={{ fontSize: 20, color: "var(--blood)" }}>{detailModal.role}</h2>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}><b>{detailModal.name}</b></p>
              <ModalDivider />
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>{ROLE_INFO[detailModal.role]}</p>
              {detailModal.card ? (
                <>
                  <ModalDivider />
                  <h3 style={{ fontSize: 13, color: "var(--blood)", margin: "16px 0 4px" }}>
                    Action card — {detailModal.card[0]}
                  </h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>{detailModal.card[1]}</p>
                </>
              ) : (
                <>
                  <ModalDivider />
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>No action card.</p>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                <button className="mc-primary-btn" onClick={() => setDetailModal(null)}>Close</button>
              </div>
            </>
          )}
        </Modal>

        <Modal open={showConfirmReset} onClose={() => setShowConfirmReset(false)}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Open a new case?</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            Every name and case file currently in play gets shredded — the scoreboard downstairs stays on file. There's no undo once you pull the pin.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="mc-ghost-btn" style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }} onClick={() => setShowConfirmReset(false)}>
              Cancel
            </button>
            <button className="mc-primary-btn" style={{ flex: 1 }} onClick={() => { setShowConfirmReset(false); doReset(); }}>
              Start over
            </button>
          </div>
        </Modal>

        <Modal open={showResume} dismissOnBackdrop={false}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Case still open</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            A game got interrupted before it was closed out — looks like a refresh or a phone lock cut it off mid-pass. Pick up exactly where it left off, or shred it and start clean.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              className="mc-ghost-btn"
              style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }}
              onClick={() => { clearLive(); setShowResume(false); setPendingResume(null); }}
            >
              Discard it
            </button>
            <button className="mc-primary-btn" style={{ flex: 1 }} onClick={resumeLiveGame}>
              Resume case
            </button>
          </div>
        </Modal>

        <Modal open={winnerModal} onClose={() => setWinnerModal(false)}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Who won the city?</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            Closing the case updates every player's file on the scoreboard. Make sure the table's settled before you call it.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            <button className="mc-primary-btn" style={{ padding: "18px 20px", fontSize: 16 }} onClick={() => finishGame("town")}>
              The Town wins
            </button>
            <button className="mc-primary-btn" style={{ padding: "18px 20px", fontSize: 16, background: "#232025" }} onClick={() => finishGame("mafia")}>
              The Mafia wins
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button className="mc-ghost-btn" style={{ color: "#2a2620", borderColor: "#8a8474" }} onClick={() => setWinnerModal(false)}>
              Cancel
            </button>
          </div>
        </Modal>

        <Modal open={clearScoreModal} onClose={() => setClearScoreModal(false)}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Wipe the scoreboard?</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            This erases every win, loss, and game count saved on this device — not just tonight's. Case files currently in play are untouched. There's no undo.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              className="mc-ghost-btn"
              style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }}
              onClick={() => setClearScoreModal(false)}
            >
              Cancel
            </button>
            <button
              className="mc-primary-btn"
              style={{ flex: 1 }}
              onClick={() => {
                saveScores({});
                setClearScoreModal(false);
              }}
            >
              Wipe it
            </button>
          </div>
        </Modal>
        <Modal open={showHistory} onClose={() => setShowHistory(false)}>
          <HistoryPanel />
        </Modal>

        {/* Phase 2 modals */}
        <Modal open={showPremiumPrompt} onClose={() => setShowPremiumPrompt(false)}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Unlock premium</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            A one-time purchase unlocks extra themes and auto-narration, and removes ads for good. No subscription.
          </p>
          {purchaseMsg && (
            <p style={{ fontSize: 12, color: "var(--blood-bright)", marginTop: 6 }}>{purchaseMsg}</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            <button className="mc-primary-btn" onClick={handlePurchasePremium} disabled={purchasing}>
              {purchasing ? "Processing…" : "Unlock premium"}
            </button>
            <button
              className="mc-ghost-btn"
              style={{ color: "#2a2620", borderColor: "#8a8474" }}
              onClick={() => setShowPremiumPrompt(false)}
            >
              Not now
            </button>
          </div>
        </Modal>

        <Modal open={showReviewPrompt} onClose={() => dismissReviewPrompt(false)}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Enjoying Mafia City?</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            If it's been useful for game night, a quick rating on the Play Store helps other hosts find it.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            <button className="mc-primary-btn" onClick={openPlayStore}>Rate on Play Store</button>
            <button
              className="mc-ghost-btn"
              style={{ color: "#2a2620", borderColor: "#8a8474" }}
              onClick={() => dismissReviewPrompt(false)}
            >
              Maybe later
            </button>
            <button
              style={{
                background: "none",
                border: "none",
                color: "var(--smoke-dim)",
                fontSize: 11.5,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 4,
              }}
              onClick={() => dismissReviewPrompt(true)}
            >
              Don't ask again
            </button>
          </div>
        </Modal>

        <Modal open={showResetConfirm} onClose={() => setShowResetConfirm(false)}>
          <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Reset to defaults?</h2>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            This clears your custom roles, add-ons, and action cards. There's no undo.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="mc-ghost-btn" style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }} onClick={() => setShowResetConfirm(false)}>
              Cancel
            </button>
            <button className="mc-primary-btn" style={{ flex: 1 }} onClick={() => { props.onReset(); setShowResetConfirm(false); }}>
              Reset
            </button>
          </div>
        </Modal>
      </div>
      );
}

      function arrowBtnStyle(disabled: boolean): React.CSSProperties {
  return {
        width: 34,
      height: 34,
      borderRadius: 4,
      border: "1px solid #8a8474",
      background: "transparent",
      color: "#2a2620",
      fontSize: 12,
      cursor: disabled ? "not-allowed" : "pointer",
      padding: 0,
      opacity: disabled ? 0.25 : 1,
      transition: "transform 0.1s ease",
  };
}

      function NightScriptStepper({
        steps,
        resetKey,
}: {
        steps: {head: string; say: string; body: string }[];
      resetKey: number;
}) {
  const [i, setI] = useState(0);
      const [showFull, setShowFull] = useState(false);
  useEffect(() => setI(0), [resetKey]);

      if (showFull) {
    return (
      <div className="mc-script-box">
        {steps.map((step, idx) => (
          <div key={idx} style={{ marginBottom: idx === steps.length - 1 ? 0 : 14 }}>
            <span className="mc-script-step">{step.head}</span>
            <div style={{ fontStyle: "italic", color: "var(--paper)", margin: "2px 0 4px" }}>"{step.say}"</div>
            {step.body}
          </div>
        ))}
        <button className="mc-ghost-btn" style={{ width: "100%", marginTop: 12 }} onClick={() => setShowFull(false)}>
          Switch to step-by-step
        </button>
      </div>
      );
  }

      const step = steps[i];
      return (
      <div className="mc-script-box">
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{ flex: 1, height: 4, borderRadius: 2, background: idx <= i ? "var(--brass)" : "var(--smoke-dim)" }}
            />
          ))}
        </div>
        <span className="mc-script-step">{step.head}</span>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--paper)", margin: "8px 0", lineHeight: 1.4 }}>
          "{step.say}"
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--smoke)" }}>{step.body}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="mc-ghost-btn" disabled={i === 0} onClick={() => setI((n) => n - 1)}>
            Back
          </button>
          <button
            className="mc-primary-btn"
            style={{ flex: 1 }}
            disabled={i === steps.length - 1}
            onClick={() => setI((n) => n + 1)}
          >
            {i === steps.length - 1 ? "Done for tonight" : "Next step"}
          </button>
        </div>
        <button className="mc-ghost-btn" style={{ width: "100%", marginTop: 8, fontSize: 10.5 }} onClick={() => setShowFull(true)}>
          View full script instead
        </button>
      </div>
      );
}

      function BottomNav({active, onNavigate}: {active: Screen; onNavigate: (s: Screen) => void }) {
  const tabs: {id: Screen; label: string; icon: string }[] = [
      {id: "title", label: "Play", icon: "🎭" },
      {id: "leaderboard", label: "Leaders", icon: "🏆" },
      {id: "shop", label: "Shop", icon: "🛍" },
      {id: "settings", label: "Settings", icon: "⚙" },
      ];
      return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          background: "var(--ink-2)",
          borderTop: "1px solid var(--smoke-dim)",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 40,
        }}
      >
        <div style={{ width: "100%", maxWidth: 440, display: "flex" }}>
          {tabs.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onNavigate(t.id)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  padding: "10px 4px 8px",
                  color: isActive ? "var(--brass)" : "var(--smoke)",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      );
}

      function LeaderboardScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
        setEntries(loadHistory());
  }, []);

      return (
      <div className="mc-screen" style={{ height: "calc(100dvh - 158px)", gap: 10 }}>
        <div style={{ flexShrink: 0 }}>
          <div className="mc-eyebrow">The Bureau's Records</div>
          <h2>Leaderboard</h2>
        </div>
        <Tabs defaultValue="scores" className="flex flex-col flex-1 min-h-0">
          <TabsList className="w-full grid grid-cols-2 flex-shrink-0">
            <TabsTrigger value="scores">Standings</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="scores" className="flex-1 min-h-0 overflow-y-auto mt-3">
            <div className="mc-file-card" style={{ textAlign: "left" }}>
              <Scoreboard />
            </div>
          </TabsContent>
          <TabsContent value="history" className="flex-1 min-h-0 overflow-y-auto mt-3">
            {entries.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--smoke)", fontStyle: "italic", textAlign: "center", marginTop: 20 }}>
                No games recorded yet. Finish a round and it'll appear here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {entries.map((e, i) => (
                  <div key={i} className="mc-file-card" style={{ textAlign: "left" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--smoke-dim)" }}>{new Date(e.date).toLocaleString()}</span>
                      <span style={{ fontSize: 12, color: e.winner === "town" ? "var(--brass)" : "var(--blood)", fontWeight: 700, letterSpacing: "0.1em" }}>
                        {e.winner === "town" ? "TOWN" : "MAFIA"} WON
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
                      {e.players.map((p, j) => (
                        <span key={j} style={{ padding: "2px 6px", border: "1px solid #8a8474", borderRadius: 3, background: p.won ? "rgba(184,134,11,0.15)" : "transparent" }}>
                          {p.name} <span style={{ color: "var(--smoke-dim)" }}>· {p.role}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      );
}

      function ShopScreen(props: {
        themeId: ThemeId;
  selectTheme: (id: ThemeId) => void;
      isPremium: boolean;
      purchasing: boolean;
      purchaseMsg: string | null;
  onPurchase: () => void;
}) {
  return (
      <div className="mc-screen" style={{ height: "calc(100dvh - 158px)", gap: 10 }}>
        <div style={{ flexShrink: 0 }}>
          <div className="mc-eyebrow">The Bureau's Vault</div>
          <h2>Shop</h2>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {!props.isPremium && (
            <div className="mc-file-card" style={{ textAlign: "left", border: "2px solid var(--brass)" }}>
              <div className="mc-file-label" style={{ marginTop: 0 }}>Premium Unlock</div>
              <p className="mc-file-text">
                One-time purchase. Unlocks every premium theme below, plus auto-narration for the night script. No subscription, ever.
              </p>
              {props.purchaseMsg && <p style={{ fontSize: 12, color: "var(--blood)" }}>{props.purchaseMsg}</p>}
              <button className="mc-primary-btn" style={{ width: "100%", marginTop: 8 }} onClick={props.onPurchase} disabled={props.purchasing}>
                {props.purchasing ? "Processing…" : "Unlock Premium"}
              </button>
            </div>
          )}
          <div className="mc-file-card" style={{ textAlign: "left" }}>
            <div className="mc-file-label" style={{ marginTop: 0 }}>Themes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                const t = THEMES[id];
                const active = props.themeId === id;
                const locked = t.premium && !props.isPremium;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={locked}
                    onClick={() => !locked && props.selectTheme(id)}
                    className="mc-ghost-btn"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#2a2620", borderColor: active ? "var(--blood)" : "#8a8474", opacity: locked ? 0.55 : 1 }}
                  >
                    <span>{t.label}{active ? " ✓" : ""}</span>
                    {t.premium && (
                      <span style={{ fontSize: 10, color: "var(--brass)", letterSpacing: "0.08em" }}>
                        {props.isPremium ? "UNLOCKED" : "🔒 PREMIUM"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      );
}

      function Scoreboard() {
  const [scores, setScores] = useState(() => loadScores());
  useEffect(() => {
        setScores(loadScores());
  }, []);
      const rows = Object.entries(scores)
    .map(([name, s]) => ({name, ...s }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games);
      return (
      <table className="mc-roster">
        <thead>
          <tr>
            <th>Name</th>
            <th>W</th>
            <th>L</th>
            <th>Games</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{r.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
      );
}

      function SettingsScreen(props: {
        roleSettings: RoleSettings;
      setRoleSettings: React.Dispatch<React.SetStateAction<RoleSettings>>;
        addonSettings: AddonSettings;
        setAddonSettings: React.Dispatch<React.SetStateAction<AddonSettings>>;
          cardSettings: CardSettings;
  toggleCard: (name: string, on: boolean) => void;
  addCustomCard: (name: string, desc: string) => boolean;
  removeCustomCard: (name: string) => void;
  onDone: () => void;
  onReset: () => void;
          themeId: ThemeId;
  selectTheme: (id: ThemeId) => void;
          isPremium: boolean;
  onToggleSimulatedPremium: (v: boolean) => void;
  onExportBackup: () => void;
          onImportFileChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
            fileInputRef: React.RefObject<HTMLInputElement>;
              importMsg: string | null;
}) {
  const [name, setName] = useState("");
              const [desc, setDesc] = useState("");
              const allCards = ACTION_CARDS.concat(props.cardSettings.custom);
              return (
              <div className="mc-screen" style={{ height: "calc(100dvh - 100px)", overflow: "hidden", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
                  <div>
                    <div className="mc-eyebrow">Settings</div>
                    <h2>Roles &amp; action cards</h2>
                    <div className="mc-hint">Saved on this device — every game uses this setup until you change it again.</div>
                  </div>
                  <button className="mc-icon-btn" style={{ flexShrink: 0 }} aria-label="Close settings" title="Close" onClick={props.onDone}>
                    ✕
                  </button>
                </div>
                <div className="mc-file-card" style={{ textAlign: "left" }}>
                  <div className="mc-file-label">Optional roles</div>
                  <div>
                    {OPTIONAL_ROLES.map((role) => (
                      <label key={role} style={toggleRowStyle}>
                        <input
                          type="checkbox"
                          checked={props.roleSettings[role]}
                          onChange={(e) => props.setRoleSettings((rs) => ({ ...rs, [role]: e.target.checked }))}
                          style={{ width: 18, height: 18, accentColor: "var(--blood)", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1 }}>{role}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--smoke-dim)", marginTop: 6, fontStyle: "italic" }}>
                    Godfather and Mafia are always in play. Turning a role off folds its slot(s) into Civilian instead.
                  </div>
                </div>
                <div className="mc-file-card" style={{ textAlign: "left" }}>
                  <div className="mc-file-label">Add-on roles (experimental)</div>
                  <div>
                    {ADDON_ROLES.map((role) => (
                      <label key={role} style={toggleRowStyle}>
                        <input
                          type="checkbox"
                          checked={props.addonSettings[role]}
                          onChange={(e) => props.setAddonSettings((rs) => ({ ...rs, [role]: e.target.checked }))}
                          style={{ width: 18, height: 18, accentColor: "var(--blood)", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1 }}>
                          {role === "SerialKiller" ? "Serial Killer" : role}
                          <span style={{ display: "block", fontSize: 10.5, color: "var(--smoke-dim)", fontStyle: "italic", marginTop: 2 }}>
                            {ROLE_INFO[role]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--smoke-dim)", marginTop: 6, fontStyle: "italic" }}>
                    Each add-on takes a Civilian slot. Requires at least one Civilian in the current lineup.
                  </div>
                </div>

                {/* Phase 1: backup & restore */}
                <div className="mc-file-card" style={{ textAlign: "left" }}>
                  <div className="mc-file-label">Backup &amp; restore</div>
                  <div className="mc-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                    Save your scoreboard, history, and settings to a file — or restore them after switching phones.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="mc-ghost-btn"
                      style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }}
                      onClick={props.onExportBackup}
                    >
                      Export backup
                    </button>
                    <button
                      className="mc-ghost-btn"
                      style={{ flex: 1, color: "#2a2620", borderColor: "#8a8474" }}
                      onClick={() => props.fileInputRef.current?.click()}
                    >
                      Import backup
                    </button>
                  </div>
                  <input
                    ref={props.fileInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={props.onImportFileChosen}
                  />
                  {props.importMsg && (
                    <div style={{ fontSize: 11.5, color: "var(--blood)", marginTop: 8 }}>{props.importMsg}</div>
                  )}
                </div>

                {/* Dev-only toggle — automatically stripped from production builds */}
                {import.meta.env.DEV && (
                  <div className="mc-file-card" style={{ textAlign: "left" }}>
                    <div className="mc-file-label">Developer</div>
                    <label style={toggleRowStyle}>
                      <input
                        type="checkbox"
                        checked={props.isPremium}
                        onChange={(e) => props.onToggleSimulatedPremium(e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: "var(--blood)", flexShrink: 0 }}
                      />
                      <span style={{ flex: 1 }}>
                        Simulate premium unlock
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--smoke-dim)", fontStyle: "italic", marginTop: 2 }}>
                          Dev builds only.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                <div className="mc-file-card" style={{ textAlign: "left" }}>
                  <div className="mc-file-label">Action cards in the deck</div>
                  <div>
                    {allCards.map(([cname]) => {
                      const isCustom = props.cardSettings.custom.some((c) => c[0] === cname);
                      const checked = !props.cardSettings.disabled.includes(cname);
                      return (
                        <label key={cname} style={toggleRowStyle}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => props.toggleCard(cname, e.target.checked)}
                            style={{ width: 18, height: 18, accentColor: "var(--blood)", flexShrink: 0 }}
                          />
                          <span style={{ flex: 1 }}>
                            {cname}
                            {isCustom ? " (custom)" : ""}
                          </span>
                          {isCustom && (
                            <button
                              type="button"
                              aria-label="Delete custom card"
                              onClick={() => props.removeCustomCard(cname)}
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                border: "1px solid #8a8474",
                                background: "transparent",
                                color: "#2a2620",
                                fontSize: 11,
                                cursor: "pointer",
                                padding: 0,
                                flexShrink: 0,
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="mc-file-divider" />
                  <div className="mc-file-label">Add a custom card</div>
                  <input
                    className="mc-big-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Card name"
                    maxLength={40}
                    style={{ fontSize: 14, padding: 10, marginBottom: 8, textAlign: "left" }}
                  />
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="What it does"
                    maxLength={200}
                    style={{
                      width: "100%",
                      background: "var(--ink-2)",
                      border: "1px solid var(--smoke-dim)",
                      color: "var(--paper)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      minHeight: 64,
                      resize: "vertical",
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: "var(--smoke-dim)", textAlign: "right", marginTop: 4 }}>
                    {desc.length}/200
                  </div>
                  <button
                    className="mc-ghost-btn"
                    style={{ marginTop: 10, color: "#2a2620", borderColor: "#8a8474" }}
                    onClick={() => {
                      if (props.addCustomCard(name, desc)) {
                        setName("");
                        setDesc("");
                      }
                    }}
                  >
                    Add card
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <button
                    className="mc-ghost-btn"
                    style={{ flex: 1, color: "var(--blood)", borderColor: "var(--blood)" }}
                    onClick={() => setShowResetConfirm(true)}>
                    Reset to defaults
                  </button>
                  <button className="mc-primary-btn" style={{ flex: 2 }} onClick={props.onDone}>
                    Save & back
                  </button>
                </div>
              </div>
              );
}

              const toggleRowStyle: React.CSSProperties = {
                display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid var(--paper-dim)",
              fontSize: 14,
              color: "#2a2620",
              cursor: "pointer",
};

              function InfoContent() {
  return (
              <Tabs defaultValue="howto">
                <h2 style={{ fontSize: 20, color: "var(--blood)", marginBottom: 10 }}>Rules & Help</h2>
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="howto">How to Play</TabsTrigger>
                  <TabsTrigger value="roles">Roles</TabsTrigger>
                  <TabsTrigger value="controls">Controls</TabsTrigger>
                </TabsList>

                <TabsContent value="howto">
                  <div className="mc-file-card" style={{ textAlign: "left", marginBottom: 14 }}>
                    <div className="mc-file-label" style={{ marginTop: 0 }}>Objective</div>
                    <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                      One phone deals secret roles to everyone at the table. <b>Town-aligned players</b> win by finding and
                      voting out the Mafia. <b>Mafia-aligned players</b> win by quietly surviving until they equal or
                      outnumber the Town. The Godfather runs the game and doesn't win or lose either way.
                    </p>
                  </div>
                  <h3 style={{ fontSize: 13, color: "var(--blood)" }}>1. Enter your player count</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    Type any number from 6 to 20 on the title screen. The exact mix of roles and the Doctor's number of saves are set automatically.
                  </p>
                  <h3 style={{ fontSize: 13, color: "var(--blood)" }}>2. Everyone types their own name</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    The phone is passed player to player. Each person types only their own name and taps "Next player". The order becomes the deal order.
                  </p>
                  <h3 style={{ fontSize: 13, color: "var(--blood)" }}>3. Confirm the order, then deal</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    Fix typos or reorder on the review screen — optionally pick a specific Godfather. Then case files go out one press-and-hold at a time.
                  </p>
                  <h3 style={{ fontSize: 13, color: "var(--blood)" }}>4. Final seal — Godfather only</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    After the last player has their file, one more seal appears. Whoever's Godfather reveals themselves and unlocks the dashboard.
                  </p>
                </TabsContent>

                <TabsContent value="roles">
                  <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20 }}>
                    {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
                      <li key={r} style={{ marginBottom: 8 }}>
                        <b>{r}</b> — {ROLE_INFO[r]}
                      </li>
                    ))}
                  </ul>
                </TabsContent>

                <TabsContent value="controls">
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    <b>☾</b> dim the screen for a dark room · <b>♪</b> mute sound/vibration · <b>☰</b> opens the menu, which holds Rules, Game History, Role/Card settings, and Start New Game.
                  </p>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    During the Night phase on the Godfather's dashboard, the script walks through one step at a time — tap "Next step" to advance, or "View full script instead" to see it all at once.
                  </p>
                </TabsContent>
              </Tabs>
              );
}

              function HistoryPanel() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
                setEntries(loadHistory());
  }, []);
  const wipe = () => {
    if (!window.confirm("Erase every recorded game on this device?")) return;
              clearHistory();
              setEntries([]);
  };
              return (
              <>
                <h2 style={{ fontSize: 20, color: "var(--blood)" }}>Game history</h2>
                <p style={{ fontSize: 12, color: "var(--smoke-dim)" }}>Last {entries.length} game{entries.length === 1 ? "" : "s"} on this device.</p>
                <ModalDivider />
                {entries.length === 0 && (
                  <p style={{ fontSize: 13, lineHeight: 1.6, fontStyle: "italic", color: "var(--smoke-dim)" }}>
                    No games recorded yet. Finish a round and it'll appear here.
                  </p>
                )}
                <div style={{ maxHeight: "50vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                  {entries.map((e, i) => (
                    <div key={i} className="mc-file-card" style={{ textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--smoke-dim)" }}>{new Date(e.date).toLocaleString()}</span>
                        <span style={{ fontSize: 12, color: e.winner === "town" ? "var(--brass)" : "var(--blood)", fontWeight: 700, letterSpacing: "0.1em" }}>
                          {e.winner === "town" ? "TOWN" : "MAFIA"} WON
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
                        {e.players.map((p, j) => (
                          <span key={j} style={{ padding: "2px 6px", border: "1px solid #8a8474", borderRadius: 3, background: p.won ? "rgba(184,134,11,0.15)" : "transparent" }}>
                            {p.name} <span style={{ color: "var(--smoke-dim)" }}>· {p.role}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {entries.length > 0 && (
                  <>
                    <ModalDivider />
                    <button className="mc-ghost-btn" style={{ width: "100%", color: "var(--blood)", borderColor: "var(--blood)" }} onClick={wipe}>
                      Erase history
                    </button>
                  </>
                )}
              </>
              );
}
