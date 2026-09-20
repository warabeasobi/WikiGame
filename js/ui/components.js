/* ui/components.js — reusable interface pieces shared by every screen. */

import { el, debounce, formatTime, formatNumber, truncate, titleKey, escapeHtml, copyText } from '../core/util.js';
import { t, uiLocale } from '../core/i18n.js';
import { LANGUAGES, searchArticles, resolveTitle, getPageInfo, describeError } from '../api/wikipedia.js';
import { DIFFICULTIES, difficultyConfig } from '../game/difficulty.js';
import { MODE_LABEL_KEYS, MODE_LABELS } from '../game/scoring.js';
import { starRating, sparkline, progressBar } from './charts.js';
import { notify } from './notifications.js';

/* ------------------------------------------------------------------ */
/* Layout primitives                                                  */
/* ------------------------------------------------------------------ */

export function card({ title, subtitle, actions = [], className = '', body = [], id = null }) {
  return el('section', { class: `card ${className}`, id }, [
    title || actions.length ? el('header', { class: 'card__head' }, [
      el('div', {}, [
        title ? el('h2', { class: 'card__title', text: title }) : null,
        subtitle ? el('p', { class: 'card__subtitle', text: subtitle }) : null,
      ]),
      actions.length ? el('div', { class: 'card__actions' }, actions) : null,
    ]) : null,
    ...(Array.isArray(body) ? body : [body]),
  ]);
}

export function statTile({ label, value, sub = null, icon = null, tone = null, onClick = null, small = false }) {
  const Tag = onClick ? 'button' : 'div';
  return el(Tag, {
    class: `stat-tile ${small ? 'stat-tile--sm' : ''} ${tone ? `stat-tile--${tone}` : ''}`,
    type: onClick ? 'button' : null,
    onClick,
  }, [
    icon ? el('span', { class: 'stat-tile__icon', text: icon, 'aria-hidden': 'true' }) : null,
    el('span', { class: 'stat-tile__value', text: value }),
    el('span', { class: 'stat-tile__label', text: label }),
    sub ? el('span', { class: 'stat-tile__sub', text: sub }) : null,
  ]);
}

export function segmented({ options, value, onChange, name = 'segmented', ariaLabel = '' }) {
  const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': ariaLabel });
  for (const opt of options) {
    const btn = el('button', {
      type: 'button',
      class: `segmented__btn ${opt.value === value ? 'is-active' : ''}`,
      role: 'radio',
      'aria-checked': String(opt.value === value),
      title: opt.title || opt.label,
      onClick: () => {
        for (const b of group.children) { b.classList.remove('is-active'); b.setAttribute('aria-checked', 'false'); }
        btn.classList.add('is-active');
        btn.setAttribute('aria-checked', 'true');
        onChange(opt.value, opt);
      },
    }, [
      opt.icon ? el('span', { class: 'segmented__icon', text: opt.icon, 'aria-hidden': 'true' }) : null,
      el('span', { text: opt.label }),
    ]);
    group.appendChild(btn);
  }
  return group;
}

export function switchField({ id, label, description, checked, onChange, disabled = false }) {
  const input = el('input', { type: 'checkbox', id, class: 'switch__input', checked, disabled });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'switch', for: id }, [
    input,
    el('span', { class: 'switch__track', 'aria-hidden': 'true' }, [el('span', { class: 'switch__thumb' })]),
    el('span', { class: 'switch__text' }, [
      el('span', { class: 'switch__label', text: label }),
      description ? el('span', { class: 'switch__desc', text: description }) : null,
    ]),
  ]);
}

export function sliderField({ id, label, min = 0, max = 100, step = 1, value, onChange, format = (v) => String(v), description = null }) {
  const output = el('output', { class: 'slider__value', for: id, text: format(value) });
  const input = el('input', { type: 'range', id, class: 'slider__input', min, max, step, value });
  input.addEventListener('input', () => { output.textContent = format(Number(input.value)); onChange(Number(input.value)); });
  return el('div', { class: 'slider' }, [
    el('div', { class: 'slider__head' }, [el('label', { class: 'slider__label', for: id, text: label }), output]),
    input,
    description ? el('p', { class: 'field__hint', text: description }) : null,
  ]);
}

export function button({ label, onClick, variant = 'primary', icon = null, disabled = false, title = null, type = 'button', className = '', ariaLabel = null }) {
  return el('button', {
    class: `btn btn--${variant} ${className}`,
    type,
    disabled,
    title: title || label,
    'aria-label': ariaLabel || label,
    onClick: disabled ? null : onClick,
  }, [
    icon ? el('span', { class: 'btn__icon', text: icon, 'aria-hidden': 'true' }) : null,
    el('span', { text: label }),
  ]);
}

export function emptyState({ icon = '🗺️', title, message, action = null }) {
  return el('div', { class: 'empty-state' }, [
    el('span', { class: 'empty-state__icon', text: icon, 'aria-hidden': 'true' }),
    el('strong', { class: 'empty-state__title', text: title }),
    message ? el('p', { class: 'empty-state__msg', text: message }) : null,
    action || null,
  ]);
}

export function skeleton(lines = 3) {
  return el('div', { class: 'skeleton', 'aria-hidden': 'true' }, Array.from({ length: lines }, (_, i) => el('span', { class: 'skeleton__line', style: { width: `${90 - i * 12}%` } })));
}

export function badge(text, { tone = 'neutral', icon = null, title = null } = {}) {
  return el('span', { class: `badge badge--${tone}`, title: title || text }, [
    icon ? el('span', { text: icon, 'aria-hidden': 'true' }) : null,
    el('span', { text }),
  ]);
}

export function difficultyBadge(difficultyId) {
  const cfg = difficultyConfig(difficultyId);
  return el('span', { class: 'badge badge--difficulty', style: { '--badge-accent': cfg.accent }, title: cfg.blurb }, [
    el('span', { text: cfg.emoji, 'aria-hidden': 'true' }),
    el('span', { text: cfg.label }),
  ]);
}

export function modeLabel(mode) {
  const key = MODE_LABEL_KEYS[mode];
  return key ? t(key) : (MODE_LABELS[mode] || mode);
}

export function modeBadge(mode) {
  const icons = { quick: '⚡', custom: '🎛️', daily: '📅', timeattack: '⏱️', clickattack: '🖱️', endless: '♾️', sandbox: '🧪' };
  return badge(modeLabel(mode), { tone: 'mode', icon: icons[mode] || '🎮' });
}

export function languageBadge(lang) {
  const meta = LANGUAGES.find((l) => l.code === lang);
  return badge(meta ? meta.label : lang, { tone: 'lang', icon: meta ? meta.flag : '🌐' });
}

/* ------------------------------------------------------------------ */
/* Article pieces                                                     */
/* ------------------------------------------------------------------ */

export function articleLink({ title, lang, onNavigate, className = '', showBookmark = false, onBookmark = null, bookmarked = false }) {
  const btn = el('button', { class: `article-link ${className}`, type: 'button', onClick: () => onNavigate && onNavigate(title) }, [
    el('span', { class: 'article-link__title', text: title }),
  ]);
  if (showBookmark) {
    btn.appendChild(el('span', {
      class: `article-link__bookmark ${bookmarked ? 'is-on' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': t('bookmarks.saveArticle'),
      text: bookmarked ? '★' : '☆',
      onClick: (e) => { e.stopPropagation(); onBookmark && onBookmark(title); },
      onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onBookmark && onBookmark(title); } },
    }));
  }
  return btn;
}

/** Article picker with live search + validation against the real API. */
export function articlePicker({ lang, value = '', placeholder = '', label = '', onPick, allowRandom = false, onRandom = null }) {
  const inputId = `picker-${Math.random().toString(36).slice(2, 8)}`;
  const input = el('input', { class: 'input', id: inputId, type: 'search', value, placeholder, autocomplete: 'off', spellcheck: 'false', 'aria-autocomplete': 'list' });
  const list = el('ul', { class: 'suggest', role: 'listbox', id: `${inputId}-list` });
  const status = el('p', { class: 'field__hint', role: 'status' });
  input.setAttribute('aria-controls', `${inputId}-list`);
  const field = el('div', { class: 'field field--picker' }, [
    label ? el('label', { class: 'field__label', for: inputId, text: label }) : null,
    el('div', { class: 'field__row' }, [input, allowRandom ? button({ label: t('custom.randomStart'), icon: '🎲', variant: 'ghost', onClick: () => onRandom && onRandom() }) : null]),
    list,
    status,
  ]);

  let currentValue = value;
  let selection = null;

  const renderSuggestions = (items) => {
    list.innerHTML = '';
    if (!items.length) { list.classList.remove('is-open'); return; }
    for (const item of items) {
      const li = el('li', { class: 'suggest__item', role: 'option', tabindex: '-1' });
      li.innerHTML = `<span class="suggest__title"></span>${item.snippet ? '<span class="suggest__snippet"></span>' : ''}`;
      li.querySelector('.suggest__title').textContent = item.title;
      if (item.snippet) li.querySelector('.suggest__snippet').textContent = truncate(item.snippet, 80);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(item.title); });
      list.appendChild(li);
    }
    list.classList.add('is-open');
  };

  const doSearch = debounce(async (q) => {
    if (!q || q.length < 2) { renderSuggestions([]); return; }
    status.textContent = t('common.searching');
    try {
      const results = await searchArticles(lang, q, { limit: 8 });
      renderSuggestions(results);
      status.textContent = results.length ? '' : t('common.noResults');
    } catch (err) {
      status.textContent = describeError(err, t);
    }
  }, 220);

  input.addEventListener('input', () => {
    currentValue = input.value;
    selection = null;
    doSearch(input.value.trim());
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && list.children.length) { e.preventDefault(); list.children[0].focus(); }
    if (e.key === 'Enter') { e.preventDefault(); commit(input.value.trim()); }
    if (e.key === 'Escape') renderSuggestions([]);
  });
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('is-open'), 140));
  input.addEventListener('focus', () => { if (currentValue && currentValue.length >= 2) doSearch(currentValue); });

  function choose(title) {
    selection = title;
    input.value = title;
    currentValue = title;
    renderSuggestions([]);
    status.textContent = '';
    onPick && onPick(title, { verified: true });
  }

  /** Validates the typed title against the API (follows redirects). */
  async function commit(raw) {
    const q = String(raw || '').trim();
    if (!q) { status.textContent = ''; return null; }
    status.textContent = t('common.searching');
    try {
      const resolved = await resolveTitle(lang, q, {});
      choose(resolved);
      return resolved;
    } catch (err) {
      status.textContent = describeError(err, t);
      status.classList.add('is-error');
      notify.error(describeError(err, t));
      return null;
    }
  }

  return {
    element: field,
    get value() { return input.value.trim(); },
    get verifiedValue() { return selection; },
    set(title) { selection = title; input.value = title; currentValue = title; status.textContent = ''; },
    validate: () => commit(input.value),
  };
}

/** Link preview card used on hover in lists (not the in-article preview). */
export async function articlePreviewCard(lang, title) {
  const wrap = el('div', { class: 'preview-card' }, [skeleton(2)]);
  try {
    const info = await getPageInfo(lang, [title], {});
    const rec = info[titleKey(title)] || Object.values(info)[0];
    wrap.innerHTML = '';
    if (!rec) { wrap.appendChild(el('p', { class: 'muted', text: t('common.articleNotFound') })); return wrap; }
    if (rec.thumbnail) wrap.appendChild(el('img', { class: 'preview-card__thumb', src: rec.thumbnail.url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
    wrap.append(
      el('strong', { class: 'preview-card__title', text: rec.title }),
      rec.description ? el('p', { class: 'preview-card__desc', text: rec.description }) : null,
      rec.extract ? el('p', { class: 'preview-card__extract', text: truncate(rec.extract, 220) }) : null,
    );
  } catch (err) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'muted', text: describeError(err, t) }));
  }
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Route / run pieces                                                 */
/* ------------------------------------------------------------------ */

export function routeList(route, { lang, onInspect, activeIndex = null, showTime = true, collapsible = false } = {}) {
  const items = el('ol', { class: 'route-list' });
  route.forEach((step, i) => {
    const li = el('li', { class: `route-list__item ${activeIndex === i ? 'is-active' : ''}` });
    const btn = el('button', {
      class: 'route-list__btn',
      type: 'button',
      onClick: () => onInspect && onInspect(step, i),
      'aria-label': `${i === 0 ? t('game.start') : `#${i}`} ${step.title}`,
    }, [
      el('span', { class: 'route-list__index', text: i === 0 ? t('game.start').slice(0, 1).toUpperCase() : String(i) }),
      el('span', { class: 'route-list__title', text: step.title }),
      el('span', { class: 'route-list__meta' }, [
        showTime && step.spentMs !== null && step.spentMs !== undefined ? el('span', { class: 'route-list__time', text: formatTime(step.spentMs) }) : null,
        step.via && step.via !== 'link' ? el('span', { class: 'route-list__via', text: step.via === 'start' ? '' : step.via }) : null,
      ]),
    ]);
    li.appendChild(btn);
    items.appendChild(li);
  });

  if (!collapsible) return items;

  const details = el('details', { class: 'route-details', open: true }, [
    el('summary', { class: 'route-details__summary', text: t('game.route') }),
    items,
  ]);
  return details;
}

export function runRow(run, { onOpen = null, showRoute = true } = {}) {
  const locale = uiLocale();
  const date = new Date(run.ts).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const row = el('button', { class: 'run-row', type: 'button', onClick: onOpen ? () => onOpen(run) : null }, [
    el('span', { class: `run-row__status ${run.completed ? 'is-ok' : 'is-fail'}`, text: run.completed ? '✓' : '✕', 'aria-hidden': 'true' }),
    el('div', { class: 'run-row__main' }, [
      el('span', { class: 'run-row__title', text: `${run.start} → ${run.target}` }),
      el('span', { class: 'run-row__meta' }, [
        modeBadge(run.mode),
        difficultyBadge(run.difficulty),
        languageBadge(run.lang),
        el('span', { class: 'muted', text: date }),
      ]),
    ]),
    el('div', { class: 'run-row__stats' }, [
      el('strong', { text: formatTime(run.elapsedMs) }),
      el('span', { text: `${run.clicks} ${t('common.clicks')}` }),
      run.completed ? el('span', { class: 'run-row__score', text: formatNumber(run.score, locale) }) : null,
    ]),
    showRoute && run.stars ? starRating(run.stars, { size: 'sm' }) : null,
  ]);
  return row;
}

export function scoreBreakdown(scoreResult, { t: tr = t } = {}) {
  const locale = uiLocale();
  const rows = scoreResult.breakdown.map((b) => el('li', { class: `breakdown__row ${b.value < 0 ? 'is-negative' : ''}` }, [
    el('span', { class: 'breakdown__label', text: tr(b.label) }),
    b.detail ? el('span', { class: 'breakdown__detail', text: b.detail }) : null,
    el('strong', { class: 'breakdown__value', text: `${b.value > 0 ? '+' : ''}${formatNumber(b.value, locale)}` }),
  ]));
  return el('div', { class: 'breakdown' }, [
    el('ul', { class: 'breakdown__list' }, rows),
    scoreResult.multiplier !== 1 ? el('p', { class: 'breakdown__note', text: `× ${scoreResult.multiplier} ${t('results.totalScore')}` }) : null,
    el('div', { class: 'breakdown__total' }, [
      el('span', { text: tr('results.totalScore') }),
      el('strong', { text: formatNumber(scoreResult.total, locale) }),
    ]),
  ]);
}

export function copyButton(text, { label = t('common.copy'), icon = '📋' } = {}) {
  return button({
    label,
    icon,
    variant: 'ghost',
    onClick: async () => {
      const ok = await copyText(text);
      notify[ok ? 'success' : 'error'](ok ? t('common.copied') : t('common.copyFailed'));
    },
  });
}

export function xpBar(progress, { compact = false } = {}) {
  return progressBar(progress.progress, {
    label: `${t('common.level')} ${progress.level}`,
    value: `${formatNumber(progress.intoLevel)} / ${formatNumber(progress.levelSpan)} XP`,
  });
}

export { starRating, sparkline, progressBar };
