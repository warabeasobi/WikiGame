/* ui/screens/results.js — completion screen: time, clicks, score breakdown,
 * stars, personal-best comparison, achievements, route and next actions. */

import { el, formatTime, formatNumber, titleKey, dayKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, statTile, scoreBreakdown, routeList, difficultyBadge, modeBadge, languageBadge, xpBar } from '../components.js';
import { starRating } from '../charts.js';
import { Statistics } from '../../storage/statistics.js';
import { Profile } from '../../storage/profile.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { Settings } from '../../storage/settings.js';
import { game } from '../../game/gameState.js';
import { dailyChallenge } from '../../game/challenges.js';
import { notify, achievementPopup } from '../notifications.js';
import { copyText } from '../../core/util.js';
import { playSound } from '../sound.js';

registerScreen('results', (ctx) => {
  const root = el('div', { class: 'screen screen--results' });
  let result = null;
  let run = null;
  let params = {};

  function render() {
    root.innerHTML = '';
    if (!run) {
      root.appendChild(el('div', { class: 'empty-state' }, [
        el('span', { class: 'empty-state__icon', text: '📄', 'aria-hidden': 'true' }),
        el('strong', { class: 'empty-state__title', text: t('stats.noData') }),
        button({ label: t('nav.home'), onClick: () => ctx.navigate('home') }),
      ]));
      return;
    }

    const completed = run.completed;
    const locale = uiLocale();
    const score = result ? result.score : null;
    const rating = result ? result.rating : { stars: run.stars, label: '' };
    const comparison = result ? result.comparison : null;

    /* Banner -------------------------------------------------------- */
    const banner = el('section', { class: `results-hero ${completed ? 'is-win' : 'is-lose'}` }, [
      el('span', { class: 'results-hero__badge', text: completed ? '🎯' : '⏳', 'aria-hidden': 'true' }),
      el('h1', { class: 'results-hero__title', text: completed ? t('results.title') : t('results.failedTitle') }),
      el('p', { class: 'results-hero__sub', text: completed ? t('results.reached') : t('results.timeUpNote') }),
      el('div', { class: 'results-hero__pair' }, [
        el('span', { class: 'results-hero__chip' }, [el('span', { class: 'muted', text: t('game.start') }), el('strong', { text: run.start })]),
        el('span', { class: 'results-hero__arrow', text: '→', 'aria-hidden': 'true' }),
        el('span', { class: 'results-hero__chip' }, [el('span', { class: 'muted', text: t('game.target') }), el('strong', { text: run.target })]),
      ]),
      el('div', { class: 'results-hero__meta' }, [
        modeBadge(run.mode),
        difficultyBadge(run.difficulty),
        languageBadge(run.lang),
        ...(run.modifiers || []).map((m) => el('span', { class: 'badge badge--modifier', text: m })),
      ]),
      completed ? starRating(rating.stars, { size: 'lg', animate: Settings.get('animations') }) : null,
      rating.label ? el('p', { class: 'results-hero__rating', text: rating.label }) : null,
    ]);
    root.appendChild(banner);

    if (completed && Settings.get('animations')) {
      requestAnimationFrame(() => banner.classList.add('is-in'));
    }

    /* Key numbers --------------------------------------------------- */
    const tiles = el('div', { class: 'grid grid--tiles' }, [
      statTile({ label: t('common.time'), value: formatTime(run.elapsedMs), icon: '⏱', tone: 'primary' }),
      statTile({ label: t('common.clicks'), value: String(run.clicks), icon: '🖱️' }),
      statTile({ label: t('common.score'), value: formatNumber(run.score, locale), icon: '🏅', tone: 'accent' }),
      statTile({ label: t('common.difficulty'), value: run.difficulty, icon: '🎚' }),
      statTile({ label: t('common.hints'), value: String(run.hintsUsed), icon: '💡' }),
      statTile({ label: t('common.powerups'), value: String(run.powerupsUsed), icon: '🧰' }),
      run.mode === 'endless' ? statTile({ label: t('endless.reached'), value: String(run.stages || 0), icon: '♾️' }) : null,
      statTile({ label: t('stats.runs'), value: String(Statistics.all.routesCount || Statistics.all.totalRuns), icon: '🎮' }),
    ].filter(Boolean));
    root.appendChild(tiles);

    /* PB comparison ------------------------------------------------- */
    if (completed && comparison) {
      const rows = [];
      const fmt = (v, kind) => (v === null || v === undefined ? '—' : kind === 'time' ? formatTime(v) : formatNumber(v, locale));
      const pb = comparison.personalBest;
      const prev = comparison.previousBest;
      const metrics = [
        { key: 'time', label: t('stats.fastestRun'), cur: run.elapsedMs, best: pb.timeMs, prev: prev.timeMs, kind: 'time', lower: true },
        { key: 'clicks', label: t('stats.fewestClicks'), cur: run.clicks, best: pb.clicks, prev: prev.clicks, kind: 'num', lower: true },
        { key: 'score', label: t('stats.bestScore'), cur: run.score, best: pb.score, prev: prev.score, kind: 'num', lower: false },
      ];
      for (const m of metrics) {
        const isNew = comparison.improvedKeys.includes(m.key);
        rows.push(el('li', { class: `pb-row ${isNew ? 'is-new' : ''}` }, [
          el('span', { class: 'pb-row__label', text: m.label }),
          el('span', { class: 'pb-row__cur', text: fmt(m.cur, m.kind) }),
          el('span', { class: 'pb-row__arrow', text: isNew ? '🏆' : '·', 'aria-hidden': 'true' }),
          el('span', { class: 'pb-row__best' }, [
            el('span', { class: 'muted', text: t('common.personalBest') }),
            el('strong', { text: fmt(m.best, m.kind) }),
          ]),
          m.prev !== null && m.prev !== undefined
            ? el('span', { class: 'pb-row__prev' }, [
              el('span', { class: 'muted', text: t('common.previousBest') }),
              el('span', { text: fmt(m.prev, m.kind) }),
            ])
            : el('span', { class: 'pb-row__prev muted', text: t('common.firstRun') }),
        ]));
      }
      root.appendChild(card({
        title: t('results.compareTitle'),
        className: comparison.isFirst ? 'card--accent' : '',
        body: [
          comparison.isFirst ? el('p', { class: 'record-flash', text: `🎉 ${t('common.firstRun')}` }) : null,
          !comparison.isFirst && comparison.improved ? el('p', { class: 'record-flash', text: `🏆 ${t('common.newRecord')}` }) : null,
          el('ul', { class: 'pb-list' }, rows),
        ],
      }));
    }

    /* Score breakdown ----------------------------------------------- */
    if (score && run.mode !== 'sandbox') {
      root.appendChild(card({
        title: t('results.breakdown'),
        body: [scoreBreakdown(score)],
      }));
    }

    /* XP / achievements --------------------------------------------- */
    const xp = result ? result.xp : null;
    const achievements = result ? result.achievements || [] : [];
    if (completed && xp && xp.total > 0) {
      root.appendChild(card({
        title: t('profile.xp'),
        body: [
          el('div', { class: 'xp-gain' }, [
            el('strong', { class: 'xp-gain__value', text: `+${formatNumber(xp.total, locale)} XP` }),
            el('ul', { class: 'xp-gain__parts' }, xp.parts.filter((p) => p.value !== 0).map((p) => el('li', {}, [
              el('span', { text: p.key }),
              el('strong', { text: `${p.value > 0 ? '+' : ''}${p.value}` }),
            ]))),
          ]),
          xpBar(Profile.progress),
          result && result.level ? el('p', { class: 'field__hint', text: t('profile.xpNote') }) : null,
        ],
      }));
    }

    if (achievements.length) {
      root.appendChild(card({
        title: t('ach.newAchievement'),
        className: 'card--accent',
        body: [el('div', { class: 'ach-list ach-list--compact' }, achievements.map((a) => el('div', { class: 'ach-chip is-unlocked' }, [
          el('span', { class: 'ach-chip__icon', text: a.icon, 'aria-hidden': 'true' }),
          el('div', {}, [
            el('strong', { text: t(`ach.${a.id}.name`) }),
            el('span', { class: 'muted', text: t(`ach.${a.id}.desc`) }),
          ]),
        ])))],
      }));
    }

    /* Route --------------------------------------------------------- */
    const route = run.route || [];
    root.appendChild(card({
      title: t('results.routeTitle'),
      actions: [
        button({ label: t('game.replayPlay'), icon: '▶', variant: 'ghost', onClick: () => ctx.navigate('replay', { runId: run.id }) }),
        button({
          label: t('common.copy'),
          icon: '📋',
          variant: 'ghost',
          onClick: async () => {
            const text = route.map((s) => s.title).join(' → ');
            const ok = await copyText(`${text}\n${formatTime(run.elapsedMs)} · ${run.clicks} clicks`);
            notify[ok ? 'success' : 'error'](ok ? t('toast.routeCopied') : t('common.copyFailed'));
          },
        }),
      ],
      body: [
        routeList(route.map((s) => ({ ...s, spentMs: s.spentMs })), { lang: run.lang, onInspect: (step) => ctx.navigate('replay', { runId: run.id }) }),
        el('p', { class: 'field__hint', text: `${route.length} ${t('common.articles')} · ${run.clicks} ${t('common.clicks')} · ${t('game.timeSpentHere')}: ${formatTime(run.elapsedMs)}` }),
      ],
    }));

    /* Actions ------------------------------------------------------- */
    const actions = el('div', { class: 'results-actions' }, [
      button({ label: t('common.playAgain'), icon: '🔁', variant: 'primary', className: 'btn--lg', onClick: () => replaySame() }),
      run.mode === 'daily'
        ? button({ label: t('daily.replay'), icon: '📅', variant: 'ghost', className: 'btn--lg', onClick: () => ctx.navigate('daily') })
        : button({ label: t('common.newChallenge'), icon: '🎲', variant: 'ghost', className: 'btn--lg', onClick: () => ctx.navigate('play', { mode: run.mode, autostart: true }) }),
      button({ label: t('bookmarks.playRoute'), icon: '⭐', variant: 'ghost', onClick: saveRoute }),
      button({ label: t('common.statistics'), icon: '📊', variant: 'ghost', onClick: () => ctx.navigate('stats') }),
      button({ label: t('nav.home'), icon: '🏠', variant: 'ghost', onClick: () => ctx.navigate('home') }),
    ]);
    root.appendChild(actions);
  }

  async function replaySame() {
    if (!run) return;
    if (run.mode === 'daily') {
      try {
        const ch = await dailyChallenge({ dateKey: dayKey(), lang: run.lang, verify: false });
        ctx.navigate('game', { config: { mode: 'daily', lang: run.lang, start: ch.start, target: ch.target, difficulty: ch.difficulty, allowHints: true, allowPowerups: true }, mode: 'daily' });
      } catch (err) { notify.error(t('error.apiFail')); }
      return;
    }
    ctx.navigate('game', {
      config: {
        mode: run.mode === 'endless' || run.mode === 'sandbox' ? run.mode : 'custom',
        lang: run.lang,
        difficulty: run.difficulty,
        start: run.mode === 'endless' || run.mode === 'sandbox' ? null : run.start,
        target: run.mode === 'endless' || run.mode === 'sandbox' ? null : run.target,
        allowHints: true,
        allowPowerups: true,
      },
      mode: run.mode,
    });
  }

  function saveRoute() {
    if (!run) return;
    const saved = Bookmarks.saveRoute({
      name: `${run.start} → ${run.target}`,
      lang: run.lang,
      start: run.start,
      target: run.target,
      clicks: run.clicks,
      elapsedMs: run.elapsedMs,
      route: run.route,
      difficulty: run.difficulty,
      mode: run.mode,
      score: run.score,
    });
    notify[saved ? 'success' : 'info'](saved ? t('results.routeSaved') : t('bookmarks.saved'));
  }

  return {
    el: root,
    onShow(p = {}) {
      params = p || {};
      if (p.result) {
        result = p.result;
        run = p.result.run;
      } else if (p.runId) {
        run = Statistics.getRun(p.runId);
        result = null;
      }
      render();
      if (p.fromGame && result && result.achievements && result.achievements.length) {
        result.achievements.forEach((a, i) => setTimeout(() => achievementPopup({
          name: t(`ach.${a.id}.name`),
          desc: t(`ach.${a.id}.desc`),
          icon: a.icon,
          xp: a.xp,
        }), 400 + i * 900));
      }
      if (p.fromGame && result && result.comparison && result.comparison.improved && !result.comparison.isFirst) {
        setTimeout(() => notify.success(t('toast.record'), { icon: '🏆' }), 250);
      }
    },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
