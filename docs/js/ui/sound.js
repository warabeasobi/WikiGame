/* ui/sound.js — synthesised sound effects (no audio files needed, no autoplay
 * before a user gesture). Everything is generated with the Web Audio API.
 */

let ctx = null;
let master = null;
let enabled = true;
let volume = 0.6;
let unlocked = false;

const RECIPES = {
  start: [{ type: 'sine', from: 420, to: 720, dur: 0.16, gain: 0.5 }, { type: 'sine', from: 640, to: 980, dur: 0.2, gain: 0.35, delay: 0.1 }],
  navigate: [{ type: 'triangle', from: 520, to: 660, dur: 0.09, gain: 0.35 }],
  blocked: [{ type: 'square', from: 220, to: 140, dur: 0.12, gain: 0.22 }],
  hint: [{ type: 'sine', from: 700, to: 1180, dur: 0.18, gain: 0.4 }, { type: 'sine', from: 980, to: 1480, dur: 0.16, gain: 0.25, delay: 0.09 }],
  powerup: [{ type: 'triangle', from: 380, to: 900, dur: 0.22, gain: 0.4 }],
  win: [{ type: 'sine', from: 660, to: 990, dur: 0.16, gain: 0.5 }, { type: 'sine', from: 880, to: 1320, dur: 0.18, gain: 0.45, delay: 0.14 }, { type: 'sine', from: 1100, to: 1760, dur: 0.32, gain: 0.4, delay: 0.3 }],
  lose: [{ type: 'sawtooth', from: 300, to: 110, dur: 0.5, gain: 0.3 }],
  achievement: [{ type: 'sine', from: 880, to: 1320, dur: 0.12, gain: 0.4 }, { type: 'sine', from: 1180, to: 1580, dur: 0.24, gain: 0.35, delay: 0.12 }],
  levelup: [{ type: 'sine', from: 520, to: 1040, dur: 0.2, gain: 0.4 }, { type: 'sine', from: 780, to: 1560, dur: 0.3, gain: 0.35, delay: 0.16 }],
  tick: [{ type: 'square', from: 900, to: 900, dur: 0.03, gain: 0.12 }],
  warning: [{ type: 'square', from: 660, to: 660, dur: 0.08, gain: 0.25 }, { type: 'square', from: 520, to: 520, dur: 0.08, gain: 0.25, delay: 0.12 }],
  click: [{ type: 'sine', from: 440, to: 440, dur: 0.04, gain: 0.2 }],
  save: [{ type: 'sine', from: 700, to: 1000, dur: 0.1, gain: 0.3 }],
};

function ensureContext() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  } catch (err) {
    console.warn('[sound] audio unavailable', err);
    ctx = null;
  }
  return ctx;
}

/** Must be called from a user gesture at least once (autoplay policy). */
export function unlockAudio() {
  const c = ensureContext();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
  return true;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  if (master) master.gain.value = enabled ? volume : 0;
}

export function setVolume(value) {
  volume = Math.min(1, Math.max(0, Number(value) || 0));
  if (master) master.gain.value = enabled ? volume : 0;
}

export function soundEnabled() { return enabled; }
export function audioUnlocked() { return unlocked; }

export function playSound(name) {
  if (!enabled || volume <= 0) return;
  const recipe = RECIPES[name];
  if (!recipe) return;
  const c = ensureContext();
  if (!c || c.state === 'suspended') return; // never force autoplay
  const now = c.currentTime;
  for (const part of recipe) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = now + (part.delay || 0);
    const dur = part.dur || 0.15;
    osc.type = part.type || 'sine';
    osc.frequency.setValueAtTime(part.from, t0);
    if (part.to && part.to !== part.from) osc.frequency.exponentialRampToValueAtTime(Math.max(40, part.to), t0 + dur);
    const peak = Math.max(0.0001, (part.gain || 0.3));
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const SOUND_NAMES = Object.keys(RECIPES);
