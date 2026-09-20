/* ui/screens/play.js — mode picker and per-mode setup (custom, time attack,
 * endless, sandbox). Nothing here starts a run directly: it hands a config to
 * the game screen, which owns the actual session. */

import { el, formatNumber, titleKey } from '../../core/util.js';
import { t, uiLocale } from '../../core/i18n.js';
import { registerScreen } from './index.js';
import { card, button, segmented, switchField, difficultyBadge, articlePicker, modeBadge, badge, statTile, emptyState } from '../components.js';
import { Settings } from '../../storage/settings.js';
import { Statistics } from '../../storage/statistics.js';
import { LANGUAGES, randomArticle } from '../../api/wikipedia.js';
import { DIFFICULTIES, difficultyConfig, MODIFIERS } from '../../game/difficulty.js';
import { TIME_ATTACK_OPTIONS } from '../../game/challenges.js';
import { notify } from '../notifications.js';

const MODES = [
  { id: 'quick', icon: '⚡', labelKey: 'modes.quick', descKey: 'modes.quickDesc' },
  { id: 'custom', icon: '🎛️', labelKey: 'modes.custom', descKey: 'modes.customDesc' },
  { id: 'timeattack', icon: '⏱️', labelKey: 'modes.timeattack', descKey: 'modes.timeattackDesc' },
  { id: 'clickattack', icon: '🖱️', labelKey: 'modes.clickattack', descKey: 'modes.clickattackDesc' },
  { id: 'endless', icon: '♾️', labelKey: 'modes.endless', descKey: 'modes.endlessDesc' },
  { id: 'sandbox', icon: '🧪', labelKey: 'modes.sandbox', descKey: 'modes.sandboxDesc' },
  { id: 'daily', icon: '📅', labelKey: 'modes.daily', descKey: 'modes.dailyDesc', target: 'daily' },
];

registerScreen('play', (ctx) => {
  const root = el('div', { class: 'screen screen--play' });
  let mode = Settings.get('lastMode') || 'quick';
  let lang = Settings.get('language') || 'en';
  let difficulty = Settings.get('difficulty') || 'normal';
  let timeLimitMinutes = 3;
  let allowHints = true;
  let allowPowerups = Settings.get('powerupsEnabled') !== false;
  let customStart = '';
  let customTarget = '';
  let chaosModifiers = [];
  let lastParams = {};

  function startRun(config) {
    Settings.set({ lastMode: mode });
    ctx.navigate('game', { config, mode });
  }

  function render() {
    root.innerHTML = '';
    root.appendChild(el('header', { class: 'screen__head' }, [
      el('h1', { class: 'screen__title', text: t('modes.title') }),
      el('p', { class: 'screen__sub', text: t('app.tagline') }),
    ]));

    /* Mode tabs ---------------------------------------------------- */
    const tabs = el('div', { class: 'mode-tabs', role: 'tablist' });
    for (const m of MODES) {
      const btn = el('button', {
        class: `mode-tab ${mode === m.id ? 'is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(mode === m.id),
        onClick: () => {
          if (m.target === 'daily') { ctx.navigate('daily'); return; }
          mode = m.id;
          Settings.set({ lastMode: mode });
          render();
        },
      }, [
        el('span', { class: 'mode-tab__icon', text: m.icon, 'aria-hidden': 'true' }),
        el('span', { class: 'mode-tab__label', text: t(m.labelKey) }),
      ]);
      tabs.appendChild(btn);
    }
    root.appendChild(tabs);

    /* Shared options ----------------------------------------------- */
    const optionsBody = [];
    optionsBody.push(el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: t('common.language') }),
      el('div', { class: 'chip-row' }, LANGUAGES.map((l) => el('button', {
        class: `chip ${lang === l.code ? 'is-active' : ''}`,
        type: 'button',
        'aria-pressed': String(lang === l.code),
        onClick: () => { lang = l.code; Settings.set({ language: lang }); render(); },
      }, [
        el('span', { text: l.flag, 'aria-hidden': 'true' }),
        el('span', { text: l.native }),
      ]))),
    ]));

    const isChaos = difficulty === 'chaos';
    optionsBody.push(el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: t('common.difficulty') }),
      el('div', { class: 'difficulty-grid' }, DIFFICULTIES.map((d) => el('button', {
        class: `difficulty-card ${difficulty === d.id ? 'is-active' : ''}`,
        type: 'button',
        style: { '--diff-accent': d.accent },
        'aria-pressed': String(difficulty === d.id),
        onClick: () => {
          difficulty = d.id;
          Settings.set({ difficulty });
          if (d.id !== 'chaos') chaosModifiers = [];
          render();
        },
      }, [
        el('span', { class: 'difficulty-card__emoji', text: d.emoji, 'aria-hidden': 'true' }),
        el('span', { class: 'difficulty-card__name', text: d.label }),
        el('span', { class: 'difficulty-card__blurb', text: d.blurb }),
        el('span', { class: 'difficulty-card__par', text: `≈ ${d.parClicks} ${t('common.clicks')} · ${Math.round(d.parSeconds / 60)} ${t('common.seconds').slice(0, 0)}min` }),
      ]))),
      isChaos ? el('p', { class: 'field__hint', text: t('modes.endlessDesc') }) : null,
    ]));

    if (isChaos) {
      chaosModifiers = chaosModifiers.length ? chaosModifiers : [];
      optionsBody.push(el('div', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'Chaos modifiers' }),
        el('div', { class: 'chip-row' }, MODIFIERS.map((mod) => el('button', {
          class: `chip ${chaosModifiers.some((m) => m.id === mod.id) ? 'is-active' : ''}`,
          type: 'button',
          title: mod.desc,
          onClick: () => {
            chaosModifiers = chaosModifiers.some((m) => m.id === mod.id)
              ? chaosModifiers.filter((m) => m.id !== mod.id)
              : [...chaosModifiers, mod];
            render();
          },
        }, [el('span', { text: mod.icon, 'aria-hidden': 'true' }), el('span', { text: mod.label })]))),
        el('p', { class: 'field__hint', text: 'Leave empty for a random roll.' }),
      ]));
    }

    /* Mode-specific panels ----------------------------------------- */
    const panel = el('div', { class: 'mode-panel' });
    const startBtn = button({
      label: mode === 'sandbox' ? t('sandbox.start') : t('custom.startRun'),
      icon: '▶',
      variant: 'primary',
      className: 'btn--lg btn--block',
      onClick: () => onStart(),
    });

    async function onStart() {
      startBtn.disabled = true;
      try {
        if (mode === 'custom') {
          const start = pickerStart && (pickerStart.verifiedValue || await pickerStart.validate());
          const target = pickerTarget && (pickerTarget.verifiedValue || await pickerTarget.validate());
          if (!start) { notify.error(t('custom.missingStart')); return; }
          if (!target) { notify.error(t('custom.missingTarget')); return; }
          if (titleKey(start) === titleKey(target)) { notify.error(t('custom.sameError')); return; }
          startRun({ mode: 'custom', lang, difficulty, start, target, allowHints, allowPowerups, timeLimitMs: timeLimitMinutes ? timeLimitMinutes * 60000 : 0 });
          return;
        }
        if (mode === 'timeattack') {
          startRun({ mode: 'timeattack', lang, difficulty, timeLimitMs: timeLimitMinutes * 60000, allowHints, allowPowerups });
          return;
        }
        if (mode === 'endless') {
          startRun({ mode: 'endless', lang, difficulty, allowHints, allowPowerups });
          return;
        }
        if (mode === 'sandbox') {
          startRun({ mode: 'sandbox', lang, difficulty: 'normal', start: customStart || null, allowHints: false, allowPowerups: true });
          return;
        }
        startRun({ mode: 'quick', lang, difficulty, allowHints, allowPowerups, modifiers: chaosModifiers });
      } finally {
        startBtn.disabled = false;
      }
    }

    let pickerStart = null;
    let pickerTarget = null;

    if (mode === 'custom') {
      pickerStart = articlePicker({
        lang,
        value: customStart,
        label: t('custom.start'),
        placeholder: t('custom.startPlaceholder'),
        onPick: (v) => { customStart = v; },
        allowRandom: true,
        onRandom: async () => {
          const title = await randomArticle(lang, {});
          if (title) { customStart = title; pickerStart.set(title); }
        },
      });
      pickerTarget = articlePicker({
        lang,
        value: customTarget,
        label: t('custom.target'),
        placeholder: t('custom.targetPlaceholder'),
        onPick: (v) => { customTarget = v; },
        allowRandom: true,
        onRandom: async () => {
          const title = await randomArticle(lang, {});
          if (title) { customTarget = title; pickerTarget.set(title); }
        },
      });
      panel.append(
        pickerStart.element,
        pickerTarget.element,
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', text: t('custom.timeLimit') }),
          segmented({
            ariaLabel: t('custom.timeLimit'),
            value: timeLimitMinutes,
            options: [
              { value: 0, label: t('custom.noLimit'), icon: '⏱' },
              ...TIME_ATTACK_OPTIONS.map((o) => ({ value: o.minutes, label: t(o.labelKey), icon: '⏳' })),
            ],
            onChange: (v) => { timeLimitMinutes = v; },
          }),
        ]),
        el('div', { class: 'field field--switches' }, [
          switchField({ id: 'allow-hints', label: t('custom.allowHints'), checked: allowHints, onChange: (v) => { allowHints = v; } }),
          switchField({ id: 'allow-powerups', label: t('custom.allowPowerups'), checked: allowPowerups, onChange: (v) => { allowPowerups = v; } }),
        ]),
      );
    } else if (mode === 'timeattack') {
      panel.append(el('div', { class: 'field' }, [
        el('span', { class: 'field__label', text: t('timeattack.pick') }),
        el('div', { class: 'grid grid--2' }, TIME_ATTACK_OPTIONS.map((o) => el('button', {
          class: `time-card ${timeLimitMinutes === o.minutes ? 'is-active' : ''}`,
          type: 'button',
          onClick: () => { timeLimitMinutes = o.minutes; render(); },
        }, [
          el('strong', { class: 'time-card__value', text: String(o.minutes) }),
          el('span', { class: 'time-card__unit', text: o.minutes === 1 ? 'minute' : 'minutes' }),
        ]))),
      ]));
    } else if (mode === 'endless') {
      panel.append(el('div', { class: 'endless-intro' }, [
        el('p', { text: t('endless.desc') }),
        el('div', { class: 'endless-steps' }, [
          el('span', { class: 'endless-step', text: '1-2' }),
          el('span', { class: 'endless-step', text: '3-4' }),
          el('span', { class: 'endless-step', text: '5-7' }),
          el('span', { class: 'endless-step', text: '8-10' }),
          el('span', { class: 'endless-step', text: '11+' }),
        ]),
      ]));
    } else if (mode === 'sandbox') {
      const sandboxPicker = articlePicker({
        lang,
        value: customStart,
        label: t('custom.start'),
        placeholder: t('custom.startPlaceholder'),
        onPick: (v) => { customStart = v; },
        allowRandom: true,
        onRandom: async () => {
          const title = await randomArticle(lang, {});
          if (title) { customStart = title; sandboxPicker.set(title); }
        },
      });
      panel.append(
        el('p', { class: 'muted', text: t('sandbox.desc') }),
        sandboxPicker.element,
      );
    } else if (mode === 'clickattack') {
      panel.append(el('div', { class: 'info-box' }, [
        el('p', { text: t('modes.clickattackDesc') }),
        el('p', { class: 'muted', text: 'Timer runs, but score focuses on clicks. Par for this difficulty is shown below.' }),
      ]));
    } else {
      panel.append(el('div', { class: 'info-box' }, [
        el('p', { text: t('modes.quickDesc') }),
      ]));
    }

    const diffCfg = difficultyConfig(difficulty);
    panel.append(
      el('div', { class: 'run-preview' }, [
        el('div', { class: 'run-preview__item' }, [el('span', { class: 'muted', text: t('common.language') }), el('strong', { text: (LANGUAGES.find((l) => l.code === lang) || {}).label || lang })]),
        el('div', { class: 'run-preview__item' }, [el('span', { class: 'muted', text: t('common.difficulty') }), difficultyBadge(difficulty)]),
        el('div', { class: 'run-preview__item' }, [el('span', { class: 'muted', text: 'Par' }), el('strong', { text: `${diffCfg.parClicks} ${t('common.clicks')} · ${Math.round(diffCfg.parSeconds)}s` })]),
        mode === 'timeattack' || (mode === 'custom' && timeLimitMinutes)
          ? el('div', { class: 'run-preview__item' }, [el('span', { class: 'muted', text: t('custom.timeLimit') }), el('strong', { text: `${timeLimitMinutes} min` })])
          : null,
      ]),
      startBtn,
    );

    root.appendChild(card({ title: t(MODES.find((m) => m.id === mode).labelKey), subtitle: t(MODES.find((m) => m.id === mode).descKey), body: panel }));

    /* Side: shared settings + personal best ------------------------ */
    const pb = Statistics.personalBest({ lang, difficulty });
    const side = el('div', { class: 'grid grid--2' });
    side.appendChild(card({
      title: t('common.personalBest'),
      body: [
        el('div', { class: 'grid grid--tiles' }, [
          statTile({ label: t('stats.fastestRun'), value: pb && pb.timeMs ? `${(pb.timeMs / 1000).toFixed(2)}s` : '-', icon: '⚡', small: true }),
          statTile({ label: t('stats.fewestClicks'), value: pb ? String(pb.clicks) : '-', icon: '🖱️', small: true }),
          statTile({ label: t('stats.bestScore'), value: pb && pb.score ? formatNumber(pb.score, uiLocale()) : '-', icon: '🏅', small: true }),
          statTile({ label: t('stats.runs'), value: String((Statistics.all.perLanguage[lang] || {}).runs || 0), icon: '🎮', small: true }),
        ]),
        el('p', { class: 'field__hint', text: `${t('common.language')}: ${(LANGUAGES.find((l) => l.code === lang) || {}).label} · ${t('common.difficulty')}: ${diffCfg.label}` }),
      ],
    }));
    side.appendChild(card({
      title: t('home.tipTitle'),
      className: 'card--muted',
      body: [el('ul', { class: 'tips tips--compact' }, [
        el('li', { text: t('home.tip2') }),
        el('li', { text: t('home.tip3') }),
        el('li', { text: t('home.tip4') }),
      ])],
    }));
    root.appendChild(side);
  }

  render();
  if (lastParams.autostart) {
    // Quick play from the home hero starts immediately.
    setTimeout(() => {
      const btn = root.querySelector('.btn--primary.btn--lg');
      if (btn) btn.click();
    }, 60);
  }

  return {
    el: root,
    onShow(params = {}) {
      lastParams = params || {};
      if (params.mode && MODES.some((m) => m.id === params.mode)) mode = params.mode;
      render();
      if (params.autostart) setTimeout(() => { const btn = root.querySelector('.btn--primary.btn--lg'); if (btn) btn.click(); }, 80);
    },
    onHide() {},
    destroy() { root.innerHTML = ''; },
  };
});
