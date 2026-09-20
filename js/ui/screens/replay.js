/* ui/screens/replay.js — reviews a finished run: full route, timestamps,
 * click order and time spent per article, with an optional auto timeline. */

import { el, formatTime, formatNumber, titleKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, statTile, difficultyBadge, modeBadge, languageBadge, emptyState, articlePreviewCard } from '../components.js';
import { starRating } from '../charts.js';
import { Statistics } from '../../storage/statistics.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { game } from '../../game/gameState.js';
import { articleUrl } from '../../api/wikipedia.js';
import { notify } from '../notifications.js';
import { Settings } from '../../storage/settings.js';

registerScreen('replay', (ctx) => {
  const root = el('div', { class: 'screen screen--replay' });
  let run = null;
  let playing = false;
  let timer = null;
  let activeIndex = -1;

  function render() {
    root.innerHTML = '';
    if (!run) {
      root.appendChild(emptyState({ icon: '📄', title: t('stats.noData'), action: button({ label: t('nav.home'), onClick: () => ctx.navigate('home') }) }));
      return;
    }
    const locale = uiLocale();
    const route = run.route || [];

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('game.replayPlay') }),
      el('p', { class: 'screen__sub', text: `${run.start} → ${run.target}` }),
      el('div', { class: 'row row--wrap' }, [
        modeBadge(run.mode), difficultyBadge(run.difficulty), languageBadge(run.lang),
        run.stars ? starRating(run.stars, { size: 'sm' }) : null,
      ]),
    ]));

    root.appendChild(el('div', { class: 'grid grid--tiles' }, [
      statTile({ label: t('common.time'), value: formatTime(run.elapsedMs), icon: '⏱' }),
      statTile({ label: t('common.clicks'), value: String(run.clicks), icon: '🖱️' }),
      statTile({ label: t('common.score'), value: formatNumber(run.score, locale), icon: '🏅' }),
      statTile({ label: t('common.articles'), value: String(route.length), icon: '📄' }),
      statTile({ label: t('common.hints'), value: String(run.hintsUsed), icon: '💡' }),
      statTile({ label: t('common.powerups'), value: String(run.powerupsUsed), icon: '🧰' }),
    ]));

    const controls = el('div', { class: 'row row--wrap replay-controls' }, [
      button({
        label: playing ? t('game.replayStop') : t('game.replayAuto'),
        icon: playing ? '⏹' : '▶',
        variant: playing ? 'danger' : 'primary',
        onClick: () => (playing ? stop() : play()),
      }),
      button({ label: t('bookmarks.playRoute'), icon: '⭐', variant: 'ghost', onClick: saveRoute }),
      button({
        label: t('common.newChallenge'),
        icon: '🔁',
        variant: 'ghost',
        onClick: () => ctx.navigate('game', {
          config: { mode: 'custom', lang: run.lang, difficulty: run.difficulty, start: run.start, target: run.target, allowHints: true, allowPowerups: true },
          mode: 'custom',
        }),
      }),
    ]);
    root.appendChild(card({ body: [controls] }));

    /* Timeline ------------------------------------------------------ */
    const timeline = el('ol', { class: 'timeline' });
    route.forEach((step, i) => {
      const isTarget = titleKey(step.title) === titleKey(run.target);
      const li = el('li', { class: `timeline__item ${isTarget ? 'is-target' : ''}`, dataset: { index: String(i) } }, [
        el('span', { class: 'timeline__marker', text: i === 0 ? '🚩' : isTarget ? '🎯' : String(i) }),
        el('div', { class: 'timeline__body' }, [
          el('button', { class: 'timeline__title', type: 'button', text: step.title, onClick: () => showPreview(step.title) }),
          el('div', { class: 'timeline__meta' }, [
            el('span', { text: `${t('common.click')} #${i}` }),
            step.elapsedMs !== null && step.elapsedMs !== undefined ? el('span', { text: `@ ${formatTime(step.elapsedMs)}` }) : null,
            step.spentMs !== null && step.spentMs !== undefined ? el('span', { text: `${t('game.timeSpentHere')}: ${formatTime(step.spentMs)}` }) : null,
            step.via && step.via !== 'link' ? el('span', { class: 'muted', text: step.via }) : null,
          ]),
        ]),
        el('span', { class: 'timeline__bar', style: { width: `${Math.min(100, ((step.spentMs || 0) / Math.max(1, run.elapsedMs)) * 100)}%` } }),
      ]);
      timeline.appendChild(li);
    });
    root.appendChild(card({ title: t('results.routeTitle'), body: [timeline] }));

    root.appendChild(el('div', { class: 'row row--wrap' }, [
      button({ label: t('common.back'), variant: 'ghost', onClick: () => ctx.navigate('results', { runId: run.id }) }),
      button({ label: t('common.statistics'), variant: 'ghost', onClick: () => ctx.navigate('stats') }),
      button({ label: t('nav.home'), variant: 'ghost', onClick: () => ctx.navigate('home') }),
    ]));
  }

  function play() {
    playing = true;
    activeIndex = -1;
    render();
    const items = root.querySelectorAll('.timeline__item');
    timer = setInterval(() => {
      if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].classList.remove('is-active');
      activeIndex += 1;
      if (activeIndex >= items.length) { stop(); return; }
      items[activeIndex].classList.add('is-active');
      items[activeIndex].scrollIntoView({ block: 'nearest', behavior: Settings.get('animations') ? 'smooth' : 'auto' });
    }, 620);
  }

  function stop() {
    playing = false;
    clearInterval(timer);
    timer = null;
    render();
  }

  async function showPreview(title) {
    const { modal } = await import('../notifications.js');
    const wrap = el('div', { class: 'inspect' }, [el('p', { class: 'muted', text: t('common.loading') })]);
    modal({
      title,
      body: wrap,
      actions: [
        { id: 'open', label: t('common.readMore'), variant: 'ghost' },
        { id: 'close', label: t('common.close'), variant: 'primary' },
      ],
      onMount: async () => {
        const card = await articlePreviewCard(run.lang, title);
        wrap.innerHTML = '';
        wrap.appendChild(card);
      },
    }).then((choice) => { if (choice === 'open') window.open(articleUrl(run.lang, title), '_blank', 'noopener'); });
  }

  function saveRoute() {
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
    onShow(params = {}) {
      if (params.runId) run = Statistics.getRun(params.runId);
      else if (params.run) run = params.run;
      render();
    },
    onHide() { clearInterval(timer); playing = false; },
    destroy() { clearInterval(timer); root.innerHTML = ''; },
  };
});
