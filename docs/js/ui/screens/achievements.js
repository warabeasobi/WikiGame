/* ui/screens/achievements.js — achievement grid with progress bars. */

import { el, formatNumber } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, emptyState, progressBar } from '../components.js';
import { ACHIEVEMENTS, Achievements, TIER_ORDER } from '../../storage/achievements.js';
import { Statistics } from '../../storage/statistics.js';
import { Profile } from '../../storage/profile.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { game } from '../../game/gameState.js';

registerScreen('achievements', (ctx) => {
  const root = el('div', { class: 'screen screen--achievements' });
  let filter = 'all';

  const TIER_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎' };

  function render() {
    root.innerHTML = '';
    const data = Achievements.all;
    const ctxData = Achievements.buildContext({
      run: {},
      profile: Profile.all,
      stats: Statistics.all,
      bookmarks: Bookmarks.articles.length,
    });
    const unlockedCount = Achievements.unlockedCount();
    const total = ACHIEVEMENTS.length;

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('ach.title') }),
      el('p', { class: 'screen__sub', text: t('ach.count', { done: unlockedCount, total }) }),
      progressBar(unlockedCount / total, { label: t('ach.unlocked'), value: `${unlockedCount} / ${total}` }),
    ]));

    const filters = [
      { value: 'all', label: t('common.all') },
      { value: 'unlocked', label: t('ach.unlocked') },
      { value: 'locked', label: t('ach.locked') },
    ];
    root.appendChild(el('div', { class: 'segmented-wrap' }, [
      el('div', { class: 'segmented', role: 'radiogroup' }, filters.map((f) => el('button', {
        class: `segmented__btn ${filter === f.value ? 'is-active' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(filter === f.value),
        text: f.label,
        onClick: () => { filter = f.value; render(); },
      }))),
    ]));

    const list = ACHIEVEMENTS.filter((a) => {
      const unlocked = Boolean(data.unlocked[a.id]);
      if (filter === 'unlocked') return unlocked;
      if (filter === 'locked') return !unlocked;
      return true;
    }).sort((a, b) => {
      const ua = Boolean(data.unlocked[a.id]);
      const ub = Boolean(data.unlocked[b.id]);
      if (ua !== ub) return ua ? -1 : 1;
      return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    });

    const grid = el('div', { class: 'ach-grid' });
    for (const a of list) {
      const unlocked = Boolean(data.unlocked[a.id]);
      const prog = Achievements.progressFor(a, ctxData);
      const unlockedAt = unlocked ? data.unlocked[a.id].at : null;
      grid.appendChild(el('div', { class: `ach-card ${unlocked ? 'is-unlocked' : 'is-locked'} ach-card--${a.tier}` }, [
        el('span', { class: 'ach-card__icon', text: a.hidden && !unlocked ? '❓' : a.icon, 'aria-hidden': 'true' }),
        el('div', { class: 'ach-card__body' }, [
          el('div', { class: 'ach-card__head' }, [
            el('strong', { class: 'ach-card__name', text: a.hidden && !unlocked ? t('ach.hidden') : t(`ach.${a.id}.name`) }),
            el('span', { class: `ach-card__tier ach-card__tier--${a.tier}`, title: a.tier, text: TIER_ICON[a.tier] || '🏅' }),
          ]),
          el('p', { class: 'ach-card__desc', text: a.hidden && !unlocked ? '???' : t(`ach.${a.id}.desc`) }),
          unlocked
            ? el('span', { class: 'ach-card__unlocked', text: `✓ ${t('ach.unlockedOn', { date: new Date(unlockedAt).toLocaleDateString(uiLocale()) })}` })
            : progressBar(prog.ratio, { label: t('ach.progress'), value: `${formatNumber(prog.current, uiLocale())} / ${formatNumber(prog.target, uiLocale())}` }),
        ]),
      ]));
    }

    root.appendChild(grid.length ? grid : card({ body: [emptyState({ icon: '🏆', title: t('stats.noData') })] }));

    root.appendChild(card({
      title: t('ach.newAchievement'),
      className: 'card--muted',
      body: [el('p', { class: 'field__hint', text: 'Achievements unlock automatically when you play. Tier XP: 🥉 25 · 🥈 50 · 🥇 90 · 💎 150' })],
    }));
  }

  render();
  return {
    el: root,
    onShow() { render(); },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
