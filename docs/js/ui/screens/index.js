/* ui/screens/index.js — screen registry.
 *
 * Each screen module registers itself with a factory:
 *   registerScreen('home', (ctx) => ({ el, onShow(params), onHide(), destroy() }))
 *
 * Keeping the registry separate from the screen modules avoids circular
 * imports while still letting screens navigate to each other.
 */

const registry = new Map();

export function registerScreen(id, factory, meta = {}) {
  registry.set(id, { id, factory, meta });
}

export function getScreen(id) {
  return registry.get(id) || null;
}

export function hasScreen(id) {
  return registry.has(id);
}

export function screenList() {
  return [...registry.values()].map((s) => ({ id: s.id, ...s.meta }));
}

/** Screens reachable from the bottom navigation. */
export const NAV_ITEMS = [
  { id: 'home', labelKey: 'nav.home' },
  { id: 'play', labelKey: 'nav.play' },
  { id: 'daily', labelKey: 'nav.daily' },
  { id: 'stats', labelKey: 'nav.stats' },
  { id: 'achievements', labelKey: 'nav.achievements' },
  { id: 'profile', labelKey: 'nav.profile' },
  { id: 'settings', labelKey: 'nav.settings' },
];

/** Screens that are hidden from the bottom nav but still routable. */
export const HIDDEN_SCREENS = ['game', 'results', 'replay', 'bookmarks', 'leaderboard'];
