/* main.js — application bootstrap.
 *
 * Wires the storage modules, the game engine and the router together, installs
 * the service worker, and exposes a small debug API (window.WSR) that the test
 * suite uses to drive the real application.
 */

import { el, isOnline, dayKey } from './core/util.js';
import { t, setUiLanguage, detectUiLanguage } from './core/i18n.js';
import { Settings } from './storage/settings.js';
import { Statistics } from './storage/statistics.js';
import { Achievements } from './storage/achievements.js';
import { Profile } from './storage/profile.js';
import { Bookmarks } from './storage/bookmarks.js';
import { Leaderboard } from './storage/leaderboard.js';
import { ArticleCache } from './storage/articleCache.js';
import { setPersistentArticleCache, clearApiCache } from './api/wikipedia.js';
import { game } from './game/gameState.js';
import { Router } from './ui/router.js';
import { notify, achievementPopup } from './ui/notifications.js';
import { unlockAudio, setSoundEnabled, setVolume, playSound } from './ui/sound.js';
import { exportSave, importSave, resetEverything, SCHEMA_VERSION } from './core/save.js';
import { pickRandom } from './core/util.js';

import './ui/screens/home.js';
import './ui/screens/play.js';
import './ui/screens/game.js';
import './ui/screens/daily.js';

export async function boot({ rootId = 'app', autoStart = true } = {}) {
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`#${rootId} not found`);
  // The boot splash lives inside #app so it paints before the modules load.
  const splash = document.getElementById('boot');
  if (splash) splash.remove();

  /* --- storage ---------------------------------------------------- */
  Settings.init();
  Statistics.init();
  Achievements.init();
  Profile.init();
  Bookmarks.init();
  Leaderboard.init();
  ArticleCache.init
    ? ArticleCache.init()
    : null;
  ArticleCache.configure({
    enabled: Settings.get('offlineArticleCache'),
    limit: Settings.get('articleCacheLimit'),
  });
  setPersistentArticleCache(ArticleCache);

  /* --- appearance / audio ----------------------------------------- */
  setUiLanguage(Settings.get('uiLanguage') || detectUiLanguage());
  setSoundEnabled(Settings.get('soundEnabled'));
  setVolume(Settings.get('volume'));

  Settings.onChange('theme', () => router.applyTheme());
  Settings.onChange('skin', () => router.applyTheme());
  Settings.onChange('animations', () => router.applyTheme());
  Settings.onChange('compactHud', () => router.applyTheme());
  Settings.onChange('soundEnabled', (v) => setSoundEnabled(v));
  Settings.onChange('volume', (v) => setVolume(v));
  Settings.onChange('offlineArticleCache', (v) => ArticleCache.configure({ enabled: v, limit: Settings.get('articleCacheLimit') }));
  Settings.onChange('articleCacheLimit', (v) => ArticleCache.configure({ limit: v, enabled: Settings.get('offlineArticleCache') }));

  /* --- achievement + level notifications -------------------------- */
  Achievements.on((a) => {
    achievementPopup({ name: t(`ach.${a.id}.name`), desc: t(`ach.${a.id}.desc`), icon: a.icon, xp: a.xp });
  });
  Profile.onLevelUp(({ to }) => {
    notify.success(t('profile.levelUp', { lvl: to }), { icon: '⭐', duration: 4200 });
    playSound('levelup');
  });

  /* --- router ----------------------------------------------------- */
  const router = new Router(root);
  window.WSR = {
    version: SCHEMA_VERSION,
    router,
    game,
    Settings,
    Statistics,
    Achievements,
    Profile,
    Bookmarks,
    Leaderboard,
    ArticleCache,
    exportSave,
    importSave,
    resetEverything,
    clearApiCache,
    notify,
    ready: false,
  };

  // Unlock audio on the first real interaction (autoplay policy).
  const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  if (autoStart) {
    await router.start('home');
    window.WSR.ready = true;
    document.body.classList.remove('is-booting');
  }
  return router;
}

/* --- auto boot ----------------------------------------------------- */
if (typeof document !== 'undefined' && !window.__WSR_NO_AUTOBOOT__) {
  const start = () => {
    boot().catch((err) => {
      console.error('[boot] failed', err);
      const root = document.getElementById('app');
      if (root) {
        root.innerHTML = '';
        root.appendChild(el('div', { class: 'fatal' }, [
          el('h1', { text: 'Wikipedia Speedrun' }),
          el('p', { text: 'Something went wrong while starting the game.' }),
          el('pre', { class: 'fatal__detail', text: String(err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : err) }),
          el('button', { class: 'btn btn--primary', type: 'button', text: 'Reload', onClick: () => location.reload() }),
        ]));
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

/* --- service worker ------------------------------------------------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).toString(), { scope: './' })
      .then((reg) => {
        if (window.WSR) window.WSR.swRegistration = reg;
        reg.addEventListener('updatefound', () => console.info('[sw] update found'));
      })
      .catch((err) => console.warn('[sw] registration failed', err));
  });
}
