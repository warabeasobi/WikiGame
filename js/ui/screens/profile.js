/* ui/screens/profile.js — local player profile: level, XP, cosmetics, records. */

import { el, formatTime, formatNumber, formatDurationWords, humanDate } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, statTile, xpBar, badge, emptyState } from '../components.js';
import { COSMETICS, unlockedCosmetics, nextCosmetic } from '../../game/scoring.js';
import { Profile } from '../../storage/profile.js';
import { Statistics } from '../../storage/statistics.js';
import { ACHIEVEMENTS, Achievements } from '../../storage/achievements.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { promptDialog, notify } from '../notifications.js';
import { playSound } from '../sound.js';
import { LANGUAGES } from '../../api/wikipedia.js';

registerScreen('profile', (ctx) => {
  const root = el('div', { class: 'screen screen--profile' });

  function avatarEmoji(id) {
    const item = COSMETICS.find((c) => c.id === id);
    return item && item.emoji ? item.emoji : '🧭';
  }

  function render() {
    root.innerHTML = '';
    const p = Profile.all;
    const progress = Profile.progress;
    const s = Statistics.summary();
    const locale = uiLocale();
    const favouriteLang = Object.entries(s.perLanguage).sort((a, b) => (b[1].runs || 0) - (a[1].runs || 0))[0];
    const favMeta = favouriteLang ? LANGUAGES.find((l) => l.code === favouriteLang[0]) : null;
    const next = nextCosmetic(progress.level);
    const equipped = p.equipped || {};

    /* Hero --------------------------------------------------------- */
    root.appendChild(el('section', { class: 'profile-hero' }, [
      el('div', { class: 'profile-hero__avatar', 'aria-hidden': 'true', text: avatarEmoji(p.avatar) }),
      el('div', { class: 'profile-hero__body' }, [
        el('div', { class: 'profile-hero__name-row' }, [
          el('h1', { class: 'profile-hero__name', text: p.name }),
          el('button', {
            class: 'icon-btn',
            type: 'button',
            title: t('profile.editName'),
            'aria-label': t('profile.editName'),
            text: '✏️',
            onClick: async () => {
              const name = await promptDialog({ title: t('profile.editName'), label: t('profile.namePlaceholder'), value: p.name, maxLength: 24 });
              if (name) { Profile.setName(name); render(); notify.success(t('common.save')); }
            },
          }),
        ]),
        el('p', { class: 'profile-hero__meta', text: `${t('common.level')} ${progress.level} · ${formatNumber(progress.xp, locale)} ${t('common.xp')}` }),
        xpBar(progress),
        el('div', { class: 'profile-hero__chips' }, [
          badge(`${t('common.streak')} ${s.streak.current} 🔥`, { tone: s.streak.current > 0 ? 'accent' : 'neutral' }),
          badge(`${t('ach.title')} ${Achievements.unlockedCount()}/${ACHIEVEMENTS.length}`, { tone: 'neutral', icon: '🏆' }),
          badge(`${t('stats.uniqueArticles')} ${s.totalUniqueArticles}`, { tone: 'neutral', icon: '📚' }),
          p.createdAt ? badge(`${t('profile.joined')} ${new Date(p.createdAt).toLocaleDateString(locale)}`, { tone: 'neutral', icon: '📅' }) : null,
        ]),
      ]),
    ]));

    /* Stats -------------------------------------------------------- */
    root.appendChild(card({
      title: t('stats.title'),
      actions: [button({ label: t('nav.stats'), variant: 'ghost', onClick: () => ctx.navigate('stats') })],
      body: [
        el('div', { class: 'grid grid--tiles' }, [
          statTile({ label: t('profile.totalRuns'), value: formatNumber(s.totalRuns, locale), icon: '🎮' }),
          statTile({ label: t('profile.bestTime'), value: s.best.timeMs ? formatTime(s.best.timeMs) : '-', icon: '⚡' }),
          statTile({ label: t('profile.bestScore'), value: s.best.score ? formatNumber(s.best.score, locale) : '-', icon: '🏅' }),
          statTile({ label: t('profile.favLang'), value: favMeta ? `${favMeta.flag} ${favMeta.label}` : '-', icon: '🌍' }),
          statTile({ label: t('stats.longestStreak'), value: String(s.streak.longest), icon: '🏆' }),
          statTile({ label: t('stats.totalPlayTime'), value: formatDurationWords(s.totalPlayMs), icon: '⌛' }),
          statTile({ label: t('stats.completionRate'), value: `${Math.round(s.completionRate * 100)}%`, icon: '📈' }),
          statTile({ label: t('bookmarks.title'), value: String(Bookmarks.count), icon: '⭐' }),
        ]),
      ],
    }));

    /* Cosmetics ---------------------------------------------------- */
    const unlocked = unlockedCosmetics(progress.level);
    root.appendChild(card({
      title: t('profile.unlocks'),
      subtitle: next ? `${t('profile.level')} ${next.level}: ${next.label}` : null,
      body: [
        el('div', { class: 'cosmetic-grid' }, COSMETICS.map((c) => {
          const isUnlocked = c.level <= progress.level;
          const isEquipped = equipped[c.type] === c.id || (c.type === 'avatar' && p.avatar === c.id);
          return el('button', {
            class: `cosmetic-card ${isUnlocked ? '' : 'is-locked'} ${isEquipped ? 'is-equipped' : ''}`,
            type: 'button',
            disabled: !isUnlocked,
            onClick: () => {
              const ok = Profile.equip(c.id);
              if (ok) { playSound('save'); render(); }
            },
          }, [
            el('span', { class: 'cosmetic-card__icon', text: c.emoji || '🎨', style: c.color ? { color: c.color } : {} }),
            el('span', { class: 'cosmetic-card__label', text: c.label }),
            el('span', { class: 'cosmetic-card__level', text: isUnlocked ? (isEquipped ? `✓ ${t('profile.equipped')}` : `${t('common.level')} ${c.level}`) : `🔒 ${t('common.level')} ${c.level}` }),
          ]);
        })),
        el('p', { class: 'field__hint', text: t('profile.xpNote') }),
      ],
    }));

    /* Achievements preview ----------------------------------------- */
    const unlockedIds = Achievements.unlockedIds();
    root.appendChild(card({
      title: t('profile.achievements'),
      subtitle: t('ach.count', { done: unlockedIds.length, total: ACHIEVEMENTS.length }),
      actions: [button({ label: t('common.all'), variant: 'ghost', onClick: () => ctx.navigate('achievements') })],
      body: [
        unlockedIds.length
          ? el('div', { class: 'ach-strip' }, unlockedIds.slice(0, 10).map((id) => {
            const def = ACHIEVEMENTS.find((a) => a.id === id);
            return el('span', {
              class: 'ach-strip__item',
              title: def ? t(`ach.${id}.name`) : id,
              text: def ? def.icon : '🏆',
            });
          }))
          : emptyState({ icon: '🏆', title: t('ach.locked'), message: t('ach.firstRun.desc') }),
      ],
    }));

    /* Danger zone -------------------------------------------------- */
    root.appendChild(card({
      title: t('settings.data'),
      className: 'card--muted',
      body: [
        el('div', { class: 'row row--wrap' }, [
          button({ label: t('bookmarks.title'), icon: '⭐', variant: 'ghost', onClick: () => ctx.navigate('bookmarks') }),
          button({ label: t('lb.title'), icon: '🥇', variant: 'ghost', onClick: () => ctx.navigate('leaderboard') }),
          button({ label: t('nav.settings'), icon: '⚙️', variant: 'ghost', onClick: () => ctx.navigate('settings') }),
        ]),
      ],
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
