/* ui/screens/settings.js — gameplay, appearance, audio, language and data
 * management (export / import / reset / offline cache). */

import { el, downloadFile, formatNumber, safeJsonParse, dayKey } from '../../core/util.js';
import { t, uiLocale, setUiLanguage, detectUiLanguage, UI_LANGUAGES } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, segmented, switchField, sliderField, badge, difficultyBadge } from '../components.js';
import { Settings, THEMES, SKINS } from '../../storage/settings.js';
import { Statistics } from '../../storage/statistics.js';
import { Profile } from '../../storage/profile.js';
import { Achievements } from '../../storage/achievements.js';
import { Bookmarks } from '../../storage/bookmarks.js';
import { Leaderboard } from '../../storage/leaderboard.js';
import { ArticleCache } from '../../storage/articleCache.js';
import { estimateStorageBytes, clearAll } from '../../core/store.js';
import { LANGUAGES } from '../../api/wikipedia.js';
import { DIFFICULTIES } from '../../game/difficulty.js';
import { notify, confirmDialog, modal } from '../notifications.js';
import { playSound, unlockAudio, setVolume, setSoundEnabled, SOUND_NAMES } from '../sound.js';
import { SCHEMA_VERSION, exportSave, importSave, resetEverything } from '../../core/save.js';

registerScreen('settings', (ctx) => {
  const root = el('div', { class: 'screen screen--settings' });

  function render() {
    root.innerHTML = '';
    const s = Settings.all;

    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('settings.title') }),
      el('p', { class: 'screen__sub', text: `v${SCHEMA_VERSION} · ${t('app.name')}` }),
    ]));

    /* Gameplay ----------------------------------------------------- */
    root.appendChild(card({
      title: t('settings.gameplay'),
      body: [
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('settings.timerStyle') }),
          segmented({
            ariaLabel: t('settings.timerStyle'),
            value: s.timerStyle,
            options: [
              { value: 'auto', label: 'Auto', icon: '🤖' },
              { value: 'stopwatch', label: t('settings.timerStopwatch'), icon: '⏱' },
              { value: 'countdown', label: t('settings.timerCountdown'), icon: '⏳' },
            ],
            onChange: (v) => Settings.set({ timerStyle: v }),
          }),
          el('p', { class: 'field__hint', text: 'Auto uses a countdown when the mode or difficulty defines one.' }),
        ]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('settings.defaultDifficulty') }),
          el('div', { class: 'chip-row' }, DIFFICULTIES.map((d) => el('button', {
            class: `chip ${s.difficulty === d.id ? 'is-active' : ''}`,
            type: 'button',
            title: d.blurb,
            onClick: () => { Settings.set({ difficulty: d.id }); render(); },
          }, [el('span', { text: d.emoji, 'aria-hidden': 'true' }), el('span', { text: d.label })]))),
        ]),
        sliderField({
          id: 'hint-seconds',
          label: t('settings.hintPenaltyTime'),
          min: 0, max: 60, step: 1,
          value: s.hintPenaltySeconds,
          format: (v) => `${v}s`,
          onChange: (v) => Settings.set({ hintPenaltySeconds: v }),
        }),
        sliderField({
          id: 'hint-clicks',
          label: t('settings.hintPenaltyClick'),
          min: 0, max: 5, step: 1,
          value: s.hintPenaltyClicks,
          format: (v) => `${v}`,
          onChange: (v) => Settings.set({ hintPenaltyClicks: v }),
        }),
        switchField({
          id: 'click-article-only',
          label: t('settings.clickCounting'),
          description: t('settings.clickCountingHint'),
          checked: s.countArticleClicksOnly,
          onChange: (v) => Settings.set({ countArticleClicksOnly: v }),
        }),
        switchField({
          id: 'powerups-default',
          label: t('settings.powerupsEnabled'),
          checked: s.powerupsEnabled,
          onChange: (v) => Settings.set({ powerupsEnabled: v }),
        }),
        switchField({
          id: 'confirm-abandon',
          label: 'Confirm before abandoning a run',
          checked: s.confirmAbandon,
          onChange: (v) => Settings.set({ confirmAbandon: v }),
        }),
        switchField({
          id: 'autopause',
          label: 'Auto-pause when the tab loses focus',
          checked: s.autoPauseOnBlur,
          onChange: (v) => Settings.set({ autoPauseOnBlur: v }),
        }),
        switchField({
          id: 'keep-awake',
          label: 'Keep the screen awake while playing',
          checked: s.keepScreenAwake,
          onChange: (v) => Settings.set({ keepScreenAwake: v }),
        }),
      ],
    }));

    /* Appearance --------------------------------------------------- */
    root.appendChild(card({
      title: t('settings.appearance'),
      body: [
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('settings.theme') }),
          segmented({
            ariaLabel: t('settings.theme'),
            value: s.theme,
            options: [
              { value: 'light', label: t('settings.themeLight'), icon: '☀️' },
              { value: 'dark', label: t('settings.themeDark'), icon: '🌙' },
              { value: 'system', label: t('settings.themeSystem'), icon: '🖥' },
            ],
            onChange: (v) => Settings.set({ theme: v }),
          }),
        ]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('settings.skin') }),
          el('div', { class: 'chip-row' }, SKINS.map((skin) => el('button', {
            class: `chip chip--skin ${s.skin === skin ? 'is-active' : ''}`,
            type: 'button',
            onClick: () => { Settings.set({ skin }); render(); },
          }, [
            el('span', { class: `skin-preview skin-preview--${skin}`, 'aria-hidden': 'true' }),
            el('span', { text: t(`settings.skin${skin.charAt(0).toUpperCase()}${skin.slice(1)}`) }),
          ]))),
        ]),
        switchField({
          id: 'compact-hud',
          label: t('settings.compactHud'),
          checked: s.compactHud,
          onChange: (v) => Settings.set({ compactHud: v }),
        }),
        switchField({
          id: 'animations',
          label: t('settings.animations'),
          description: t('settings.animationsHint'),
          checked: s.animations,
          onChange: (v) => Settings.set({ animations: v }),
        }),
        switchField({
          id: 'show-route',
          label: 'Show the route panel while playing',
          checked: s.showRoutePanel,
          onChange: (v) => Settings.set({ showRoutePanel: v }),
        }),
      ],
    }));

    /* Audio -------------------------------------------------------- */
    const volumeSlider = sliderField({
      id: 'volume',
      label: t('settings.volume'),
      min: 0, max: 100, step: 5,
      value: Math.round(s.volume * 100),
      format: (v) => `${v}%`,
      onChange: (v) => { setVolume(v / 100); Settings.set({ volume: v / 100 }); },
    });
    root.appendChild(card({
      title: t('settings.audio'),
      body: [
        switchField({
          id: 'sound',
          label: t('settings.sound'),
          checked: s.soundEnabled,
          onChange: (v) => { setSoundEnabled(v); Settings.set({ soundEnabled: v }); if (v) { unlockAudio(); playSound('save'); } },
        }),
        volumeSlider,
        el('div', { class: 'row row--wrap' }, [
          button({ label: t('settings.testSound'), icon: '🔔', variant: 'ghost', onClick: () => { unlockAudio(); playSound('achievement'); } }),
          ...SOUND_NAMES.slice(0, 4).map((name) => button({ label: name, variant: 'ghost', className: 'btn--sm', onClick: () => { unlockAudio(); playSound(name); } })),
        ]),
      ],
    }));

    /* Language ----------------------------------------------------- */
    root.appendChild(card({
      title: t('common.language'),
      body: [
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('settings.uiLanguage') }),
          segmented({
            ariaLabel: t('settings.uiLanguage'),
            value: s.uiLanguage || detectUiLanguage(),
            options: UI_LANGUAGES.map((l) => ({ value: l.code, label: l.label, icon: l.flag })),
            onChange: (v) => { Settings.set({ uiLanguage: v }); setUiLanguage(v); render(); },
          }),
        ]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('settings.defaultLanguage') }),
          el('div', { class: 'chip-row chip-row--scroll' }, LANGUAGES.map((l) => el('button', {
            class: `chip ${s.language === l.code ? 'is-active' : ''}`,
            type: 'button',
            onClick: () => { Settings.set({ language: l.code }); render(); },
          }, [el('span', { text: l.flag, 'aria-hidden': 'true' }), el('span', { text: l.native })]))),
        ]),
      ],
    }));

    /* Data --------------------------------------------------------- */
    const bytes = estimateStorageBytes();
    root.appendChild(card({
      title: t('settings.data'),
      body: [
        el('div', { class: 'storage-usage' }, [
          el('span', { class: 'muted', text: t('settings.storage') }),
          el('strong', { text: `${(bytes / 1024).toFixed(1)} KB` }),
          badge(`${ArticleCache.count()} ${t('settings.cachedArticles')}`, { tone: 'neutral', icon: '📦' }),
        ]),
        el('div', { class: 'row row--wrap' }, [
          button({ label: t('settings.exportData'), icon: '⬇️', onClick: exportData }),
          button({ label: t('settings.importData'), icon: '⬆️', variant: 'ghost', onClick: importData }),
          button({ label: t('settings.clearArticleCache'), icon: '🧹', variant: 'ghost', onClick: () => { ArticleCache.clear(); notify.success(t('settings.articleCacheCleared')); render(); } }),
          button({ label: t('settings.resetData'), icon: '🗑', variant: 'danger', onClick: resetData }),
        ]),
        switchField({
          id: 'offline-cache',
          label: t('settings.offlineCache'),
          description: t('settings.offlineCacheDesc'),
          checked: s.offlineArticleCache,
          onChange: (v) => { Settings.set({ offlineArticleCache: v }); ArticleCache.configure({ enabled: v, limit: Settings.get('articleCacheLimit') }); },
        }),
        el('p', { class: 'field__hint', text: `${t('settings.version')}: ${SCHEMA_VERSION} · ${t('settings.storage')}: localStorage` }),
      ],
    }));

    /* PWA / about -------------------------------------------------- */
    root.appendChild(card({
      title: t('settings.installApp'),
      className: 'card--muted',
      body: [
        el('p', { class: 'muted', text: t('settings.installHint') }),
        el('div', { class: 'row row--wrap' }, [
          ctx.canInstall && ctx.canInstall() ? button({ label: t('settings.installApp'), icon: '📲', onClick: () => ctx.install && ctx.install() }) : null,
          button({ label: 'Service worker', icon: '🔧', variant: 'ghost', onClick: showSwInfo }),
        ]),
      ],
    }));
  }

  function exportData() {
    const payload = exportSave();
    downloadFile(`WikipediaSpeedrun-save.json`, JSON.stringify(payload, null, 2));
    notify.success(t('settings.exportDone'));
  }

  async function importData() {
    const input = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const ok = await confirmDialog(t('settings.importConfirm'), { title: t('settings.importData'), danger: true, confirmLabel: t('common.import') });
      if (!ok) return;
      try {
        const text = await file.text();
        const result = importSave(text);
        if (!result.ok) { notify.error(`${t('settings.importFailed')} ${result.errors.slice(0, 2).join('; ')}`); return; }
        notify.success(t('settings.importOk'));
        render();
      } catch (err) {
        notify.error(t('settings.importFailed'));
      }
    });
    input.click();
  }

  async function resetData() {
    const ok = await confirmDialog(t('settings.resetConfirm'), { title: t('settings.resetData'), danger: true, confirmLabel: t('settings.resetData') });
    if (!ok) return;
    const typed = await modal({
      title: t('settings.resetData'),
      body: el('div', { class: 'field' }, [
        el('p', { class: 'modal__text', text: t('settings.resetConfirm') }),
        el('input', { class: 'input', id: 'reset-confirm', placeholder: 'DELETE' }),
      ]),
      actions: [
        { id: null, label: t('common.cancel'), variant: 'ghost' },
        { id: 'ok', label: t('settings.resetData'), variant: 'danger' },
      ],
      onMount: (content) => { const i = content.querySelector('#reset-confirm'); i.focus(); },
    });
    if (typed !== 'ok') return;
    const value = document.querySelector('#reset-confirm') ? document.querySelector('#reset-confirm').value : '';
    resetEverything();
    notify.success(t('settings.resetDone'));
    render();
    ctx.navigate('home');
  }

  function showSwInfo() {
    const reg = navigator.serviceWorker && navigator.serviceWorker.controller;
    modal({
      title: 'Offline & service worker',
      body: el('div', {}, [
        el('p', { text: navigator.onLine ? 'You are online.' : 'You are offline — cached content still works.' }),
        el('p', { text: `Service worker: ${reg ? 'active' : (navigator.serviceWorker ? 'registered/controlling not yet' : 'unsupported in this browser')}` }),
        el('p', { class: 'muted', text: 'The app shell (HTML/CSS/JS/manifest/icons) is cached for offline use. Wikipedia articles are cached individually as you visit them.' }),
      ]),
      actions: [{ id: 'ok', label: t('common.done'), variant: 'primary' }],
    });
  }

  render();
  return {
    el: root,
    onShow() { render(); },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
