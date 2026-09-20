/* storage/profile.js — local player profile: XP, level, cosmetics, name. */

import { Doc, KEYS } from '../core/store.js';
import { Emitter, uid } from '../core/util.js';
import { levelFromXp, xpForLevel, unlockedCosmetics, nextCosmetic, COSMETICS } from '../game/scoring.js';

const DEFAULTS = {
  id: null,
  name: 'Player',
  createdAt: null,
  xp: 0,
  avatar: 'avatar-default',
  accent: null,
  equipped: {},
  levelUps: 0,
  lastLevel: 1,
};

const emitter = new Emitter();
let doc = null;

export const Profile = {
  init() {
    doc = new Doc(KEYS.profile, DEFAULTS, { version: 2 });
    if (!doc.data.id) doc.update((d) => { d.id = uid('player'); d.createdAt = Date.now(); });
    if (!doc.data.createdAt) doc.update((d) => { d.createdAt = Date.now(); });
    return doc.data;
  },
  get all() { return doc.data; },

  get progress() { return levelFromXp(doc.data.xp); },
  get level() { return levelFromXp(doc.data.xp).level; },

  setName(name) {
    const clean = String(name || '').trim().slice(0, 24) || 'Player';
    doc.update((d) => { d.name = clean; });
    emitter.emit('change', doc.data);
    return clean;
  },

  /**
   * Adds XP and reports level-ups.
   * @returns {{xp:number, level:number, previousLevel:number, leveledUp:boolean, unlocked:Array}}
   */
  addXp(amount, { reason = 'run' } = {}) {
    const gain = Math.max(0, Math.round(Number(amount) || 0));
    const before = levelFromXp(doc.data.xp);
    doc.update((d) => { d.xp = Math.max(0, (d.xp || 0) + gain); });
    const after = levelFromXp(doc.data.xp);
    const leveledUp = after.level > before.level;
    if (leveledUp) {
      doc.update((d) => { d.levelUps = (d.levelUps || 0) + 1; d.lastLevel = after.level; });
      emitter.emit('levelup', { from: before.level, to: after.level, reason });
    }
    const unlocked = COSMETICS.filter((c) => c.level > before.level && c.level <= after.level);
    emitter.emit('change', doc.data);
    return { xp: gain, level: after.level, previousLevel: before.level, leveledUp, unlocked, progress: after };
  },

  equip(itemId) {
    const item = COSMETICS.find((c) => c.id === itemId);
    if (!item) return false;
    if (item.level > this.level) return false;
    doc.update((d) => {
      d.equipped = { ...(d.equipped || {}), [item.type]: item.id };
      if (item.type === 'avatar') d.avatar = item.id;
      if (item.type === 'accent') d.accent = item.color;
    });
    emitter.emit('change', doc.data);
    return true;
  },

  equippedCosmetics() {
    return unlockedCosmetics(this.level).filter((c) => (doc.data.equipped || {})[c.type] === c.id);
  },

  nextUnlock() { return nextCosmetic(this.level); },
  xpToNextLevel() {
    const p = levelFromXp(doc.data.xp);
    return { needed: p.toNext, nextLevel: p.level + 1, progress: p.progress, span: p.levelSpan, into: p.intoLevel };
  },
  xpForLevel,

  reset() {
    doc.reset();
    doc.update((d) => { d.id = uid('player'); d.createdAt = Date.now(); });
    emitter.emit('change', doc.data);
  },

  on(fn) { return emitter.on('change', fn); },
  onLevelUp(fn) { return emitter.on('levelup', fn); },
  export() { return JSON.parse(JSON.stringify(doc.data)); },
  import(data) {
    doc.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(data || {}) };
    doc.save();
    emitter.emit('change', doc.data);
  },
};
