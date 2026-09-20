/* ui/screens/game.js — the gameplay screen.
 *
 * Layout: sticky HUD on top, Wikipedia article body below (the reading area),
 * collapsible route panel, and a bottom sheet with hints/power-ups.
 * The HUD is updated in place; the article DOM is only rebuilt when a new
 * article is loaded, so the timer stays smooth while reading.
 */

import { el, formatTime, titleKey, truncate, haptic, debounce } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { Hud } from '../hud.js';
import { ArticleRouter, openExternal } from '../../navigation/articleRouter.js';
import { parseArticleHtml, extractLead, markVisited } from '../../navigation/articleParser.js';
import { game, describeError } from '../../game/gameState.js';
import { HINT_TYPES, hintById } from '../../game/hints.js';
import { powerupsForMode } from '../../game/powerups.js';
import { Settings } from '../../storage/settings.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { modal, notify, confirmDialog } from '../notifications.js';
import { button, badge, articlePreviewCard, routeList } from '../components.js';
import { playSound, unlockAudio } from '../sound.js';
import { articleUrl } from '../../api/wikipedia.js';

registerScreen('game', (ctx) => {
  const root = el('div', { class: 'screen screen--game' });

  const hudSlot = el('div', { class: 'game__hud-slot' });
  const progressBar = el('div', { class: 'game__loadbar' }, [el('span', { class: 'game__loadbar-fill' })]);
  const articleHost = el('article', { class: 'wiki', id: 'wiki-article', 'aria-live': 'polite', tabindex: '-1' });
  const sidebar = el('aside', { class: 'game__side' });
  const sheet = el('div', { class: 'sheet', id: 'game-sheet', 'aria-hidden': 'true' });
  const banner = el('div', { class: 'game__banner is-hidden', role: 'status' });

  const layout = el('div', { class: 'game__layout' }, [
    el('div', { class: 'game__main' }, [banner, progressBar, articleHost]),
    sidebar,
  ]);

  root.append(hudSlot, layout, sheet);

  const hud = new Hud({ compact: Settings.get('compactHud'), onAction: handleHudAction });
  hud.mount(hudSlot);

  const router = new ArticleRouter(articleHost, {
    getLang: () => game.state.lang,
    previews: !(game.state.rules && game.state.rules.previewsDisabled),
    onNavigate: (title) => navigateTo(title),
    onBlocked: (title, ns) => {
      game.registerBlockedClick(title, ns);
      hud.showWarning(t('game.blockedNamespace'));
      playSound('blocked');
    },
    onExternal: (url) => openExternal(url),
  });

  let routerAttached = false;
  let hintCountdown = null;
  let autoReplay = null;
  let unsubs = [];

  /* ---------------------------------------------------------------- */
  /* Article rendering                                                */
  /* ---------------------------------------------------------------- */

  function renderArticle(article) {
    articleHost.innerHTML = '';
    articleHost.setAttribute('dir', 'ltr');
    const head = el('header', { class: 'wiki__head' }, [
      el('h1', { class: 'wiki__title', id: 'article-title' }),
      el('div', { class: 'wiki__meta' }),
      el('div', { class: 'wiki__tools' }),
    ]);
    head.querySelector('.wiki__title').textContent = article.title;
    const meta = head.querySelector('.wiki__meta');
    if (article.description) meta.appendChild(el('p', { class: 'wiki__desc', text: article.description }));
    meta.appendChild(el('p', { class: 'wiki__attribution', text: `${article.lang.toUpperCase()} Wikipedia · CC BY-SA` }));
    articleHost.appendChild(head);

    const { fragment, links, blockedCount, headings } = parseArticleHtml(article.html, { lang: article.lang });
    markVisited(fragment, game.visitedKeys());

    const tools = head.querySelector('.wiki__tools');
    const isSaved = Bookmarks.isArticleSaved(article.lang, article.title);
    tools.append(
      el('button', {
        class: `icon-btn ${isSaved ? 'is-on' : ''}`,
        type: 'button',
        title: t('bookmarks.saveArticle'),
        'aria-label': t('bookmarks.saveArticle'),
        text: isSaved ? '★' : '☆',
        onClick: async (e) => {
          const btn = e.currentTarget;
          const saved = Bookmarks.toggleArticle({
            lang: article.lang,
            title: article.title,
            description: article.description,
            thumbnail: article.thumbnail,
          });
          btn.textContent = saved ? '★' : '☆';
          btn.classList.toggle('is-on', saved);
          notify.success(saved ? t('toast.articleSaved') : t('toast.articleRemoved'));
        },
      }),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        title: t('common.readMore'),
        'aria-label': t('common.readMore'),
        text: '🔗',
        onClick: () => openExternal(articleUrl(article.lang, article.title)),
      }),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        title: t('common.copy'),
        'aria-label': t('common.copy'),
        text: '📋',
        onClick: async () => {
          const { copyText } = await import('../../core/util.js');
          const ok = await copyText(articleUrl(article.lang, article.title));
          notify[ok ? 'success' : 'error'](ok ? t('common.copied') : t('common.copyFailed'));
        },
      }),
    );

    // Table of contents (collapsible, from real headings)
    if (headings.length > 2) {
      const toc = el('nav', { class: 'wiki__toc', 'aria-label': 'Contents' });
      const details = el('details', { class: 'wiki__toc-details' }, [
        el('summary', { text: `${t('common.preview')} · ${headings.length}` }),
        el('ul', { class: 'wiki__toc-list' }, headings.filter((h) => h.level === 2).slice(0, 24).map((h) => el('li', {}, [
          el('button', {
            class: 'wiki__toc-link',
            type: 'button',
            text: h.text,
            onClick: () => {
              const target = articleHost.querySelector(`[id="${CSS.escape(h.id)}"]`);
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
          }),
        ]))),
      ]);
      toc.appendChild(details);
      articleHost.appendChild(toc);
    }

    // Contextual preview strip (Double vision shows more)
    const lead = extractLead(fragment, 280);
    if (lead) {
      const info = el('div', { class: 'wiki__lead-preview' }, [el('p', { text: truncate(lead, 240) })]);
      articleHost.appendChild(info);
    }

    const body = el('div', { class: 'wiki__body' });
    body.appendChild(fragment);
    articleHost.appendChild(body);

    const foot = el('footer', { class: 'wiki__foot' }, [
      el('span', { class: 'muted', text: `${links.length} article links` }),
      blockedCount ? el('span', { class: 'muted', text: `· ${blockedCount} non-article links ignored` }) : null,
      el('a', { class: 'wiki__source', href: articleUrl(article.lang, article.title), target: '_blank', rel: 'noopener noreferrer', text: 'Wikipedia ↗' }),
    ]);
    articleHost.appendChild(foot);

    if (!routerAttached) { router.attach(); routerAttached = true; }
    router.previews = !(game.state.rules && game.state.rules.previewsDisabled);
    router.clearScan();
    if (game.state.effects.scanner) applyScanner();

    if (article.fromCache) hud.showWarning('Loaded from offline cache', { tone: 'info' });
  }

  /* ---------------------------------------------------------------- */
  /* Navigation                                                       */
  /* ---------------------------------------------------------------- */

  async function navigateTo(title) {
    if (game.state.status === 'paused') {
      await confirmDialog(t('common.paused'), { title: t('common.resume'), confirmLabel: t('common.resume'), cancelLabel: t('common.cancel') })
        .then((ok) => { if (ok) game.resume(); });
      if (game.state.status === 'paused') return;
    }
    unlockAudio();
    playSound('navigate');
    haptic(8);
    const article = await game.navigate(title);
    if (article) {
      renderArticle(article);
      hud.showWarning(t('game.redirected', { title: article.title }), { tone: 'info', duration: 1400 });
      scrollToTop();
    }
  }

  function scrollToTop() {
    const scroller = document.scrollingElement || document.documentElement;
    if (Settings.get('animations')) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    else scroller.scrollTop = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Sidebar: route history                                           */
  /* ---------------------------------------------------------------- */

  function renderSidebar() {
    if (!Settings.get('showRoutePanel')) { sidebar.innerHTML = ''; return; }
    const state = game.state;
    const route = game.routeWithDwell();
    sidebar.innerHTML = '';
    const panel = el('section', { class: 'route-panel' }, [
      el('header', { class: 'route-panel__head' }, [
        el('h2', { class: 'route-panel__title', text: t('game.route') }),
        el('div', { class: 'route-panel__stats' }, [
          badge(`${state.clicks} ${t('common.clicks')}`, { tone: 'neutral', icon: '🖱️' }),
          badge(formatTime(state.timer.elapsedMs), { tone: 'neutral', icon: '⏱' }),
        ]),
      ]),
    ]);

    const list = el('div', { class: 'route-panel__list' });
    if (!route.length) list.appendChild(el('p', { class: 'muted', text: t('game.routeEmpty') }));
    else {
      const items = routeList(route, {
        lang: state.lang,
        activeIndex: route.length - 1,
        onInspect: (step) => inspectArticle(step.title),
      });
      list.appendChild(items);
    }
    panel.appendChild(list);

    const targetBox = el('div', { class: 'route-panel__target' }, [
      el('span', { class: 'route-panel__target-label', text: t('game.target') }),
      el('button', {
        class: 'route-panel__target-title',
        type: 'button',
        text: state.target || '—',
        onClick: () => inspectArticle(state.target),
      }),
      el('div', { class: 'row row--wrap' }, [
        button({ label: t('common.copy'), icon: '📋', variant: 'ghost', className: 'btn--sm', onClick: copyRoute }),
        button({ label: t('game.replayPlay'), icon: '▶', variant: 'ghost', className: 'btn--sm', onClick: startAutoReplay }),
      ]),
    ]);
    panel.appendChild(targetBox);
    sidebar.appendChild(panel);
  }

  async function inspectArticle(title) {
    if (!title) return;
    const state = game.state;
    const isTarget = titleKey(title) === titleKey(state.target || '');
    const wrap = el('div', { class: 'inspect' });
    wrap.appendChild(el('p', { class: 'muted', text: t('common.loading') }));
    modal({
      title,
      body: wrap,
      actions: [
        { id: 'open', label: t('game.inspect'), variant: 'ghost' },
        { id: 'close', label: t('common.close'), variant: 'primary' },
      ],
      onMount: async (content, close) => {
        const card = await articlePreviewCard(state.lang, title);
        wrap.innerHTML = '';
        wrap.appendChild(card);
        if (isTarget) wrap.appendChild(el('p', { class: 'inspect__target', text: `🎯 ${t('game.target')}` }));
      },
    }).then((choice) => {
      if (choice === 'open') openExternal(articleUrl(state.lang, title));
    });
  }

  async function copyRoute() {
    const route = game.state.route.map((s) => s.title);
    const text = `${route.join(' → ')}\n${t('common.time')}: ${formatTime(game.state.timer.elapsedMs)} · ${t('common.clicks')}: ${game.state.clicks}`;
    const { copyText } = await import('../../core/util.js');
    const ok = await copyText(text);
    notify[ok ? 'success' : 'error'](ok ? t('toast.routeCopied') : t('common.copyFailed'));
  }

  /* ---------------------------------------------------------------- */
  /* Auto replay (visual timeline)                                    */
  /* ---------------------------------------------------------------- */

  function startAutoReplay() {
    stopAutoReplay();
    const route = game.state.route;
    if (route.length < 2) { notify.info(t('game.routeEmpty')); return; }
    let i = 0;
    const timeline = el('div', { class: 'replay' }, [
      el('div', { class: 'replay__head' }, [
        el('strong', { text: t('game.replayAuto') }),
        button({ label: t('game.replayStop'), variant: 'ghost', className: 'btn--sm', onClick: stopAutoReplay }),
      ]),
      el('div', { class: 'replay__track' }),
    ]);
    sidebar.prepend(timeline);
    const track = timeline.querySelector('.replay__track');
    const nodes = route.map((step) => {
      const node = el('button', {
        class: 'replay__node',
        type: 'button',
        onClick: () => inspectArticle(step.title),
      }, [
        el('span', { class: 'replay__dot' }),
        el('span', { class: 'replay__title', text: step.title }),
        el('span', { class: 'replay__time', text: step.elapsedMs !== null && step.elapsedMs !== undefined ? formatTime(step.elapsedMs) : '' }),
      ]);
      track.appendChild(node);
      return node;
    });
    autoReplay = {
      stop: () => { clearInterval(autoReplay.timer); autoReplay = null; },
      timer: null,
    };
    nodes[0].classList.add('is-active');
    autoReplay.timer = setInterval(() => {
      if (i < nodes.length - 1) {
        nodes[i].classList.remove('is-active');
        nodes[i].classList.add('is-done');
        i += 1;
        nodes[i].classList.add('is-active');
        nodes[i].scrollIntoView({ block: 'nearest' });
      } else {
        stopAutoReplay();
      }
    }, 650);
  }

  function stopAutoReplay() {
    if (!autoReplay) return;
    clearInterval(autoReplay.timer);
    autoReplay = null;
    const node = sidebar.querySelector('.replay');
    if (node) node.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Hint / power-up sheet                                            */
  /* ---------------------------------------------------------------- */

  function openSheet(kind = 'hints') {
    unlockAudio();
    sheet.innerHTML = '';
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    const state = game.state;

    const closeBtn = el('button', { class: 'icon-btn sheet__close', type: 'button', 'aria-label': t('common.close'), text: '✕', onClick: closeSheet });
    const body = el('div', { class: 'sheet__body' });

    if (kind === 'hints') {
      const cfgSeconds = Settings.get('hintPenaltySeconds');
      const cfgClicks = Settings.get('hintPenaltyClicks');
      body.appendChild(el('h3', { class: 'sheet__title', text: t('game.hint') }));
      if (!state.rules.allowHints) {
        body.appendChild(el('p', { class: 'muted', text: t('game.hintDisabled') }));
      } else {
        const grid = el('div', { class: 'hint-grid' });
        for (const hint of HINT_TYPES) {
          const costParts = [];
          if (cfgSeconds) costParts.push(`+${cfgSeconds}s`);
          if (cfgClicks) costParts.push(`+${cfgClicks} ${t('common.clicks')}`);
          const card = el('button', {
            class: 'hint-card',
            type: 'button',
            onClick: async () => {
              const btn = card;
              btn.classList.add('is-busy');
              const res = await game.useHint(hint.id);
              btn.classList.remove('is-busy');
              if (!res.ok) { notify.warn(res.text || t('game.hintNoMore')); return; }
              playSound('hint');
              showHintResult(res);
              closeSheet();
            },
          }, [
            el('span', { class: 'hint-card__icon', text: hint.icon, 'aria-hidden': 'true' }),
            el('span', { class: 'hint-card__label', text: t(hint.labelKey) }),
            el('span', { class: 'hint-card__cost', text: costParts.length ? t('game.hintCost', { cost: costParts.join(' · ') }) : '' }),
          ]);
          grid.appendChild(card);
        }
        body.appendChild(grid);
        body.appendChild(el('p', { class: 'field__hint', text: `${t('game.hintsUsed')}: ${state.hintsUsed}` }));
      }
    } else {
      body.appendChild(el('h3', { class: 'sheet__title', text: t('game.powerupsTitle') }));
      if (!state.rules.allowPowerups) body.appendChild(el('p', { class: 'muted', text: t('game.noPowerups') }));
      const grid = el('div', { class: 'power-grid' });
      for (const p of powerupsForMode(state.mode)) {
        const pu = state.powerups[p.id];
        const btn = el('button', {
          class: `power-card ${pu.uses <= 0 ? 'is-empty' : ''} ${!pu.allowed ? 'is-disabled' : ''}`,
          type: 'button',
          disabled: !pu.allowed || pu.uses <= 0 || !state.rules.allowPowerups,
          onClick: async () => {
            const res = await game.usePowerup(p.id);
            if (!res.ok) { notify.warn(t('powerup.freezeUnavailable')); return; }
            playSound('powerup');
            if (p.id === 'scanner') applyScanner();
            notify.info(res.message || t('toast.powerupUsed'), { icon: p.icon });
            updateSheetBadges();
          },
        }, [
          el('span', { class: 'power-card__icon', text: p.icon, 'aria-hidden': 'true' }),
          el('span', { class: 'power-card__label', text: t(p.labelKey) }),
          el('span', { class: 'power-card__uses', text: `${pu.uses}×` }),
        ]);
        grid.appendChild(btn);
      }
      body.appendChild(grid);
      body.appendChild(el('p', { class: 'field__hint', text: t('profile.xpNote') }));
    }

    function updateSheetBadges() {
      const grid = sheet.querySelectorAll('.power-card');
      const list = powerupsForMode(game.state.mode);
      grid.forEach((node, i) => {
        const pu = game.state.powerups[list[i].id];
        node.querySelector('.power-card__uses').textContent = `${pu.uses}×`;
        node.classList.toggle('is-empty', pu.uses <= 0);
        node.disabled = !pu.allowed || pu.uses <= 0 || !game.state.rules.allowPowerups;
      });
    }

    sheet.append(el('div', { class: 'sheet__inner' }, [el('header', { class: 'sheet__head' }, [el('span', { class: 'sheet__grip', 'aria-hidden': 'true' }), closeBtn]), body]));
  }

  function closeSheet() {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = '';
  }

  function showHintResult(res) {
    const hintModal = modal({
      title: `${hintById(res.type) ? t(hintById(res.type).labelKey) : t('game.hint')}`,
      body: el('div', { class: 'hint-result' }, [
        el('p', { class: 'hint-result__text', text: res.fallbackText || (res.textKey ? t(res.textKey, res.data) : '') }),
        res.detail && res.detail.title ? el('p', { class: 'muted', text: res.detail.title }) : null,
        el('p', { class: 'field__hint', text: `${t('game.hintCost', { cost: `+${res.cost.seconds}s${res.cost.clicks ? ` · +${res.cost.clicks} ${t('common.clicks')}` : ''}` })}` }),
      ]),
      actions: [
        res.detail && res.detail.title ? { id: 'go', label: t('game.inspect'), variant: 'ghost' } : null,
        { id: 'ok', label: t('common.done'), variant: 'primary' },
      ].filter(Boolean),
    });
    hintModal.then((choice) => { if (choice === 'go' && res.detail && res.detail.title) inspectArticle(res.detail.title); });
  }

  async function applyScanner() {
    const state = game.state;
    try {
      const { getOutgoingLinks, scoreLinksForTarget } = await import('../../api/wikipedia.js');
      const info = await game.getTargetInfo();
      const links = await getOutgoingLinks(state.lang, state.current, { limit: 500 });
      const ranked = scoreLinksForTarget(links, state.target, info);
      router.applyScanScores(new Map(ranked.map((r) => [r.link, r.score])));
    } catch (err) {
      notify.warn(describeError(err, t));
    }
  }

  /* ---------------------------------------------------------------- */
  /* HUD actions                                                      */
  /* ---------------------------------------------------------------- */

  function handleHudAction(action, payload) {
    unlockAudio();
    switch (action) {
      case 'hint': openSheet('hints'); break;
      case 'powerups': openSheet('powerups'); break;
      case 'toggle-pause': game.togglePause(); break;
      case 'toggle-route': {
        Settings.set({ showRoutePanel: !Settings.get('showRoutePanel') });
        renderSidebar();
        break;
      }
      case 'inspect': {
        const state = game.state;
        inspectArticle(payload === 'start' ? state.start : payload === 'target' ? state.target : state.current);
        break;
      }
      default: break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */

  function onKeyDown(e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); game.togglePause(); }
    else if (k === 'h') openSheet('hints');
    else if (k === 'p') openSheet('powerups');
    else if (k === 'r') renderSidebar();
    else if (k === 'escape') { closeSheet(); }
    else if (k === 't') inspectArticle(game.state.target);
    else if (k === 's') inspectArticle(game.state.start);
  }

  /* ---------------------------------------------------------------- */
  /* Game event wiring                                                */
  /* ---------------------------------------------------------------- */

  function wire() {
    unsubs.push(game.on('tick', (timerState) => {
      hud.updateClock(timerState);
      hud.setFrozen(Boolean(timerState.frozen));
      if (Settings.get('showRoutePanel')) updateRouteTimes();
    }));
    unsubs.push(game.on('state', (state) => {
      hud.update(state);
      updateProgress(state);
      if (state.status === 'paused') banner.textContent = t('common.paused');
      banner.classList.toggle('is-hidden', state.status !== 'paused');
    }));
    unsubs.push(game.on('article', ({ article }) => {
      renderArticle(article);
      renderSidebar();
    }));
    unsubs.push(game.on('navigate', () => { renderSidebar(); }));
    unsubs.push(game.on('blocked', () => { hud.update(game.state); }));
    unsubs.push(game.on('warning', ({ mark }) => {
      playSound('warning');
      hud.showWarning(`${t('game.warn')} ${Math.round(mark / 1000)}s`, { tone: mark <= 10000 ? 'danger' : 'warn' });
    }));
    unsubs.push(game.on('freeze', ({ ms }) => {
      hud.setFrozen(true);
      hud.showWarning(t('game.freezeLeft', { s: Math.round(ms / 1000) }), { tone: 'info' });
    }));
    unsubs.push(game.on('unfreeze', () => hud.setFrozen(false)));
    unsubs.push(game.on('hint', () => hud.update(game.state)));
    unsubs.push(game.on('powerup', () => hud.update(game.state)));
    unsubs.push(game.on('stage', ({ stage }) => {
      notify.success(`${t('endless.stage')} ${stage}`, { icon: '♾️', duration: 2000 });
    }));
    unsubs.push(game.on('newtarget', ({ target }) => {
      notify.info(`${t('endless.nextTarget')}: ${target}`, { icon: '🎯', duration: 4200 });
      hud.showWarning(`${t('endless.nextTarget')}: ${target}`, { tone: 'info', duration: 4000 });
      renderSidebar();
    }));
    unsubs.push(game.on('error', ({ error, phase, title }) => {
      if (phase === 'article') showArticleError(error, title);
      else notify.error(describeError(error, t));
    }));
    unsubs.push(game.on('ended', (result) => {
      playSound(result.completed ? 'win' : 'lose');
      ctx.navigate('results', { result, fromGame: true });
    }));
  }

  function updateProgress(state) {
    const limit = state.timer.limitMs || state.rules.timeLimitMs || 0;
    const fill = progressBar.querySelector('.game__loadbar-fill');
    if (state.loading) {
      progressBar.classList.add('is-loading');
      fill.style.width = '70%';
    } else {
      progressBar.classList.remove('is-loading');
      fill.style.width = '0%';
    }
  }

  function updateRouteTimes() {
    const nodes = sidebar.querySelectorAll('.route-list__item');
    if (!nodes.length) return;
    const route = game.routeWithDwell();
    const last = nodes[nodes.length - 1];
    const timeEl = last && last.querySelector('.route-list__time');
    const step = route[route.length - 1];
    if (timeEl && step && step.spentMs !== null) timeEl.textContent = formatTime(step.spentMs);
  }

  function showArticleError(error, title) {
    const isOffline = error && error.code === 'offline';
    const isMissing = error && error.code === 'notfound';
    const wrap = el('div', { class: 'article-error' }, [
      el('span', { class: 'article-error__icon', text: isOffline ? '📴' : isMissing ? '🔍' : '⚠️', 'aria-hidden': 'true' }),
      el('h2', { text: isMissing ? t('common.articleNotFound') : t('game.articleError') }),
      el('p', { class: 'muted', text: describeError(error, t) }),
      el('p', { class: 'muted', text: t('game.articleErrorHint') }),
      el('div', { class: 'row' }, [
        button({
          label: t('game.retryArticle'),
          icon: '🔄',
          onClick: async () => {
            const art = await game.retryArticle(title || game.state.current);
            if (art) { renderArticle(art); renderSidebar(); }
          },
        }),
        button({
          label: t('common.back'),
          variant: 'ghost',
          onClick: () => {
            const prev = game.state.route[game.state.route.length - 2];
            if (prev) { game.backtrack().then(() => { renderSidebar(); }); }
            else ctx.navigate('home');
          },
        }),
      ]),
    ]);
    articleHost.innerHTML = '';
    articleHost.appendChild(wrap);
  }

  /* ---------------------------------------------------------------- */
  /* Screen lifecycle                                                 */
  /* ---------------------------------------------------------------- */

  async function boot(params) {
    const wasResumed = params.resume;
    if (wasResumed) {
      const ok = await game.restore();
      if (!ok) { notify.error(t('game.articleError')); ctx.navigate('home'); return; }
    }
    if (game.state.status === 'playing') hud.update(game.state);
    hud.update(game.state);
    if (game.article) { renderArticle(game.article); }
    renderSidebar();
    hud.toggleExpanded(!Settings.get('compactHud'));
  }

  wire();
  boot(ctx.params || {});
  document.addEventListener('keydown', onKeyDown);

  return {
    el: root,
    async onShow(params = {}) {
      if (params.config) {
        try {
          await game.start(params.config);
          renderArticle(game.article);
          renderSidebar();
          hud.update(game.state);
          playSound('start');
        } catch (err) {
          notify.error(describeError(err, t));
          ctx.navigate('play', { mode: params.config.mode });
        }
      } else if (params.resume) {
        const ok = await game.restore();
        if (ok) { renderArticle(game.article); renderSidebar(); hud.update(game.state); }
        else { notify.error(t('game.articleError')); ctx.navigate('home'); }
      }
    },
    onHide() {
      closeSheet();
      stopAutoReplay();
      router.detach();
      routerAttached = false;
    },
    destroy() {
      unsubs.forEach((off) => { try { off(); } catch { /* noop */ } });
      unsubs = [];
      router.detach();
      document.removeEventListener('keydown', onKeyDown);
      game.abort();
      root.innerHTML = '';
    },
    // exposed for tests
    _internal: { renderArticle, renderSidebar, hud, router },
  };
});
