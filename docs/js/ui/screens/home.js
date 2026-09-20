/* ui/screens/home.js — landing screen: play, daily, streak, records, modes. */

import { el, formatTime, formatNumber, formatRelative, dayKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, statTile, runRow, emptyState, modeBadge, difficultyBadge, xpBar, languageBadge } from '../components.js';
import { Statistics } from '../../storage/statistics.js';
import { Profile } from '../../storage/profile.js';
import { ACHIEVEMENTS, Achievements } from '../../storage/achievements.js';
import { Settings } from '../../storage/settings.js';
import { game } from '../../game/gameState.js';
import { dailyChallenge, dailyDifficulty } from '../../game/challenges.js';
import { difficultyConfig } from '../../game/difficulty.js';
import { LANGUAGES } from '../../api/wikipedia.js';

const MODE_CARDS = [
  { id: 'quick', icon: '⚡', labelKey: 'modes.quick', descKey: 'modes.quickDesc' },
  { id: 'custom', icon: '🎛️', labelKey: 'modes.custom', descKey: 'modes.customDesc' },
  { id: 'daily', icon: '📅', labelKey: 'modes.daily', descKey: 'modes.dailyDesc' },
  { id: 'timeattack', icon: '⏱️', labelKey: 'modes.timeattack', descKey: 'modes.timeattackDesc' },
  { id: 'clickattack', icon: '🖱️', labelKey: 'modes.clickattack', descKey: 'modes.clickattackDesc' },
  { id: 'endless', icon: '♾️', labelKey: 'modes.endless', descKey: 'modes.endlessDesc' },
  { id: 'sandbox', icon: '🧪', labelKey: 'modes.sandbox', descKey: 'modes.sandboxDesc' },
];

registerScreen('home', (ctx) => {
  const root = el('div', { class: 'screen screen--home' });
  let dailyInfo = null;

  function render() {
    root.innerHTML = '';
    const stats = Statistics.summary();
    const profile = Profile.all;
    const progress = Profile.progress;
    const settings = Settings.all;
    const langMeta = LANGUAGES.find((l) => l.code === settings.language) || LANGUAGES[0];

    /* Hero ---------------------------------------------------------- */
    root.appendChild(el('section', { class: 'hero' }, [
      el('div', { class: 'hero__text' }, [
        el('p', { class: 'hero__kicker', text: 'Wikipedia Speedrun' }),
        el('h1', { class: 'hero__title', text: t('app.tagline') }),
        el('div', { class: 'hero__chips' }, [
          el('span', { class: 'hero__chip' }, [el('span', { text: '🧑', 'aria-hidden': 'true' }), el('span', { text: profile.name })]),
          el('span', { class: 'hero__chip' }, [el('span', { text: '⭐', 'aria-hidden': 'true' }), el('span', { text: `${t('common.level')} ${progress.level}` })]),
          stats.streak.current ? el('span', { class: 'hero__chip hero__chip--hot' }, [el('span', { text: '🔥', 'aria-hidden': 'true' }), el('span', { text: `${t('common.streak')} ${stats.streak.current}` })]) : null,
          el('span', { class: 'hero__chip' }, [el('span', { text: langMeta.flag, 'aria-hidden': 'true' }), el('span', { text: langMeta.label })]),
        ]),
      ]),
      el('div', { class: 'hero__actions' }, [
        button({ label: t('home.quickPlay'), icon: '⚡', variant: 'primary', className: 'btn--lg', onClick: () => ctx.navigate('play', { mode: 'quick', autostart: true }) }),
        button({ label: t('home.daily'), icon: '📅', variant: 'ghost', className: 'btn--lg', onClick: () => ctx.navigate('daily') }),
      ]),
    ]));

    /* Continue run -------------------------------------------------- */
    const saved = game.constructor.savedRunInfo();
    if (saved) {
      root.appendChild(card({
        className: 'card--accent card--continue',
        body: [
          el('div', { class: 'continue' }, [
            el('div', { class: 'continue__info' }, [
              el('strong', { text: t('home.continue') }),
              el('p', { class: 'muted', text: `${saved.start} → ${saved.target}` }),
              el('div', { class: 'continue__meta' }, [
                modeBadge(saved.mode),
                difficultyBadge(saved.difficulty),
                el('span', { class: 'muted', text: `${formatTime(saved.elapsedMs)} · ${saved.clicks} ${t('common.clicks')}` }),
              ]),
            ]),
            el('div', { class: 'continue__actions' }, [
              button({ label: t('common.continue'), icon: '▶', onClick: () => ctx.navigate('game', { resume: true }) }),
              button({ label: t('common.cancel'), variant: 'ghost', onClick: () => { game.constructor.clearSavedRun(); render(); } }),
            ]),
          ]),
        ],
      }));
    }

    /* Daily card ---------------------------------------------------- */
    const dailyCard = card({
      title: t('home.daily'),
      subtitle: t('home.dailyDesc'),
      actions: [button({ label: t('daily.play'), variant: 'ghost', onClick: () => ctx.navigate('daily') })],
      body: [el('div', { class: 'daily-teaser', id: 'daily-teaser' }, [el('p', { class: 'muted', text: t('common.loading') })])],
    });
    root.appendChild(dailyCard);
    const teaser = dailyCard.querySelector('#daily-teaser');

    const dailyResult = Statistics.getDailyResult(dayKey());
    if (dailyResult && dailyResult.completed) {
      teaser.innerHTML = '';
      teaser.append(
        el('div', { class: 'daily-teaser__done' }, [
          el('span', { class: 'badge badge--success', text: `✓ ${t('home.dailyDone')}` }),
          el('span', { class: 'muted', text: `${t('daily.bestTime')}: ${formatTime(dailyResult.bestTimeMs)}` }),
          el('span', { class: 'muted', text: `${t('daily.bestScore')}: ${formatNumber(dailyResult.bestScore, uiLocale())}` }),
        ]),
      );
    } else if (dailyInfo) {
      teaser.innerHTML = '';
      teaser.append(
        el('div', { class: 'daily-teaser__body' }, [
          el('span', { class: 'daily-teaser__pair', text: `${dailyInfo.start} → ${dailyInfo.target}` }),
          el('div', { class: 'daily-teaser__meta' }, [
            difficultyBadge(dailyInfo.difficulty),
            languageBadge(dailyInfo.lang),
            el('span', { class: 'muted', text: t('daily.subtitle') }),
          ]),
        ]),
      );
    } else {
      teaser.innerHTML = '';
      teaser.append(el('p', { class: 'muted', text: t('daily.pending') }));
    }

    /* Quick stats --------------------------------------------------- */
    root.appendChild(card({
      title: t('home.quickStats'),
      actions: [button({ label: t('common.statistics'), variant: 'ghost', onClick: () => ctx.navigate('stats') })],
      body: [
        el('div', { class: 'grid grid--tiles' }, [
          statTile({ label: t('stats.runs'), value: formatNumber(stats.totalRuns, uiLocale()), icon: '🎮' }),
          statTile({ label: t('stats.completed'), value: formatNumber(stats.completedRuns, uiLocale()), icon: '✅' }),
          statTile({ label: t('stats.fastestRun'), value: stats.best.timeMs ? formatTime(stats.best.timeMs) : '—', icon: '⚡' }),
          statTile({ label: t('stats.bestScore'), value: stats.best.score ? formatNumber(stats.best.score, uiLocale()) : '—', icon: '🏅' }),
          statTile({ label: t('stats.avgClicks'), value: stats.completedRuns ? stats.averageClicks.toFixed(1) : '—', icon: '🖱️' }),
          statTile({ label: t('stats.uniqueArticles'), value: formatNumber(stats.totalUniqueArticles, uiLocale()), icon: '📚' }),
        ]),
      ],
    }));

    /* Level / XP ---------------------------------------------------- */
    root.appendChild(card({
      title: t('profile.title'),
      actions: [button({ label: t('nav.profile'), variant: 'ghost', onClick: () => ctx.navigate('profile') })],
      body: [
        el('div', { class: 'profile-mini' }, [
          el('div', { class: 'profile-mini__avatar', text: Profile.all.avatar === 'avatar-owl' ? '🦉' : Profile.all.avatar === 'avatar-rocket' ? '🚀' : Profile.all.avatar === 'avatar-dragon' ? '🐉' : Profile.all.avatar === 'avatar-crown' ? '👑' : '🧭' }),
          el('div', { class: 'profile-mini__body' }, [
            el('strong', { text: `${t('common.level')} ${progress.level} · ${formatNumber(progress.xp, uiLocale())} XP` }),
            xpBar(progress),
            el('p', { class: 'field__hint', text: t('home.nextLevel', { n: formatNumber(progress.toNext, uiLocale()), lvl: progress.level + 1 }) }),
          ]),
          el('div', { class: 'profile-mini__badges' }, [
            el('span', { class: 'badge', text: `🏆 ${Achievements.unlockedCount()}/${ACHIEVEMENTS.length}` }),
            stats.bestStars ? el('span', { class: 'badge', text: `★ ${stats.bestStars}/5` }) : null,
          ]),
        ]),
      ],
    }));

    /* Mode grid ----------------------------------------------------- */
    root.appendChild(card({
      title: t('home.modes'),
      body: [
        el('div', { class: 'mode-grid' }, MODE_CARDS.map((m) => el('button', {
          class: 'mode-card',
          type: 'button',
          onClick: () => ctx.navigate(m.id === 'daily' ? 'daily' : 'play', { mode: m.id }),
        }, [
          el('span', { class: 'mode-card__icon', text: m.icon, 'aria-hidden': 'true' }),
          el('span', { class: 'mode-card__label', text: t(m.labelKey) }),
          el('span', { class: 'mode-card__desc', text: t(m.descKey) }),
        ]))),
      ],
    }));

    /* Recent runs --------------------------------------------------- */
    const runs = Statistics.runs({ limit: 4 });
    root.appendChild(card({
      title: t('home.recentRuns'),
      actions: [button({ label: t('common.all'), variant: 'ghost', onClick: () => ctx.navigate('stats') })],
      body: [
        runs.length
          ? el('div', { class: 'run-list' }, runs.map((r) => runRow(r, { onOpen: (run) => ctx.navigate('results', { runId: run.id, fromHistory: true }) })))
          : emptyState({ icon: '🚀', title: t('home.noRuns'), message: t('home.quickPlayDesc'), action: button({ label: t('home.quickPlay'), onClick: () => ctx.navigate('play', { mode: 'quick', autostart: true }) }) }),
      ],
    }));

    /* How to play --------------------------------------------------- */
    root.appendChild(card({
      title: t('home.tipTitle'),
      className: 'card--muted',
      body: [
        el('ol', { class: 'tips' }, [
          el('li', { text: t('home.tip1') }),
          el('li', { text: t('home.tip2') }),
          el('li', { text: t('home.tip3') }),
          el('li', { text: t('home.tip4') }),
        ]),
        el('div', { class: 'row row--wrap' }, [
          button({ label: t('bookmarks.title'), icon: '⭐', variant: 'ghost', onClick: () => ctx.navigate('bookmarks') }),
          button({ label: t('lb.title'), icon: '🥇', variant: 'ghost', onClick: () => ctx.navigate('leaderboard') }),
          button({ label: t('nav.settings'), icon: '⚙️', variant: 'ghost', onClick: () => ctx.navigate('settings') }),
        ]),
      ],
    }));

    if (ctx.canInstall && ctx.canInstall()) {
      root.appendChild(card({
        className: 'card--accent',
        body: [
          el('div', { class: 'row row--between' }, [
            el('div', {}, [el('strong', { text: t('settings.installApp') }), el('p', { class: 'muted', text: t('settings.installHint') })]),
            button({ label: t('settings.installApp'), icon: '📲', onClick: () => ctx.install && ctx.install() }),
          ]),
        ],
      }));
    }
  }

  async function loadDaily() {
    try {
      const settings = Settings.all;
      dailyInfo = await dailyChallenge({ dateKey: dayKey(), lang: settings.language, verify: false, difficulty: dailyDifficulty(dayKey(), settings.language) });
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
