/**
 * The chime at the end of a sitting, made with Web Audio so no sound file ships.
 *
 * A phone only lets a page start sound from a tap, so the context is made (and
 * resumed) on the Start tap, held through the sitting, and played at the end.
 * Phone-only behaviour: not proven by a test, it waits on the owner's check
 * (RULES.md, Settled).
 */
export function makeAudio(): AudioContext | null {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    void ctx.resume?.();
    return ctx;
  } catch {
    return null;
  }
}

/** Three soft bell strikes, a fifth apart at the end, each ringing out for a few seconds. */
export function playChime(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    void ctx.resume?.();
    const strike = (freq: number, at: number, peak: number) => {
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 3.3);
    };
    strike(523.25, 0, 0.35);
    strike(783.99, 0.15, 0.18);
    strike(523.25, 2.2, 0.3);
  } catch {
    // No sound is not a failed sitting: the circle and the clock say it ended.
  }
}
