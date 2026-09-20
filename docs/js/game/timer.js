/* game/timer.js — accurate elapsed-time measurement (never "add 1 every second").
 *
 * Uses performance.now() and accumulates real segments, so pausing, freezing
 * and backgrounding the tab never distort the clock.
 */

import { Emitter, clamp } from '../core/util.js';

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export class GameTimer extends Emitter {
  /**
   * @param {object} opts
   * @param {'stopwatch'|'countdown'} [opts.mode]
   * @param {number} [opts.limitMs]      countdown length in ms
   * @param {number} [opts.tickMs]       UI tick interval
   */
  constructor({ mode = 'stopwatch', limitMs = 0, tickMs = 100 } = {}) {
    super();
    this.mode = mode;
    this.limitMs = Math.max(0, limitMs || 0);
    this.tickMs = tickMs;
    this._accumulated = 0;
    this._segmentStart = null;
    this._frozenFrom = null;
    this._frozenUntil = null;
    this._frozenTotal = 0;
    this._running = false;
    this._expired = false;
    this._raf = null;
    this._warned = new Set();
    this._lastTick = 0;
    this._frozenSegments = 0;
  }

  get running() { return this._running; }
  get expired() { return this._expired; }
  get frozen() { return this._frozenFrom !== null && now() < (this._frozenUntil || 0); }

  /**
   * Elapsed *active* time in ms. Pauses and frozen spans are excluded, and the
   * clock is derived from real timestamps — never from counting ticks.
   */
  get elapsedMs() {
    let end = now();
    if (this._frozenFrom !== null) end = Math.min(end, this._frozenFrom);
    let ms = this._accumulated;
    if (this._running && this._segmentStart !== null) ms += Math.max(0, end - this._segmentStart);
    return Math.max(0, ms);
  }

  /** What the HUD should display. */
  get displayMs() {
    if (this.mode === 'countdown' && this.limitMs) return Math.max(0, this.limitMs - this.elapsedMs);
    return this.elapsedMs;
  }

  get remainingMs() {
    if (!this.limitMs) return Infinity;
    return Math.max(0, this.limitMs - this.elapsedMs);
  }

  get progress() {
    if (!this.limitMs) return clamp(this.elapsedMs / 60000, 0, 1);
    return clamp(this.elapsedMs / this.limitMs, 0, 1);
  }

  get frozenMs() { return this._frozenTotal; }

  start() {
    if (this._running) return this;
    this._running = true;
    this._segmentStart = now();
    this._startLoop();
    this.emit('start', { at: Date.now() });
    this._tick(true);
    return this;
  }

  pause(reason = 'user') {
    if (!this._running) return this;
    this._accumulated += now() - this._segmentStart;
    this._segmentStart = null;
    this._running = false;
    this._stopLoop();
    this.emit('pause', { reason, elapsedMs: this.elapsedMs });
    this._tick(true);
    return this;
  }

  resume() {
    if (this._running || this._expired) return this;
    this._running = true;
    this._segmentStart = now();
    this._startLoop();
    this.emit('resume', { elapsedMs: this.elapsedMs });
    this._tick(true);
    return this;
  }

  /** Adds a penalty (or bonus with a negative value) to the elapsed clock. */
  addTime(ms) {
    if (!ms) return this;
    // Materialise the running segment first so the jump lands cleanly.
    if (this._running && this._segmentStart !== null) {
      const end = this._frozenFrom !== null ? Math.min(now(), this._frozenFrom) : now();
      this._accumulated += Math.max(0, end - this._segmentStart);
      this._segmentStart = this._frozenFrom !== null ? this._frozenFrom : now();
    }
    this._accumulated = Math.max(0, this._accumulated + ms);
    this.emit('adjust', { deltaMs: ms, elapsedMs: this.elapsedMs });
    this._tick(true);
    return this;
  }

  /**
   * Freezes the clock for `ms` — the timer keeps "running" but time stands still.
   * Repeated calls extend the freeze instead of stacking oddly.
   */
  freeze(ms = 5000) {
    const base = this._frozenFrom !== null ? this._frozenUntil : now();
    this._frozenFrom = base;
    this._frozenUntil = base + ms;
    this._frozenTotal += ms;
    this._frozenSegments += 1;
    this.emit('freeze', { ms, until: this._frozenUntil });
    this._tick(true);
    return this;
  }

  unfreeze() {
    if (this._frozenFrom === null) return this;
    const remaining = Math.max(0, (this._frozenUntil || 0) - now());
    this._frozenTotal = Math.max(0, this._frozenTotal - remaining);
    if (this._running && this._segmentStart !== null) {
      this._accumulated += Math.max(0, this._frozenFrom - this._segmentStart);
      this._segmentStart = now();
    }
    this._frozenFrom = null;
    this._frozenUntil = null;
    this.emit('unfreeze', {});
    this._tick(true);
    return this;
  }

  reset({ limitMs = this.limitMs, mode = this.mode } = {}) {
    this._accumulated = 0;
    this._segmentStart = this._running ? now() : null;
    this._frozenFrom = null;
    this._frozenUntil = null;
    this._frozenTotal = 0;
    this._frozenSegments = 0;
    this._expired = false;
    this._warned.clear();
    this.limitMs = Math.max(0, limitMs || 0);
    this.mode = mode;
    this.emit('reset', {});
    this._tick(true);
    return this;
  }

  stop() {
    if (this._running) {
      this._accumulated += now() - this._segmentStart;
      this._segmentStart = null;
    }
    this._running = false;
    this._stopLoop();
    this.emit('stop', { elapsedMs: this.elapsedMs });
    this._tick(true);
    return this;
  }

  snapshot() {
    return {
      mode: this.mode,
      limitMs: this.limitMs,
      elapsedMs: this.elapsedMs,
      running: this._running,
      expired: this._expired,
      frozenMs: this._frozenTotal,
      freezes: this._frozenSegments,
    };
  }

  /* -------------------------------------------------------------- */

  _startLoop() {
    if (this._raf !== null) return;
    const loop = () => {
      this._tick(false);
      if (this._running) this._raf = requestAnimationFrame(loop);
      else this._raf = null;
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._raf !== null) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _tick(force) {
    const t = now();
    if (!force && t - this._lastTick < this.tickMs) return;
    this._lastTick = t;
    const snap = this.snapshot();
    this.emit('tick', snap);

    if (this.mode === 'countdown' && this.limitMs) {
      const remaining = this.remainingMs;
      for (const mark of [60000, 30000, 10000, 5000]) {
        if (remaining <= mark && !this._warned.has(mark) && remaining > 0) {
          this._warned.add(mark);
          this.emit('warning', { remainingMs: remaining, mark });
        }
      }
      if (remaining <= 0 && !this._expired) {
        this._expired = true;
        if (this._running) {
          this._accumulated += now() - this._segmentStart;
          this._segmentStart = null;
          this._running = false;
          this._stopLoop();
        }
        this.emit('expired', { elapsedMs: this.elapsedMs });
        this.emit('tick', this.snapshot());
      }
    }
  }
}

/** Convenience: a timer that also survives page reloads via saved state. */
export function timerFromSnapshot(snapshot) {
  const timer = new GameTimer({ mode: snapshot.mode, limitMs: snapshot.limitMs });
  timer._accumulated = snapshot.elapsedMs || 0;
  return timer;
}
