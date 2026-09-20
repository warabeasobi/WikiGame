/* ui/screens/leaderboard.js — local leaderboard + a clearly-labelled placeholder
 * for the future online board (no fake data, ever). */

import { el, formatTime, formatNumber, formatRelative } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, segmented, emptyState, difficultyBadge, modeBadge, languageBadge, badge } from '../components.js';
import { Leaderboard } from '../../storage/leaderboard.js';
import { Profile } from '../../storage/profile.js';
import { MODE_LABELS, MODE_LABEL_KEYS } from '../../game/scoring.js';
import { DIFFICULTIES } from '../../game/difficulty.js';
import { LANGUAGES } from '../../api/wikipedia.js';
import { notify, confirmDialog } from '../notifications.js';

registerScreen('leaderboard', (ctx) => {
  const root = el('div', { class: 'screen screen--leaderboard' });
  let scope = 'all';
  let sort = 'score';
  let lang = 'all';
  let entries = [];
  let loading = false;

  async function load() {
    loading = true;
    render();
    entries = await Leaderboard.top({
      mode: scope === 'all' ? null : scope,
      lang: lang === 'all' ? null : lang,
      sort,
      limit: 50,
    });
    loading = false;
    render();
  }

  function render() {
    root.innerHTML = '';
    const locale = uiLocale();

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('lb.title') }),
      el('p', { class: 'screen__sub', text: t('lb.local') }),
    ]));

    root.appendChild(segmented({
      ariaLabel: t('lb.sortScore'),
      value: sort,
      options: [
        { value: 'score', label: t('lb.sortScore'), icon: '🏅' },
        { value: 'time', label: t('lb.sortTime'), icon: '⏱' },
        { value: 'clicks', label: t('lb.sortClicks'), icon: '🖱️' },
      ],
      onChange: (v) => { sort = v; load(); },
    }));

    root.appendChild(el('div', { class: 'chip-row chip-row--scroll' }, [
      el('button', { class: `chip ${scope === 'all' ? 'is-active' : ''}`, type: 'button', text: t('lb.scopeAll'), onClick: () => { scope = 'all'; load(); } }),
      ...Object.keys(MODE_LABELS).filter((m) => m !== 'sandbox').map((m) => el('button', {
        class: `chip ${scope === m ? 'is-active' : ''}`,
        type: 'button',
        text: MODE_LABEL_KEYS[m] ? t(MODE_LABEL_KEYS[m]) : MODE_LABELS[m],
        onClick: () => { scope = m; load(); },
      })),
    ]));

    root.appendChild(el('div', { class: 'chip-row chip-row--scroll' }, [
      el('button', { class: `chip ${lang === 'all' ? 'is-active' : ''}`, type: 'button', text: t('common.all'), onClick: () => { lang = 'all'; load(); } }),
      ...LANGUAGES.map((l) => el('button', {
        class: `chip ${lang === l.code ? 'is-active' : ''}`,
        type: 'button',
        onClick: () => { lang = l.code; load(); },
        text: `${l.flag} ${l.label}`,
      })),
    ]));

    const body = [];
    if (loading) body.push(el('div', { class: 'daily-loading' }, [el('span', { class: 'spinner' })]));
    else if (!entries.length) body.push(emptyState({ icon: '🥇', title: t('lb.empty'), message: t('home.noRuns'), action: button({ label: t('home.quickPlay'), onClick: () => ctx.navigate('play', { mode: 'quick', autostart: true }) }) }));
    else {
      const table = el('ol', { class: 'lb-list' });
      entries.forEach((e, i) => {
        const isMe = e.player === Profile.all.name;
        table.appendChild(el('li', { class: `lb-row ${isMe ? 'is-me' : ''}` }, [
          el('span', { class: 'lb-row__rank', text: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1) }),
          el('div', { class: 'lb-row__main' }, [
            el('strong', { class: 'lb-row__pair', text: `${e.start} → ${e.target}` }),
            el('div', { class: 'lb-row__meta' }, [
              el('span', { class: 'muted', text: e.player }),
              modeBadge(e.mode),
              difficultyBadge(e.difficulty),
              languageBadge(e.lang),
              el('span', { class: 'muted', text: formatRelative(e.ts, locale) }),
            ]),
          ]),
          el('div', { class: 'lb-row__stats' }, [
            el('span', { class: 'lb-row__stat' }, [el('span', { class: 'muted', text: t('common.time') }), el('strong', { text: formatTime(e.elapsedMs) })]),
            el('span', { class: 'lb-row__stat' }, [el('span', { class: 'muted', text: t('common.clicks') }), el('strong', { text: String(e.clicks) })]),
            el('span', { class: 'lb-row__stat' }, [el('span', { class: 'muted', text: t('common.score') }), el('strong', { text: formatNumber(e.score, locale) })]),
          ]),
        ]));
      });
      body.push(table);
      body.push(button({
        label: t('common.reset'),
        icon: '🗑',
        variant: 'ghost',
        className: 'btn--sm',
        onClick: async () => {
          const ok = await confirmDialog(t('settings.resetConfirm'), { title: t('lb.local'), danger: true });
          if (!ok) return;
          await Leaderboard.clear();
          notify.success(t('settings.resetDone'));
          load();
        },
      }));
    }
    root.appendChild(card({ title: t('lb.local'), body }));

    /* Future online board — honest placeholder, no mock data. */
    root.appendChild(card({
      title: t('lb.global'),
      className: 'card--muted',
      body: [
        el('p', { class: 'muted', text: t('lb.globalUnavailable') }),
        el('div', { class: 'row row--wrap' }, [
          badge(Leaderboard.onlineAvailable ? 'adapter: remote' : 'adapter: local', { tone: Leaderboard.onlineAvailable ? 'success' : 'neutral', icon: '🔌' }),
          badge('API: submit(entry) / top(query)', { tone: 'neutral' }),
        ]),
      ],
    }));
  }

  load();
  return {
    el: root,
    onShow() { load(); },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
