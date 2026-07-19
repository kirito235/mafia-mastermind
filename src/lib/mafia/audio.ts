export function sealBreakFeedback(muted: boolean) {
  if (muted) return;
  try {
    if (navigator.vibrate) navigator.vibrate(35);
  } catch {}
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch {}
}

export function timerBuzzer(muted: boolean) {
  if (muted) return;
  try {
    if (navigator.vibrate) navigator.vibrate([120, 80, 120, 80, 120]);
  } catch {}
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.28, 0.56].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(440, ctx.currentTime + offset);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.22);
    });
  } catch {}
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
  try {
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  } catch {}
}
