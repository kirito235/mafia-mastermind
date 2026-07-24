// WebAudio-based synth so the app stays 100% offline with no downloaded assets.
// Every effect gracefully no-ops when muted or when AudioContext is unavailable.

type Ctor = typeof AudioContext;
let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (_ctx) return _ctx;
    const C: Ctor | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!C) return null;
    _ctx = new C();
    return _ctx;
  } catch {
    return null;
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}

function tone(opts: {
  freq: number;
  endFreq?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + opts.dur);
  const peak = opts.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

export function sealBreakFeedback(muted: boolean) {
  if (muted) return;
  vibrate(35);
  tone({ freq: 160, endFreq: 60, dur: 0.22, type: "sine", gain: 0.22 });
}

export function timerBuzzer(muted: boolean) {
  if (muted) return;
  vibrate([120, 80, 120, 80, 120]);
  [0, 0.28, 0.56].forEach((d) => tone({ freq: 440, dur: 0.2, type: "square", gain: 0.12, delay: d }));
}

export function speak(text: string, muted: boolean) {
  if (muted) return;
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }
  } catch {}
}

export function cancelSpeech() {
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {}
}

export function announceBuzz(muted: boolean) {
  if (muted) return;
  vibrate([80, 60, 80]);
}

// ---- Phase 2: auto-narration mode ----
// Chains a list of lines through speechSynthesis with a pause between each,
// falling back to a timed delay when muted or unsupported so the Godfather
// dashboard can still advance a "narration" pace without audio. Cancellable
// via a module-level flag since SpeechSynthesisUtterance has no abort signal.
let _narrationCancelled = false;

export function speakSequence(
  lines: string[],
  muted: boolean,
  onDone: () => void,
  pauseMs = 900,
) {
  _narrationCancelled = false;
  let i = 0;

  const next = () => {
    if (_narrationCancelled || i >= lines.length) {
      onDone();
      return;
    }
    const line = lines[i];
    i += 1;

    if (muted || !("speechSynthesis" in window)) {
      window.setTimeout(next, 1600);
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.95;
      u.onend = () => window.setTimeout(next, pauseMs);
      u.onerror = () => window.setTimeout(next, pauseMs);
      window.speechSynthesis.speak(u);
    } catch {
      window.setTimeout(next, pauseMs);
    }
  };

  next();
}

export function cancelSpeakSequence() {
  _narrationCancelled = true;
  cancelSpeech();
}

// Role-specific reveal stingers — each role gets a signature short motif.
export function roleStinger(role: string, muted: boolean) {
  if (muted) return;
  switch (role) {
    case "Godfather":
      // Ominous bell + low drone
      tone({ freq: 220, dur: 1.2, type: "triangle", gain: 0.18 });
      tone({ freq: 110, dur: 1.4, type: "sine", gain: 0.14, delay: 0.05 });
      tone({ freq: 55, dur: 1.6, type: "sine", gain: 0.1, delay: 0.1 });
      break;
    case "Mafia":
      // Dark two-note sting
      tone({ freq: 180, dur: 0.35, type: "sawtooth", gain: 0.15 });
      tone({ freq: 90, endFreq: 60, dur: 0.6, type: "sawtooth", gain: 0.14, delay: 0.28 });
      break;
    case "Terrorist":
      // Tense buzzing pulse
      tone({ freq: 130, dur: 0.15, type: "square", gain: 0.12 });
      tone({ freq: 130, dur: 0.15, type: "square", gain: 0.12, delay: 0.2 });
      tone({ freq: 90, endFreq: 40, dur: 0.6, type: "square", gain: 0.14, delay: 0.4 });
      break;
    case "Detective":
      // Bright inquisitive chime
      tone({ freq: 660, dur: 0.18, type: "triangle", gain: 0.14 });
      tone({ freq: 880, dur: 0.28, type: "triangle", gain: 0.14, delay: 0.16 });
      break;
    case "Doctor":
      // Warm heart-pulse
      tone({ freq: 340, dur: 0.18, type: "sine", gain: 0.16 });
      tone({ freq: 340, dur: 0.18, type: "sine", gain: 0.16, delay: 0.25 });
      break;
    case "Jailer":
      // Iron-gate clang
      tone({ freq: 220, endFreq: 80, dur: 0.4, type: "square", gain: 0.14 });
      tone({ freq: 160, endFreq: 60, dur: 0.5, type: "sawtooth", gain: 0.12, delay: 0.05 });
      break;
    case "Vigilante":
      // Sharp gunshot-like snap
      tone({ freq: 900, endFreq: 90, dur: 0.18, type: "sawtooth", gain: 0.2 });
      break;
    case "Bodyguard":
      // Grounded protective chord
      tone({ freq: 261, dur: 0.5, type: "triangle", gain: 0.14 });
      tone({ freq: 329, dur: 0.5, type: "triangle", gain: 0.12, delay: 0.02 });
      break;
    case "SerialKiller":
      // Cold discordant slide
      tone({ freq: 480, endFreq: 120, dur: 0.7, type: "sawtooth", gain: 0.14 });
      tone({ freq: 500, endFreq: 130, dur: 0.7, type: "square", gain: 0.08, delay: 0.05 });
      break;
    case "Civilian":
    default:
      // Soft plain tone
      tone({ freq: 440, dur: 0.28, type: "sine", gain: 0.12 });
      break;
  }
}

// Phase transition cue (night <-> day)
export function phaseCue(to: "night" | "day", muted: boolean) {
  if (muted) return;
  if (to === "night") {
    tone({ freq: 220, endFreq: 90, dur: 0.9, type: "sine", gain: 0.15 });
    tone({ freq: 110, endFreq: 55, dur: 1.1, type: "triangle", gain: 0.1, delay: 0.05 });
  } else {
    tone({ freq: 330, dur: 0.35, type: "triangle", gain: 0.15 });
    tone({ freq: 494, dur: 0.35, type: "triangle", gain: 0.14, delay: 0.18 });
    tone({ freq: 660, dur: 0.5, type: "triangle", gain: 0.12, delay: 0.34 });
  }
}

// Godfather's bell on elimination
export function eliminationBell(muted: boolean) {
  if (muted) return;
  vibrate(60);
  tone({ freq: 520, endFreq: 260, dur: 1.2, type: "triangle", gain: 0.2 });
  tone({ freq: 260, endFreq: 130, dur: 1.4, type: "sine", gain: 0.14, delay: 0.02 });
}
