/**
 * The contact tick — a short synthesized blip when a control meets a wall.
 * No audio files: one oscillator, one envelope. Off by default is wrong for
 * feel and on by default is rude, so it remembers what the owner chose.
 */

let ctx: AudioContext | null = null;
let enabled = readPref();

function readPref(): boolean {
  try {
    return localStorage.getItem('pkgprop.tick') !== 'off';
  } catch {
    return true;
  }
}

export function tickEnabled(): boolean {
  return enabled;
}

export function setTickEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem('pkgprop.tick', on ? 'on' : 'off');
  } catch {
    // A browser with storage blocked still gets the sound, just not the memory.
  }
}

export function tick(): void {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.03);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // Audio is a nicety; never let it break a drag.
  }
}
