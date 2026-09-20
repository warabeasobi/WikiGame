/* ui/screens/home.js — landing screen.
 *
 * Deliberately sparse: one hero, one status line, one challenge card, one
 * history card. The seven modes are reachable from the bottom nav (Play), so
 * there is no mode grid here duplicating it.
 */

import { el, formatTime, formatNumber, dayKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, runRow, emptyState, difficultyBadge, xpBar, languageBadge } from '../components.js';
import { Statistics } from '../../storage/statistics.js';
import { Profile } from '../../storage/profile.js';
import { ACHIEVEMENTS, Achievements } from '../../storage/achievements.js';
import { Settings } from '../../storage/settings.js';
import { game } from '../../game/gameState.js';
import { dailyChallenge, dailyDifficulty } from '../../game/challenges.js';
import { LANGUAGES } from '../../api/wikipedia.js';

registerScreen('home', (ctx) => {
  const root = el('div', { class: 'screen screen--home' });
  let dailyInfo = null;

  function render() {
    root.innerHTML = '';
    const stats = Statistics.summary();
    const profile = Profile.all;
    const progress = Profile.progress;
    const langMeta = LANGUAGES.find((l) => l.code === Settings.get('language')) || LANGUAGES[0];
    const saved = game.constructor.savedRunInfo();

    /* Hero: the one place the game introduces itself. */
    root.appendChild(el('section', { class: 'hero' }, [
      el('p', { class: 'hero__kicker', text: t('app.name') }),
      el('h1', { class: 'hero__title', text: t('app.tagline') }),
      el('div', { class: 'hero__actions' }, [
        button({ label: t('home.quickPlay'), variant: 'primary', className: 'btn--lg', onClick: () => ctx.navigate('play', { mode: 'quick', autostart: true }) }),
        button({ label: t('home.daily'), variant: 'ghost', className: 'btn--lg', onClick: () => ctx.navigate('daily') }),
      ]),
    ]));

    /* Status line: no card, just spacing. These are facts, not objects. */
    const status = el('div', { class: 'status-strip' }, [
      el('div', { class: 'status-item' }, [
        el('span', { class: 'status-item__label', text: t('common.streak') }),
        el('strong', { class: 'status-item__value', text: String(stats.streak.current) }),
      ]),
      el('div', { class: 'status-item' }, [
        el('span', { class: 'status-item__label', text: t('common.level') }),
        el('strong', { class: 'status-item__value', text: String(progress.level) }),
      ]),
      el('div', { class: 'status-item' }, [
        el('span', { class: 'status-item__label', text: t('home.bestTime') }),
        el('strong', { class: 'status-item__value', text: stats.best.timeMs ? formatTime(stats.best.timeMs, { showMs: false }) : '-' }),
      ]),
      el('div', { class: 'status-item' }, [
        el('span', { class: 'status-item__label', text: t('common.articles') }),
        el('strong', { class: 'status-item__value', text: formatNumber(stats.totalUniqueArticles, uiLocale()) }),
      ]),
      el('div', { class: 'status-item status-item--lang' }, [
        el('span', { class: 'status-item__label', text: t('common.language') }),
        el('strong', { class: 'status-item__value', text: `${langMeta.flag} ${langMeta.code.toUpperCase()}` }),
      ]),
    ]);
    root.appendChild(status);
    root.appendChild(xpBar(progress));

    /* Continue run */
    if (saved) {
      root.appendChild(el('div', { class: 'continue' }, [
        el('div', { class: 'continue__info' }, [
          el('span', { class: 'continue__label', text: t('home.continue') }),
          el('strong', { class: 'continue__pair', text: `${saved.start} → ${saved.target}` }),
          el('span', { class: 'muted', text: `${formatTime(saved.elapsedMs, { showMs: false })} · ${saved.clicks} ${t('common.clicks')}` }),
        ]),
        el('div', { class: 'continue__actions' }, [
          button({ label: t('common.continue'), variant: 'primary', onClick: () => ctx.navigate('game', { resume: true }) }),
          button({ label: t('common.cancel'), variant: 'ghost', onClick: () => { game.constructor.clearSavedRun(); render(); } }),
        ]),
      ]));
    }

    /* Daily challenge: the retention hook, so it keeps its own card. */
    const dailyResult = Statistics.getDailyResult(dayKey());
    const dailyBody = [];
    if (dailyResult && dailyResult.completed) {
      dailyBody.push(el('div', { class: 'daily-teaser__done' }, [
        el('span', { class: 'badge badge--success', text: t('home.dailyDone') }),
        el('span', { class: 'muted', text: `${formatTime(dailyResult.bestTimeMs, { showMs: false })} · ${formatNumber(dailyResult.bestScore, uiLocale())}` }),
      ]));
    } else if (dailyInfo) {
      dailyBody.push(el('div', { class: 'daily-teaser__body' }, [
        el('span', { class: 'daily-teaser__pair', text: `${dailyInfo.start} → ${dailyInfo.target}` }),
        el('div', { class: 'daily-teaser__meta' }, [difficultyBadge(dailyInfo.difficulty), languageBadge(dailyInfo.lang)]),
      ]));
    } else {
      dailyBody.push(el('p', { class: 'muted', text: t('daily.pending') }));
    }
    root.appendChild(card({
      title: t('home.daily'),
      subtitle: t('home.dailyDesc'),
      actions: [button({ label: dailyResult && dailyResult.completed ? t('daily.replay') : t('daily.play'), variant: 'ghost', onClick: () => ctx.navigate('daily') })],
      body: dailyBody,
    }));

    /* Recent runs */
    const runs = Statistics.runs({ limit: 3 });
    root.appendChild(card({
      title: t('home.recentRuns'),
      actions: [button({ label: t('common.all'), variant: 'ghost', onClick: () => ctx.navigate('stats') })],
      body: [
        runs.length
          ? el('div', { class: 'run-list' }, runs.map((r) => runRow(r, { onOpen: (run) => ctx.navigate('results', { runId: run.id, fromHistory: true }) })))
          : emptyState({
            title: t('home.noRuns'),
            action: button({ label: t('home.quickPlay'), variant: 'primary', onClick: () => ctx.navigate('play', { mode: 'quick', autostart: true }) }),
          }),
      ],
    }));

    /* Everything else lives behind the nav. Keep only two quiet entry points. */
    root.appendChild(el('div', { class: 'home-links' }, [
      button({ label: `${t('ach.title')} ${Achievements.unlockedCount()}/${ACHIEVEMENTS.length}`, variant: 'ghost', onClick: () => ctx.navigate('achievements') }),
      button({ label: t('bookmarks.title'), variant: 'ghost', onClick: () => ctx.navigate('bookmarks') }),
      button({ label: t('lb.title'), variant: 'ghost', onClick: () => ctx.navigate('leaderboard') }),
    ]));

    if (ctx.canInstall && ctx.canInstall()) {
      root.appendChild(el('div', { class: 'install-note' }, [
        el('span', { class: 'muted', text: t('settings.installHint') }),
        button({ label: t('settings.installApp'), variant: 'ghost', className: 'btn--sm', onClick: () => ctx.install && ctx.install() }),
      ]));
    }
  }

  async function loadDaily() {
    try {
      const settings = Settings.all;
      dailyInfo = await dailyChallenge({
        dateKey: dayKey(),
        lang: settings.language,
        verify: false,
        difficulty: dailyDifficulty(dayKey(), settings.language),
      });
      render();
    } catch (err) {
      console.warn('[home] daily preview failed', err);
    }
  }

  render();
  loadDaily();

  return {
    el: root,
    onShow() { render(); },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
