/* game/hints.js — three hint types with real Wikipedia data behind them.
 *
 *  HINT 1 (topic)    categories / description of the target
 *  HINT 2 (bridge)   an article that plausibly shortens the path
 *  HINT 3 (distance) is the target 1, 2 or 3+ clicks away?
 */

import { titleKey } from '../core/util.js';
import { getPageInfo, getOutgoingLinks, bfsDistance, scoreLinksForTarget } from '../api/wikipedia.js';

export const HINT_TYPES = [
  {
    id: 'topic',
    index: 1,
    icon: '🏷️',
    cost: { seconds: 5, clicks: 0 },
    labelKey: 'game.hint1',
  },
  {
    id: 'bridge',
    index: 2,
    icon: '🌉',
    cost: { seconds: 10, clicks: 1 },
    labelKey: 'game.hint2',
  },
  {
    id: 'distance',
    index: 3,
    icon: '📏',
    cost: { seconds: 15, clicks: 0 },
    labelKey: 'game.hint3',
  },
];

export function hintById(id) {
  return HINT_TYPES.find((h) => h.id === id) || null;
}

export function hintCost(hint, { secondsPerHint = 5, clicksPerHint = 0 } = {}) {
  // The player can configure penalties in Settings; defaults come from the
  // hint's own design, the settings act as a multiplier-free override.
  return {
    seconds: secondsPerHint !== null && secondsPerHint !== undefined ? secondsPerHint : hint.cost.seconds,
    clicks: clicksPerHint || 0,
  };
}

const GENERIC_CATEGORY = /^(articles?|all articles|webarchive|cs1|pages?|use (dmy|mdy)|living people|year of birth|wikipedia|featured|good articles|commons category|official website|coordinates|short description)/i;

/** Strips wiki plumbing from category names so hints read like topics. */
export function cleanCategories(categories = []) {
  return categories
    .map((c) => String(c).replace(/^(Category|Kategori|Kategorie|Catégorie|Categoría|カテゴリ)\s*:\s*/i, '').trim())
    .filter((c) => c && !GENERIC_CATEGORY.test(c) && c.length < 60);
}

function topicsFrom(targetInfo = {}) {
  const cats = cleanCategories(targetInfo.categories || []);
  if (cats.length) return cats.slice(0, 3);
  const desc = String(targetInfo.description || '').trim();
  if (desc) return [desc];
  const extract = String(targetInfo.extract || '').trim();
  if (extract) return [extract.split(/[.;]/)[0].slice(0, 80)];
  return [];
}

/**
 * @param {object} ctx
 * @param {'topic'|'bridge'|'distance'} ctx.type
 * @param {string} ctx.lang
 * @param {string} ctx.current  current article title
 * @param {string} ctx.target   target article title
 * @param {object} ctx.targetInfo  { categories, description, extract, thumbnail }
 * @param {AbortSignal} [ctx.signal]
 */
export async function buildHint(ctx) {
  const { type, lang, current, target, targetInfo = {}, signal } = ctx;
  if (type === 'topic') {
    const topics = topicsFrom(targetInfo);
    if (!topics.length) {
      return { type, textKey: 'powerup.radarUnknown', data: {}, fallbackText: 'No topic data available for this target.' };
    }
    return {
      type,
      textKey: 'hint.topic',
      data: { topics: topics.join(' · ') },
      fallbackText: `The target is connected to: ${topics.join(' · ')}`,
      detail: topics,
    };
  }

  if (type === 'distance') {
    const distance = await bfsDistance(lang, current, target, { maxDepth: 2, frontier: 8, signal });
    const key = distance === 1 ? 'hint.distance1' : distance === 2 ? 'hint.distance2' : distance === Infinity ? 'hint.distance3' : 'hint.unknown';
    const text = distance === 1 ? 'The target is directly linked from here!'
      : distance === 2 ? 'The target is within 2 clicks of here.'
        : distance === Infinity ? 'The target is 3 or more clicks away.' : 'Distance unknown. Explore to find out.';
    return { type, textKey: key, data: {}, fallbackText: text, detail: { distance } };
  }

  if (type === 'bridge') {
    const links = await getOutgoingLinks(lang, current, { limit: 400, signal });
    if (!links.length) {
      return { type, textKey: 'powerup.scannerNone', data: {}, fallbackText: 'No article links found on this page.' };
    }
    const targetKeys = new Set([titleKey(target)]);
    if (links.some((l) => titleKey(l) === titleKey(target))) {
      return {
        type,
        textKey: 'hint.bridge',
        data: { title: target, reason: 'it links straight to the target' },
        fallbackText: `Try: ${target} (it links straight to the target)`,
        detail: { title: target, reasonKey: 'hint.reasonLinked' },
      };
    }

    const ranked = scoreLinksForTarget(links, target, targetInfo).slice(0, 8);
    // Probe the most promising candidates for a 2-click connection.
    for (const candidate of ranked.slice(0, 4)) {
      try {
        const secondHop = await getOutgoingLinks(lang, candidate.link, { limit: 400, signal });
        if (secondHop.some((l) => titleKey(l) === titleKey(target))) {
          return {
            type,
            textKey: 'hint.bridge',
            data: { title: candidate.link, reason: 'a short path to the target runs through it' },
            fallbackText: `Try: ${candidate.link} (a short path to the target runs through it)`,
            detail: { title: candidate.link, reasonKey: 'hint.reasonShort', confidence: 'high' },
          };
        }
      } catch { /* keep probing */ }
    }

    // Fall back to a relatedness suggestion (never a fake link).
    const best = ranked[0];
    if (!best || best.score <= 0) {
      const info = await getPageInfo(lang, [target], { signal }).catch(() => ({}));
      const cats = cleanCategories((Object.values(info)[0] || {}).categories || []);
      const suggestion = cats.length ? `Look for links about: ${cats.slice(0, 2).join(', ')}` : 'No strong link candidates found. Try a broader topic.';
      return { type, textKey: 'powerup.radarUnknown', data: {}, fallbackText: suggestion };
    }
    return {
      type,
      textKey: 'hint.bridge',
      data: { title: best.link, reason: 'it shares context with the target' },
      fallbackText: `Try: ${best.link} (it shares context with the target)`,
      detail: { title: best.link, reasonKey: 'hint.reasonRelated', confidence: 'medium' },
    };
  }

  return { type, textKey: 'hint.unknown', data: {}, fallbackText: 'No hint available.' };
}

/** Search radar: a vague clue about the target, cheap to produce. */
export function radarClue(targetInfo = {}) {
  const topics = topicsFrom(targetInfo);
  if (topics.length) return { textKey: 'powerup.radar', data: { clue: topics.slice(0, 2).join(' · ') } };
  const extract = String(targetInfo.extract || '').trim();
  if (extract) return { textKey: 'powerup.radar', data: { clue: `${extract.split(/[.;]/)[0].slice(0, 70)}…` } };
  return { textKey: 'powerup.radarUnknown', data: {} };
}
