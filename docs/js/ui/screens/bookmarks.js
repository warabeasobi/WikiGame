/* ui/screens/bookmarks.js — saved articles, favourite routes and challenges. */

import { el, formatTime, formatNumber, formatRelative, truncate } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, segmented, emptyState, difficultyBadge, modeBadge, languageBadge, badge } from '../components.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { articleUrl } from '../../api/wikipedia.js';
import { notify, confirmDialog } from '../notifications.js';
import { openExternal } from '../../navigation/articleRouter.js';

registerScreen('bookmarks', (ctx) => {
  const root = el('div', { class: 'screen screen--bookmarks' });
  let tab = 'articles';

  function render() {
    root.innerHTML = '';
    const locale = uiLocale();

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('bookmarks.title') }),
      el('p', { class: 'screen__sub', text: `${Bookmarks.count} ${t('bookmarks.saved').toLowerCase()}` }),
    ]));

    root.appendChild(segmented({
      ariaLabel: t('bookmarks.title'),
      value: tab,
      options: [
        { value: 'articles', label: `${t('bookmarks.articles')} (${Bookmarks.articles.length})`, icon: '📄' },
        { value: 'routes', label: `${t('bookmarks.routes')} (${Bookmarks.routes.length})`, icon: '🛣️' },
        { value: 'challenges', label: `${t('bookmarks.challenges')} (${Bookmarks.challenges.length})`, icon: '🎯' },
      ],
      onChange: (v) => { tab = v; render(); },
    }));

    if (tab === 'articles') renderArticles(locale);
    else if (tab === 'routes') renderRoutes(locale);
    else renderChallenges(locale);
  }

  function renderArticles(locale) {
    const list = Bookmarks.articles;
    if (!list.length) {
      root.appendChild(card({ body: [emptyState({ icon: '⭐', title: t('bookmarks.empty'), message: t('home.tip2') })] }));
      return;
    }
    const grid = el('div', { class: 'bookmark-grid' });
    for (const a of list) {
      grid.appendChild(el('div', { class: 'bookmark-card' }, [
        a.thumbnail && a.thumbnail.url ? el('img', { class: 'bookmark-card__thumb', src: a.thumbnail.url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : el('span', { class: 'bookmark-card__thumb bookmark-card__thumb--empty', text: '📄', 'aria-hidden': 'true' }),
        el('div', { class: 'bookmark-card__body' }, [
          el('strong', { class: 'bookmark-card__title', text: a.title }),
          a.description ? el('p', { class: 'muted', text: truncate(a.description, 90) }) : null,
          el('div', { class: 'bookmark-card__meta' }, [
            languageBadge(a.lang),
            el('span', { class: 'muted', text: formatRelative(a.ts, locale) }),
          ]),
        ]),
        el('div', { class: 'bookmark-card__actions' }, [
          button({
            label: t('game.inspect'),
            icon: '▶',
            variant: 'ghost',
            className: 'btn--sm',
            onClick: () => ctx.navigate('game', { config: { mode: 'sandbox', lang: a.lang, start: a.title }, mode: 'sandbox' }),
          }),
          button({
            label: 'Wikipedia',
            icon: '🔗',
            variant: 'ghost',
            className: 'btn--sm',
            onClick: () => openExternal(articleUrl(a.lang, a.title)),
          }),
          button({
            label: t('bookmarks.remove'),
            icon: '🗑',
            variant: 'ghost',
            className: 'btn--sm',
            onClick: () => { Bookmarks.removeArticle(a.lang, a.title); notify.info(t('toast.articleRemoved')); render(); },
          }),
        ]),
      ]));
    }
    root.appendChild(grid);
  }

  function renderRoutes(locale) {
    const list = Bookmarks.routes;
    if (!list.length) {
      root.appendChild(card({ body: [emptyState({ icon: '🛣️', title: t('bookmarks.empty'), message: t('results.bookmarkRoute') })] }));
      return;
    }
    for (const r of list) {
      root.appendChild(card({
        title: r.name,
        subtitle: t('bookmarks.savedOn', { date: new Date(r.ts).toLocaleDateString(locale) }),
        actions: [
          button({
            label: t('bookmarks.playRoute'),
            icon: '▶',
            variant: 'primary',
            className: 'btn--sm',
            onClick: () => ctx.navigate('game', {
              config: { mode: 'custom', lang: r.lang, difficulty: r.difficulty, start: r.start, target: r.target, allowHints: true, allowPowerups: true },
              mode: 'custom',
            }),
          }),
          button({ label: t('common.copy'), icon: '📋', variant: 'ghost', className: 'btn--sm', onClick: async () => {
            const { copyText } = await import('../../core/util.js');
            const ok = await copyText((r.route || []).map((s) => (typeof s === 'string' ? s : s.title)).join(' → '));
            notify[ok ? 'success' : 'error'](ok ? t('toast.routeCopied') : t('common.copyFailed'));
          } }),
          button({ label: t('bookmarks.remove'), icon: '🗑', variant: 'ghost', className: 'btn--sm', onClick: () => { Bookmarks.removeRoute(r.id); render(); } }),
        ],
        body: [
          el('div', { class: 'row row--wrap' }, [modeBadge(r.mode), difficultyBadge(r.difficulty), languageBadge(r.lang), badge(t('bookmarks.routeSummary', { clicks: r.clicks, time: formatTime(r.elapsedMs) }), { tone: 'neutral' })]),
          el('p', { class: 'route-chain', text: (r.route || []).map((s) => (typeof s === 'string' ? s : s.title)).join(' → ') }),
        ],
      }));
    }
  }

  function renderChallenges(locale) {
    const list = Bookmarks.challenges;
    if (!list.length) {
      root.appendChild(card({ body: [emptyState({ icon: '🎯', title: t('bookmarks.empty'), message: t('bookmarks.playChallenge') })] }));
      return;
    }
    for (const c of list) {
      root.appendChild(card({
        title: c.name,
        subtitle: `${c.day} · ${new Date(c.ts).toLocaleDateString(locale)}`,
        actions: [
          button({
            label: t('bookmarks.playChallenge'),
            icon: '▶',
            variant: 'primary',
            className: 'btn--sm',
            onClick: () => ctx.navigate('game', {
              config: { mode: 'custom', lang: c.lang, difficulty: c.difficulty, start: c.start, target: c.target, allowHints: true, allowPowerups: true },
              mode: 'custom',
            }),
          }),
          button({ label: t('bookmarks.remove'), icon: '🗑', variant: 'ghost', className: 'btn--sm', onClick: () => { Bookmarks.removeChallenge(c.id); render(); } }),
        ],
        body: [el('div', { class: 'row row--wrap' }, [difficultyBadge(c.difficulty), languageBadge(c.lang), badge(c.seed ? `${t('daily.seed')} ${c.seed}` : c.mode, { tone: 'neutral' })])],
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
