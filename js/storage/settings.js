/* storage/settings.js — user settings with sane defaults and validation. */

import { Doc, KEYS } from '../core/store.js';
import { Emitter, deepMerge } from '../core/util.js';
import { DIFFICULTY_IDS } from '../game/difficulty.js';
import { LANGUAGE_CODES } from '../api/wikipedia.js';

export const SETTINGS_VERSION = 3;

export const DEFAULT_SETTINGS = {
  // gameplay
  timerStyle: 'auto',            // 'auto' | 'stopwatch' | 'countdown'
  countArticleClicksOnly: true,  // false = count every click inside the article
  hintPenaltySeconds: 5,         // per hint
  hintPenaltyClicks: 0,          // per hint
  powerupsEnabled: true,
  difficulty: 'normal',
  language: 'en',
  confirmAbandon: true,
  autoPauseOnBlur: true,
  keepScreenAwake: true,
  // appearance
  theme: 'system',               // light | dark | system
  skin: 'classic',               // classic | minimal | retro | amoled
  compactHud: false,
  animations: true,
  hudPosition: 'top',            // top | bottom (mobile reachability)
  showRoutePanel: true,
  // audio
  soundEnabled: true,
  volume: 0.6,
  // language
  uiLanguage: null,              // null = auto detect
  // data
  offlineArticleCache: true,
  articleCacheLimit: 40,
  // misc
  seenTutorial: false,
  lastMode: 'quick',
};

const emitter = new Emitter();
let doc = null;

function validate(data) {
  const out = deepMerge({}, DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(data || {})) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    const expected = typeof DEFAULT_SETTINGS[k];
    if (DEFAULT_SETTINGS[k] === null) { out[k] = v; continue; }
    if (typeof v === expected) out[k] = v;
    else if (expected === 'number' && Number.isFinite(Number(v))) out[k] = Number(v);
    else if (expected === 'boolean') out[k] = Boolean(v);
  }
  if (!DIFFICULTY_IDS.includes(out.difficulty)) out.difficulty = DEFAULT_SETTINGS.difficulty;
  if (!LANGUAGE_CODES.includes(out.language)) out.language = DEFAULT_SETTINGS.language;
  if (out.uiLanguage && !['en', 'id'].includes(out.uiLanguage)) out.uiLanguage = null;
  if (!['light', 'dark', 'system'].includes(out.theme)) out.theme = 'system';
  if (!['classic', 'minimal', 'retro', 'amoled'].includes(out.skin)) out.skin = 'classic';
  if (!['auto', 'stopwatch', 'countdown'].includes(out.timerStyle)) out.timerStyle = 'auto';
  out.volume = Math.min(1, Math.max(0, Number(out.volume) || 0));
  out.hintPenaltySeconds = Math.min(120, Math.max(0, Number(out.hintPenaltySeconds) || 0));
  out.hintPenaltyClicks = Math.min(10, Math.max(0, Math.round(Number(out.hintPenaltyClicks) || 0)));
  out.articleCacheLimit = Math.min(200, Math.max(0, Math.round(Number(out.articleCacheLimit) || 40)));
  return out;
}

export const Settings = {
  init() {
    doc = new Doc(KEYS.settings, DEFAULT_SETTINGS, {
      version: SETTINGS_VERSION,
      migrate: (old) => ({ ...DEFAULT_SETTINGS, ...old }),
    });
    doc.data = validate(doc.data);
    return doc.data;
  },
  get all() { return doc ? doc.data : DEFAULT_SETTINGS; },
  get(key) { return this.all[key]; },
  set(patch) {
    const next = validate({ ...this.all, ...patch });
    doc.data = next;
    doc.save();
    emitter.emit('change', next);
    for (const [k, v] of Object.entries(patch)) emitter.emit(`change:${k}`, v);
    return next;
  },
  reset() {
    doc.reset();
    doc.data = validate(doc.data);
    emitter.emit('change', doc.data);
    return doc.data;
  },
  on(fn) { return emitter.on('change', fn); },
  onChange(key, fn) { return emitter.on(`change:${key}`, fn); },
  export() { return { ...this.all }; },
  import(data) {
    const next = validate(data || {});
    doc.data = next;
    doc.save();
    emitter.emit('change', next);
    return next;
  },
};

export const THEMES = ['light', 'dark', 'system'];
export const SKINS = ['classic', 'minimal', 'retro', 'amoled'];
