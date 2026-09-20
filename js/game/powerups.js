/* game/powerups.js — optional tools. Each one is declarative so the UI can
 * render the toolbar from data and the engine can apply effects generically.
 */

export const POWERUPS = [
  {
    id: 'radar',
    icon: '📡',
    labelKey: 'game.radar',
    descKey: 'game.radar',
    uses: 3,
    modes: ['quick', 'custom', 'daily', 'timeattack', 'clickattack', 'endless'],
  },
  {
    id: 'backtrack',
    icon: '↩️',
    labelKey: 'game.back',
    descKey: 'game.back',
    uses: 3,
    free: true, // does not add a click
    modes: ['quick', 'custom', 'daily', 'timeattack', 'clickattack', 'endless', 'sandbox'],
  },
  {
    id: 'freeze',
    icon: '🧊',
    labelKey: 'game.freeze',
    descKey: 'game.freeze',
    uses: 2,
    modes: ['quick', 'custom', 'daily', 'timeattack', 'endless'],
  },
  {
    id: 'scanner',
    icon: '🔎',
    labelKey: 'game.scanner',
    descKey: 'game.scanner',
    uses: 3,
    modes: ['quick', 'custom', 'daily', 'timeattack', 'clickattack', 'endless'],
  },
  {
    id: 'doubleVision',
    icon: '👁️',
    labelKey: 'game.doubleVision',
    descKey: 'game.doubleVision',
    uses: 2,
    durationMs: 30000,
    modes: ['quick', 'custom', 'daily', 'timeattack', 'clickattack', 'endless'],
  },
];

export const FREEZE_MS = 10000;

export function powerupById(id) {
  return POWERUPS.find((p) => p.id === id) || null;
}

export function powerupsForMode(mode) {
  return POWERUPS.filter((p) => p.modes.includes(mode));
}

export function initialPowerupState(mode, { freezeUses = null } = {}) {
  const state = {};
  for (const p of POWERUPS) {
    const allowed = p.modes.includes(mode);
    state[p.id] = {
      id: p.id,
      allowed,
      uses: allowed ? (p.id === 'freeze' && freezeUses ? freezeUses : p.uses) : 0,
      activeUntil: null,
      usedCount: 0,
    };
  }
  return state;
}

export function isPowerupActive(state, id, now = Date.now()) {
  const s = state && state[id];
  return Boolean(s && s.activeUntil && s.activeUntil > now);
}

export function activePowerups(state, now = Date.now()) {
  return Object.values(state || {}).filter((s) => s.activeUntil && s.activeUntil > now).map((s) => s.id);
}
