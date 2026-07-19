# Mafia City — Build Plan

## Strategy: why PWA-first even for a "native" app

You want Android native first, then App Store, then PWA. I'd flip that order for practical reasons, and you still end up with an Android app:

- **Your laptop specs matter.** Android Studio + emulators are heavy. Building a PWA needs only a browser.
- **Capacitor (the wrapper we'd use) reuses 100% of the PWA code.** Nothing is wasted. When you're ready for the Play Store, we run one command to wrap the PWA into a `.apk`/`.aab`. No rewrite.
- **iOS App Store submission requires a Mac + $99/yr Apple account.** Unavoidable. PWA-first defers that cost until you actually want it.
- **Testing on your phone is trivial with a PWA** — open a URL, tap "Add to Home Screen." No cables, no signing, no Play Console.

So the build order is: **PWA (works on your phone today) → Capacitor Android wrap (Play Store) → iOS (later, when you have Mac access).** You still get a real Android app.

---

## Phase 1 — Foundation & faithful React rebuild

Rebuild your existing HTML/JS as clean React components with the same visual design (Oswald + Courier Prime, blood/brass/paper palette, seal-hold reveal). No new features yet — get parity first so we know nothing regressed.

- Design tokens from your CSS variables → `src/styles.css` (ink, paper, blood, brass, smoke)
- Route structure (single route, screen state in a store — this is an app, not a website):
  - `/` — Title screen (with Preview, Settings, Rules access)
  - Screens as components driven by a Zustand store: `Title → NameEntry → Review → Reveal → FinalSeal → Dashboard → GameOver`
- Persistence: `localStorage` for settings, scoreboard, resume-in-progress (same as today)
- Service worker + `manifest.json` for installability (using Lovable's PWA skill — safe registration, no preview breakage)
- Screen wake lock, mute toggle, haptics, speech synthesis — direct ports
- Master role math (6–20 players), 16 built-in action cards, custom cards, Godfather pick, night script

**Deliverable:** you install it on your phone from a URL and it behaves like your current file.

---

## Phase 2 — Feature upgrades (the fun stuff)

Chosen from your priorities:

**Sound & atmosphere pack**
- Ambient night/day background loops (low-volume, mutable)
- Role-specific reveal stingers (Mafia sting, Detective chime, Doctor pulse, Civilian soft tone)
- Phase transition cues + Godfather bell for eliminations
- Optional voice-acted night script (pre-recorded lines, falls back to speech synthesis if muted/unavailable)
- All audio bundled and cached by the service worker → 100% offline

**More roles & variants**
- Add: Serial Killer (third faction), Vigilante (one-shot town kill), Lovers (linked win condition), Cult (converts players), Bodyguard, Mayor (double vote)
- Custom role builder: name, faction, night action, win condition — saved per device
- Preset "recipes": Classic, Chaos, Small Group (6–8), Big Group (15–20)

**Game history & stats**
- Full log of every past game: date, players, roles dealt, who won, elimination order
- Per-player: win rate overall, win rate as Mafia vs Town, favorite roles, longest survival streak
- Group leaderboard views, exportable as JSON (for backup before cloud sync exists)

---

## Phase 3 — Cloud sync (opt-in)

Enable Lovable Cloud. Everything remains fully offline-capable; cloud is additive.

- Optional account (email/password or Google)
- Sync scoreboard + game history across devices/groups
- "Group" concept: a saved player roster shared with a group code, so friends can pull the same scoreboard onto their phone
- Conflict resolution: last-write-wins per game record (games are append-only, so conflicts are rare)
- Anonymous mode still works — cloud is never required to play

---

## Phase 4 — Multi-phone mode (major)

Real-time, each player on their own phone. Big scope change, so it comes last.

- Host creates a room → 4-digit code
- Players join by code, enter their name on their own phone
- Roles delivered privately over the network (no more pass-the-phone)
- Godfather dashboard on host phone; players see only their own state + public announcements
- Requires: Lovable Cloud (Supabase Realtime channels), presence tracking, reconnect handling
- Pass-the-phone mode stays as a first-class option — some groups will always prefer it

---

## Phase 5 — Android app (Play Store)

- Wrap the PWA with **Capacitor** (one-time setup)
- Add native splash screen, adaptive launcher icon, proper Android permissions (wake lock, vibrate, audio)
- Build `.apk` for sideloading / testing on your phone
- Build signed `.aab` for Play Store upload
- Play Console listing: $25 one-time fee, ~1–3 day review
- iOS deferred until you have Mac access

---

## Additional features I'd recommend adding

Beyond your list, worth considering:

- **Godfather cheat sheet** — a permanent tab showing role interactions ("Detective checks Mafia → shows red, except Godfather → shows innocent") so the host doesn't need the rulebook
- **Auto-narration mode** — press one button, the app speaks the entire night script with timed pauses; Godfather just watches
- **Recap screen after each night** — "Night 2 summary: Priya was killed, Doctor saved Alex, Detective investigated Ben (Mafia)" — visible only to Godfather
- **Undo last action** — mis-tapped an elimination? One-tap revert
- **Big-text / one-handed mode** — for hosts holding drinks
- **Dark room mode** — extra-dim palette so the phone doesn't blind everyone during night phase
- **Photo per player** — take a quick selfie during name entry, use as avatar on reveal and scoreboard
- **Timer sound options** — silent, ticking, dramatic countdown
- **Kid-friendly reskin toggle** — "Werewolf Village" theme with softer palette and no "Terrorist" role

---

## Technical details (for reference)

- **Stack:** TanStack Start (React 19 + Vite 7) — already scaffolded
- **State:** Zustand for game state (screens, players, roles, phase), `localStorage` for persistence
- **Styling:** Tailwind v4 with your existing color tokens as CSS variables
- **PWA:** `vite-plugin-pwa` via Lovable's PWA skill (guarded registration — never runs in preview iframe)
- **Audio:** HTML5 Audio with preloaded assets; cached by service worker
- **Cloud (Phase 3+):** Lovable Cloud (Supabase) — auth, `game_history` + `players` tables with RLS
- **Native (Phase 5):** Capacitor 6, wraps the built PWA into Android WebView
- **No backend needed for Phases 1–2** — 100% client-side, offline-first

---

## What I need from you to start Phase 1

Approve this plan and I'll begin the React rebuild. I have your `index.html` and `sw.js` — I'll pull the game logic, role math, night script, and action cards straight from them so behavior matches exactly. Confirm the plan and I'll switch to build mode.
