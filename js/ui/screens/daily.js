/* ui/screens/daily.js — the daily challenge: today's deterministic puzzle,
 * personal results, streak, a 14-day calendar and the past-challenge archive. */

import { el, formatTime, formatNumber, dayKey, dayKeyOffset, humanDate, titleKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, statTile, difficultyBadge, languageBadge, badge, emptyState, segmented, copyButton } from '../components.js';
import { starRating } from '../charts.js';
import { Statistics } from '../../storage/statistics.js';
import { Settings } from '../../storage/settings.js';
import { LANGUAGES, resolveTitle } from '../../api/wikipedia.js';
import { dailyChallenge, dailyDifficulty, dailySeedString, pastDailyChallenges } from '../../game/challenges.js';
import { difficultyConfig } from '../../game/difficulty.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { notify } from '../notifications.js';

registerScreen('daily', (ctx) => {
  const root = el('div', { class: 'screen screen--daily' });
  let lang = Settings.get('language') || 'en';
  let challenge = null;
  let loading = false;
  let error = null;
  let archive = [];
  let showArchive = false;

  function render() {
    root.innerHTML = '';
    const today = dayKey();
    const result = Statistics.getDailyResult(today);
    const stats = Statistics.summary();
    const dailyStreak = Statistics.all.dailyStreak || { current: 0, longest: 0 };

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('daily.title') }),
      el('p', { class: 'screen__sub', text: t('daily.subtitle') }),
    ]));

    /* Language selector */
    root.appendChild(el('div', { class: 'chip-row chip-row--scroll' }, LANGUAGES.map((l) => el('button', {
      class: `chip ${lang === l.code ? 'is-active' : ''}`,
      type: 'button',
      onClick: () => { lang = l.code; Settings.set({ language: lang }); load(); },
    }, [el('span', { text: l.flag, 'aria-hidden': 'true' }), el('span', { text: l.native })]))));

    /* Today's card */
    const body = [];
    if (loading) {
      body.push(el('div', { class: 'daily-loading' }, [el('span', { class: 'spinner' }), el('p', { class: 'muted', text: t('common.loading') })]));
    } else if (error) {
      body.push(emptyState({
        icon: '📡',
        title: t('error.title'),
        message: error,
        action: button({ label: t('error.tryAgain'), onClick: () => load() }),
      }));
    } else if (challenge) {
      const cfg = difficultyConfig(challenge.difficulty);
      body.push(el('div', { class: 'daily-card' }, [
        el('div', { class: 'daily-card__head' }, [
          el('div', {}, [
            el('span', { class: 'daily-card__date', text: humanDate(today, uiLocale()) }),
            el('span', { class: 'muted', text: `${t('daily.seed')}: ${challenge.seedString}` }),
          ]),
          el('div', { class: 'row row--wrap' }, [
            difficultyBadge(challenge.difficulty),
            languageBadge(lang),
            result && result.completed ? badge(`✓ ${t('daily.completed')}`, { tone: 'success' }) : badge(t('daily.pending'), { tone: 'neutral' }),
          ]),
        ]),
        el('div', { class: 'daily-card__pair' }, [
          el('div', { class: 'daily-card__article' }, [
            el('span', { class: 'daily-card__role', text: t('game.start') }),
            el('strong', { class: 'daily-card__title', text: challenge.start }),
          ]),
          el('span', { class: 'daily-card__arrow', text: '→', 'aria-hidden': 'true' }),
          el('div', { class: 'daily-card__article' }, [
            el('span', { class: 'daily-card__role', text: t('game.target') }),
            el('strong', { class: 'daily-card__title', text: challenge.target }),
          ]),
        ]),
        el('p', { class: 'field__hint', text: `${cfg.blurb} · Par ≈ ${cfg.parClicks} ${t('common.clicks')} / ${Math.round(cfg.parSeconds)}s` }),
        el('div', { class: 'daily-card__actions' }, [
          button({
            label: result && result.completed ? t('daily.replay') : t('daily.play'),
            icon: '▶',
            variant: 'primary',
            className: 'btn--lg',
            onClick: () => startDaily(),
          }),
          copyButton(`${challenge.start} → ${challenge.target} (${challenge.seedString})`, { label: t('daily.copySeed') }),
          button({
            label: t('bookmarks.challenges'),
            icon: '⭐',
            variant: 'ghost',
            onClick: () => {
              const saved = Bookmarks.saveChallenge({ lang, start: challenge.start, target: challenge.target, difficulty: challenge.difficulty, mode: 'daily', day: today, seed: challenge.seed });
              notify[saved ? 'success' : 'info'](saved ? t('bookmarks.saved') : t('bookmarks.saved'));
            },
          }),
        ]),
      ]));
    }
    root.appendChild(card({ title: t('daily.title'), className: 'card--accent', body }));

    /* Personal result */
    const resultTiles = el('div', { class: 'grid grid--tiles' }, [
      statTile({ label: t('daily.attempts'), value: String(result ? result.attempts : 0), icon: '🔁' }),
      statTile({ label: t('daily.bestTime'), value: result && result.bestTimeMs ? formatTime(result.bestTimeMs) : '—', icon: '⏱' }),
      statTile({ label: t('daily.bestClicks'), value: result && result.bestClicks !== null && result.bestClicks !== undefined ? String(result.bestClicks) : '—', icon: '🖱️' }),
      statTile({ label: t('daily.bestScore'), value: result && result.bestScore ? formatNumber(result.bestScore, uiLocale()) : '—', icon: '🏅' }),
      statTile({ label: t('stats.currentStreak'), value: String(dailyStreak.current), icon: '🔥' }),
      statTile({ label: t('stats.longestStreak'), value: String(dailyStreak.longest), icon: '🏆' }),
    ]);
    root.appendChild(card({ title: t('daily.status'), body: [resultTiles, el('p', { class: 'field__hint', text: t('daily.streakNote') })] }));

    /* Calendar ------------------------------------------------------ */
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const key = dayKeyOffset(-i);
      const r = Statistics.getDailyResult(key);
      days.push({ key, ts: new Date(`${key}T12:00:00`).getTime(), label: key, completed: Boolean(r && r.completed), attempts: r ? r.attempts : 0 });
    }
    const calendar = el('div', { class: 'daily-calendar' }, days.map((d) => el('div', {
      class: `daily-day ${d.completed ? 'is-done' : d.attempts ? 'is-tried' : ''}`,
      title: `${d.label}${d.completed ? ' ✓' : d.attempts ? ` · ${d.attempts} attempts` : ''}`,
    }, [
      el('span', { class: 'daily-day__num', text: String(new Date(d.ts).getDate()) }),
      el('span', { class: 'daily-day__dot', 'aria-hidden': 'true' }),
    ])));
    root.appendChild(card({ title: t('daily.calendar'), body: [calendar] }));

    /* Archive ------------------------------------------------------- */
    const archiveBody = [button({
      label: showArchive ? t('common.close') : t('daily.archive'),
      icon: showArchive ? '⌃' : '📜',
      variant: 'ghost',
      onClick: async () => {
        showArchive = !showArchive;
        if (showArchive && !archive.length) {
          try {
            archive = await pastDailyChallenges({ days: 14, lang, signal: null, verify: false });
          } catch (err) {
            notify.warn(t('error.apiFail'));
          }
        }
        render();
      },
    })];
    if (showArchive) {
      archiveBody.push(el('ul', { class: 'archive-list' }, archive.map((ch) => el('li', { class: 'archive-row' }, [
        el('span', { class: 'archive-row__date', text: ch.dateKey }),
        el('span', { class: 'archive-row__pair', text: ch.error ? '—' : `${ch.start} → ${ch.target}` }),
        ch.difficulty ? difficultyBadge(ch.difficulty) : null,
        button({
          label: t('bookmarks.playChallenge'),
          variant: 'ghost',
          className: 'btn--sm',
          disabled: Boolean(ch.error),
          onClick: () => ctx.navigate('game', {
            config: { mode: 'custom', lang, start: ch.start, target: ch.target, difficulty: ch.difficulty, allowHints: true, allowPowerups: true },
            mode: 'custom',
          }),
        }),
      ]))));
    }
    root.appendChild(card({ title: t('daily.archive'), body: archiveBody }));
  }

  async function load() {
    loading = true;
    error = null;
    render();
    try {
      challenge = await dailyChallenge({ dateKey: dayKey(), lang, verify: true, difficulty: dailyDifficulty(dayKey(), lang) });
    } catch (err) {
      challenge = null;
      error = err && err.message ? err.message : t('error.apiFail');
    } finally {
      loading = false;
      render();
    }
  }

  function startDaily() {
    if (!challenge) return;
    Settings.set({ language: lang });
    ctx.navigate('game', {
      config: {
        mode: 'daily',
        lang,
        difficulty: challenge.difficulty,
        start: challenge.start,
        target: challenge.target,
        seed: challenge.seed,
        allowHints: true,
        allowPowerups: true,
        verify: false,
      },
      mode: 'daily',
    });
  }

  load();

  return {
    el: root,
    onShow() { render(); },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
