/* ui/screens/stats.js — personal statistics with charts and run history. */

import { el, formatTime, formatNumber, formatDurationWords, titleKey, dayKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, statTile, runRow, emptyState, segmented, difficultyBadge } from '../components.js';
import { lineChart, barChart, donutChart, progressBar } from '../charts.js';
import { Statistics } from '../../storage/statistics.js';
import { LANGUAGES } from '../../api/wikipedia.js';
import { difficultyConfig, DIFFICULTIES } from '../../game/difficulty.js';
import { MODE_LABELS, MODE_LABEL_KEYS } from '../../game/scoring.js';

registerScreen('stats', (ctx) => {
  const root = el('div', { class: 'screen screen--stats' });
  let metric = 'timeMs';
  let runFilter = 'all';

  function render() {
    root.innerHTML = '';
    const s = Statistics.summary();
    const locale = uiLocale();

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('stats.title') }),
      el('p', { class: 'screen__sub', text: s.totalRuns ? `${s.totalRuns} ${t('stats.runs')} · ${formatDurationWords(s.totalPlayMs)} ${t('stats.totalPlayTime').toLowerCase()}` : t('stats.noData') }),
    ]));

    if (!s.totalRuns) {
      root.appendChild(card({ body: [emptyState({
        icon: '📊',
        title: t('stats.noData'),
        message: t('home.quickPlayDesc'),
        action: button({ label: t('home.quickPlay'), icon: '⚡', onClick: () => ctx.navigate('play', { mode: 'quick', autostart: true }) }),
      })] }));
      return;
    }

    /* Headline tiles ------------------------------------------------ */
    root.appendChild(el('div', { class: 'grid grid--tiles' }, [
      statTile({ label: t('stats.runs'), value: formatNumber(s.totalRuns, locale), icon: '🎮' }),
      statTile({ label: t('stats.completed'), value: formatNumber(s.completedRuns, locale), icon: '✅', tone: 'success' }),
      statTile({ label: t('stats.failed'), value: formatNumber(s.failedRuns, locale), icon: '❌', tone: 'danger' }),
      statTile({ label: t('stats.fastestRun'), value: s.best.timeMs ? formatTime(s.best.timeMs) : '-', icon: '⚡', tone: 'accent' }),
      statTile({ label: t('stats.fewestClicks'), value: s.best.clicks !== null ? String(s.best.clicks) : '-', icon: '🖱️' }),
      statTile({ label: t('stats.bestScore'), value: s.best.score ? formatNumber(s.best.score, locale) : '-', icon: '🏅', tone: 'accent' }),
      statTile({ label: t('stats.currentStreak'), value: String(s.streak.current), icon: '🔥', tone: s.streak.current > 2 ? 'accent' : null }),
      statTile({ label: t('stats.uniqueArticles'), value: formatNumber(s.totalUniqueArticles, locale), icon: '📚' }),
      statTile({ label: t('stats.totalPlayTime'), value: formatDurationWords(s.totalPlayMs), icon: '⌛' }),
    ]));

    /* Secondary numbers: a definition list, not another grid of tiles. */
    const secondary = [
      [t('stats.completionRate'), `${Math.round(s.completionRate * 100)}%`],
      [t('stats.avgTime'), s.completedRuns ? formatTime(s.averageTimeMs) : '-'],
      [t('stats.avgClicks'), s.completedRuns ? s.averageClicks.toFixed(1) : '-'],
      [t('stats.longestRoute'), String(s.extremes.longestRoute || 0)],
      [t('stats.shortestRoute'), s.extremes.shortestRoute !== null ? String(s.extremes.shortestRoute) : '-'],
      [t('stats.longestStreak'), String(s.streak.longest)],
      [t('stats.articlesVisited'), formatNumber(s.runs.reduce((a, r) => a + r.route.length, 0), locale)],
      [t('stats.languagesPlayed'), String(s.languagesPlayed.length)],
      [t('stats.runsThisWeek'), String(s.runsThisWeek)],
    ];
    root.appendChild(el('dl', { class: 'facts' }, secondary.flatMap(([label, value]) => [
      el('dt', { class: 'facts__key', text: label }),
      el('dd', { class: 'facts__val', text: value }),
    ])));

    /* Trend chart --------------------------------------------------- */
    const metricOptions = [
      { value: 'timeMs', label: t('common.time'), icon: '⏱' },
      { value: 'clicks', label: t('common.clicks'), icon: '🖱️' },
      { value: 'score', label: t('common.score'), icon: '🏅' },
      { value: 'route', label: t('common.articles'), icon: '📄' },
    ];
    const series = Statistics.series(metric, { limit: 30, completedOnly: true });
    const chartData = series.map((p, i) => ({
      value: p.value,
      label: `#${i + 1}`,
      ts: p.ts,
    }));
    root.appendChild(card({
      title: metric === 'timeMs' ? t('stats.timeChart') : metric === 'clicks' ? t('stats.clicksChart') : t('stats.title'),
      subtitle: metric === 'score' ? t('common.score') : null,
      actions: [segmented({
        ariaLabel: t('stats.title'),
        value: metric,
        options: metricOptions,
        onChange: (v) => { metric = v; render(); },
      })],
      body: [
        chartData.length > 1
          ? lineChart(chartData, {
            format: (v) => (metric === 'timeMs' ? formatTime(v, { showMs: false }) : formatNumber(Math.round(v), locale)),
            lowerIsBetter: metric !== 'score',
            ariaLabel: t('stats.timeChart'),
          })
          : emptyState({ icon: '📈', title: t('stats.noData'), message: t('home.noRuns') }),
        el('div', { class: 'chart-stats' }, [
          el('span', {}, [el('span', { class: 'muted', text: t('common.best') }), el('strong', { text: metric === 'timeMs' ? formatTime(Math.min(...chartData.map((d) => d.value))) : formatNumber(Math.max(...chartData.map((d) => (metric === 'score' ? d.value : -d.value))) * -1, locale) })]),
          el('span', {}, [el('span', { class: 'muted', text: t('common.average') }), el('strong', { text: metric === 'timeMs' ? formatTime(s.averageTimeMs) : s.averageClicks.toFixed(1) })]),
          el('span', {}, [el('span', { class: 'muted', text: t('stats.runs') }), el('strong', { text: String(chartData.length) })]),
        ]),
      ],
    }));

    /* Distribution -------------------------------------------------- */
    const dist = el('div', { class: 'grid grid--2' });

    const diffData = DIFFICULTIES.map((d) => ({
      label: `${d.emoji} ${d.label}`,
      value: (s.perDifficulty[d.id] || {}).runs || 0,
      color: d.accent,
    })).filter((d) => d.value > 0);
    dist.appendChild(card({
      title: t('stats.difficultyMix'),
      body: [diffData.length ? barChart(diffData, { format: (v) => String(v), ariaLabel: t('stats.difficultyMix') }) : el('p', { class: 'muted', text: t('stats.noData') })],
    }));

    const langSegments = Object.entries(s.perLanguage).map(([code, v]) => {
      const meta = LANGUAGES.find((l) => l.code === code);
      const palette = ['#4c8dff', '#3fb950', '#f0883e', '#a371f7', '#f85149', '#39c5cf'];
      return {
        label: meta ? `${meta.flag} ${meta.label}` : code,
        value: v.runs || 0,
        color: palette[LANGUAGES.findIndex((l) => l.code === code) % palette.length],
      };
    }).filter((x) => x.value > 0);
    dist.appendChild(card({
      title: t('stats.languagesPlayed'),
      body: [langSegments.length ? donutChart(langSegments, { centerLabel: String(s.languagesPlayed.length), centerSub: t('common.total') }) : el('p', { class: 'muted', text: t('stats.noData') })],
    }));
    root.appendChild(dist);

    /* Per mode ------------------------------------------------------ */
    const modeRows = Object.entries(s.perMode).filter(([, v]) => v.runs > 0).map(([mode, v]) => el('li', { class: 'mode-stat' }, [
      el('span', { class: 'mode-stat__name', text: MODE_LABEL_KEYS[mode] ? t(MODE_LABEL_KEYS[mode]) : (MODE_LABELS[mode] || mode) }),
      el('span', { class: 'mode-stat__runs', text: `${v.runs} ${t('stats.runs')}` }),
      el('span', { class: 'mode-stat__best' }, [
        el('span', { class: 'muted', text: t('common.best') }),
        el('strong', { text: v.bestTimeMs ? formatTime(v.bestTimeMs) : '-' }),
      ]),
      el('span', { class: 'mode-stat__score' }, [
        el('span', { class: 'muted', text: t('common.score') }),
        el('strong', { text: v.bestScore ? formatNumber(v.bestScore, locale) : '-' }),
      ]),
      progressBar(v.runs / Math.max(1, s.totalRuns), { label: '', value: `${Math.round((v.completed / Math.max(1, v.runs)) * 100)}%` }),
    ]));
    root.appendChild(card({ title: t('stats.perMode'), body: [modeRows.length ? el('ul', { class: 'mode-stats' }, modeRows) : el('p', { class: 'muted', text: t('stats.noData') })] }));

    /* Run history --------------------------------------------------- */
    const filters = [
      { value: 'all', label: t('common.all') },
      { value: 'completed', label: t('stats.completed') },
      { value: 'failed', label: t('stats.failed') },
    ];
    const runs = Statistics.runs({ limit: 40 }).filter((r) => runFilter === 'all' || (runFilter === 'completed' ? r.completed : !r.completed));
    root.appendChild(card({
      title: t('stats.recent'),
      actions: [segmented({ ariaLabel: t('stats.recent'), value: runFilter, options: filters, onChange: (v) => { runFilter = v; render(); } })],
      body: [
        runs.length
          ? el('div', { class: 'run-list' }, runs.map((r) => runRow(r, { onOpen: (run) => ctx.navigate('replay', { runId: run.id }) })))
          : emptyState({ icon: '📭', title: t('stats.noData'), message: t('common.noResults') }),
      ],
    }));

    /* Recent articles ----------------------------------------------- */
    const recent = Statistics.recentArticles(18);
    if (recent.length) {
      root.appendChild(card({
        title: t('stats.articlesVisited'),
        body: [el('div', { class: 'tag-cloud' }, recent.map((a) => el('button', {
          class: 'tag',
          type: 'button',
          title: a.lang,
          onClick: () => ctx.navigate('game', { config: { mode: 'sandbox', lang: a.lang, start: a.title }, mode: 'sandbox' }),
        }, [
          el('span', { text: a.title }),
          a.count > 1 ? el('span', { class: 'tag__count', text: `×${a.count}` }) : null,
        ])))],
      }));
    }
  }

  render();
  return {
    el: root,
    onShow() { render(); },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
