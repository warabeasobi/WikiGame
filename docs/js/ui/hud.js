/* ui/hud.js — the in-game heads-up display.
 *
 * Stays pinned while the player reads Wikipedia, never covers the article, and
 * updates by mutating existing nodes (no full re-render on every timer tick).
 * Collapses to a single compact row on small screens.
 */

import { el, formatTime, formatClock, titleKey, clamp } from '../core/util.js';
import { t } from '../core/i18n.js';
import { difficultyConfig } from '../game/difficulty.js';
import { powerupsForMode, isPowerupActive } from '../game/powerups.js';
import { HINT_TYPES } from '../game/hints.js';
import { modeLabel } from './components.js';

export class Hud {
  /**
   * @param {object} opts
   * @param {(action:string, payload?:any)=>void} opts.onAction
   */
  constructor({ onAction = () => {}, compact = false } = {}) {
    this.onAction = onAction;
    this.compact = compact;
    this.expanded = !compact;
    this.refs = {};
    this.el = this._build();
    this._lastTimerText = '';
    this._lastWarning = null;
  }

  _build() {
    const root = el('div', { class: `hud ${this.compact ? 'hud--compact' : ''}`, role: 'region', 'aria-label': t('game.current') });

    // Row 1 — always visible: timer, clicks, streak, quick actions
    const timerValue = el('strong', { class: 'hud__timer-value', text: '00:00.00' });
    const timerMode = el('span', { class: 'hud__timer-mode', text: '' });
    const timerFill = el('span', { class: 'hud__timer-fill' });
    const timerBar = el('div', { class: 'hud__timer-bar' }, [timerFill]);
    const timerBlock = el('div', { class: 'hud__timer' }, [
      el('div', { class: 'hud__timer-top' }, [timerValue, timerMode]),
      timerBar,
    ]);

    const clicksValue = el('strong', { class: 'hud__chip-value', text: '0' });
    const clicksChip = el('button', { class: 'hud__chip', type: 'button', title: t('game.clicks'), onClick: () => this.onAction('toggle-route') }, [
      el('span', { class: 'hud__chip-icon', text: '🖱️', 'aria-hidden': 'true' }),
      clicksValue,
      el('span', { class: 'hud__chip-label', text: t('game.clicks') }),
    ]);

    const streakValue = el('strong', { class: 'hud__chip-value', text: '0' });
    const streakChip = el('div', { class: 'hud__chip hud__chip--streak', title: t('common.streak') }, [
      el('span', { class: 'hud__chip-icon', text: '🔥', 'aria-hidden': 'true' }),
      streakValue,
    ]);

    const stageChip = el('div', { class: 'hud__chip hud__chip--stage is-hidden' }, [
      el('span', { class: 'hud__chip-icon', text: '♾️', 'aria-hidden': 'true' }),
      el('strong', { class: 'hud__chip-value', text: '1' }),
    ]);

    const hintBtn = el('button', { class: 'icon-btn hud__action', type: 'button', title: t('game.hint'), 'aria-label': t('game.hint'), onClick: () => this.onAction('hint') }, [
      el('span', { text: '💡', 'aria-hidden': 'true' }),
      el('span', { class: 'hud__action-badge', text: '0' }),
    ]);

    const powerBtn = el('button', { class: 'icon-btn hud__action', type: 'button', title: t('game.powerupsTitle'), 'aria-label': t('game.powerupsTitle'), onClick: () => this.onAction('powerups') }, [
      el('span', { text: '🧰', 'aria-hidden': 'true' }),
      el('span', { class: 'hud__action-badge', text: '0' }),
    ]);

    const pauseBtn = el('button', { class: 'icon-btn hud__action hud__pause', type: 'button', title: t('common.pause'), 'aria-label': t('common.pause'), onClick: () => this.onAction('toggle-pause') }, [
      el('span', { class: 'hud__pause-icon', text: '⏸', 'aria-hidden': 'true' }),
    ]);

    const expandBtn = el('button', { class: 'icon-btn hud__action hud__expand', type: 'button', title: t('common.preview'), 'aria-label': t('game.target'), onClick: () => this.toggleExpanded() }, [
      el('span', { text: '⌄', 'aria-hidden': 'true' }),
    ]);

    const row1 = el('div', { class: 'hud__row hud__row--main' }, [
      timerBlock,
      el('div', { class: 'hud__chips' }, [clicksChip, streakChip, stageChip]),
      el('div', { class: 'hud__actions' }, [hintBtn, powerBtn, pauseBtn, expandBtn]),
    ]);

    // Row 2 — breadcrumb + badges
    const startEl = el('button', { class: 'crumb__item', type: 'button', onClick: () => this.onAction('inspect', 'start') });
    const currentEl = el('span', { class: 'crumb__item crumb__item--current' });
    const targetEl = el('button', { class: 'crumb__item crumb__item--target', type: 'button', onClick: () => this.onAction('inspect', 'target') });
    const crumb = el('div', { class: 'hud__crumb' }, [
      el('span', { class: 'crumb__label', text: t('game.start') }),
      startEl,
      el('span', { class: 'crumb__arrow', text: '→', 'aria-hidden': 'true' }),
      el('span', { class: 'crumb__label', text: t('game.current') }),
      currentEl,
      el('span', { class: 'crumb__arrow', text: '→', 'aria-hidden': 'true' }),
      el('span', { class: 'crumb__label', text: t('game.target') }),
      targetEl,
    ]);

    const badges = el('div', { class: 'hud__badges' });
    const effects = el('div', { class: 'hud__effects' });

    const row2 = el('div', { class: 'hud__row hud__row--meta' }, [crumb, badges, effects]);

    const warning = el('div', { class: 'hud__warning is-hidden', role: 'status', text: '' });

    root.append(row1, row2, warning);
    Object.assign(this.refs, {
      root, timerValue, timerMode, timerFill, clicksValue, streakValue, stageChip, streakChip,
      hintBtn, powerBtn, pauseBtn, expandBtn, startEl, currentEl, targetEl, badges, effects, warning, row2,
    });
    return root;
  }

  mount(parent) {
    parent.appendChild(this.el);
    return this;
  }

  destroy() {
    this.el.remove();
  }

  toggleExpanded(force = null) {
    this.expanded = force === null ? !this.expanded : Boolean(force);
    this.el.classList.toggle('is-expanded', this.expanded);
    this.refs.row2.classList.toggle('is-collapsed', !this.expanded);
    this.refs.expandBtn.querySelector('span').textContent = this.expanded ? '⌃' : '⌄';
    this.refs.expandBtn.setAttribute('aria-expanded', String(this.expanded));
  }

  /** Full refresh (called on state changes, not on every tick). */
  update(state) {
    const r = this.refs;
    if (!state) return;

    const limitMs = state.timer.limitMs || state.rules.timeLimitMs || 0;
    const countdown = Boolean(limitMs);
    const display = countdown ? Math.max(0, limitMs - state.timer.elapsedMs) : state.timer.elapsedMs;

    r.timerValue.textContent = formatTime(display);
    r.timerValue.classList.toggle('is-low', countdown && display <= 30000);
    r.timerValue.classList.toggle('is-critical', countdown && display <= 10000);
    r.timerMode.textContent = countdown ? '⏳' : '⏱';
    const ratio = limitMs ? clamp(state.timer.elapsedMs / limitMs, 0, 1) : clamp(state.timer.elapsedMs / 60000, 0, 1);
    r.timerFill.style.width = `${ratio * 100}%`;
    r.timerFill.classList.toggle('is-low', ratio > 0.7);
    r.timerFill.classList.toggle('is-critical', ratio > 0.9);

    r.clicksValue.textContent = String(state.clicks);
    if (state.rules.clickCap) r.clicksValue.textContent = `${state.clicks}/${state.rules.clickCap}`;

    r.streakValue.textContent = String(state.streakBefore || 0);
    r.streakChip.classList.toggle('is-hidden', !state.streakBefore);

    const isEndless = state.mode === 'endless';
    r.stageChip.classList.toggle('is-hidden', !isEndless);
    if (isEndless) r.stageChip.querySelector('strong').textContent = String(state.endlessStage || 1);

    const hintsLeft = Math.max(0, 9 - (state.hintsUsed || 0));
    r.hintBtn.querySelector('.hud__action-badge').textContent = String(state.hintsUsed || 0);
    r.hintBtn.classList.toggle('is-disabled', !state.rules.allowHints);
    r.hintBtn.setAttribute('aria-label', `${t('game.hint')} (${state.hintsUsed || 0})`);
    r.hintBtn.title = state.rules.allowHints ? `${t('game.hint')} · ${hintsLeft}` : t('game.hintDisabled');

    const pu = state.powerups || {};
    const available = Object.values(pu).filter((p) => p.allowed && p.uses > 0).length;
    r.powerBtn.querySelector('.hud__action-badge').textContent = String(available);
    r.powerBtn.classList.toggle('is-disabled', !state.rules.allowPowerups || available === 0);

    r.pauseBtn.querySelector('.hud__pause-icon').textContent = state.status === 'paused' ? '▶' : '⏸';
    r.pauseBtn.title = state.status === 'paused' ? t('common.resume') : t('common.pause');

    r.startEl.textContent = state.start || '—';
    r.startEl.title = state.start || '';
    r.currentEl.textContent = state.current || '—';
    r.targetEl.textContent = state.target || '—';
    r.targetEl.title = state.target || '';

    // badges
    r.badges.innerHTML = '';
    const cfg = difficultyConfig(state.difficulty);
    r.badges.appendChild(el('span', { class: 'badge badge--difficulty', style: { '--badge-accent': cfg.accent } }, [
      el('span', { text: cfg.emoji, 'aria-hidden': 'true' }),
      el('span', { text: cfg.label }),
    ]));
    r.badges.appendChild(el('span', { class: 'badge badge--mode', text: modeLabel(state.mode) }));
    if (state.lang) r.badges.appendChild(el('span', { class: 'badge', text: state.lang.toUpperCase() }));
    for (const mod of state.modifiers || []) {
      r.badges.appendChild(el('span', { class: 'badge badge--modifier', title: mod.desc, text: `${mod.icon} ${mod.label}` }));
    }

    // active effects
    r.effects.innerHTML = '';
    const now = Date.now();
    if (state.timer.frozen) r.effects.appendChild(el('span', { class: 'effect-chip effect-chip--freeze', text: `🧊 ${t('game.frozen')}` }));
    for (const p of powerupsForMode(state.mode)) {
      if (isPowerupActive(pu, p.id, now)) {
        r.effects.appendChild(el('span', { class: 'effect-chip', text: `${p.icon} ${t(p.labelKey)}` }));
      }
    }
    if (state.hintTypesUsed && state.hintTypesUsed.length) {
      r.effects.appendChild(el('span', { class: 'effect-chip effect-chip--hint', text: `💡 ${state.hintsUsed}` }));
    }
  }

  /** Cheap per-tick update: only the clock and the progress bar. */
  updateClock(timerState) {
    const r = this.refs;
    const limitMs = timerState.limitMs || 0;
    const countdown = Boolean(limitMs);
    const display = countdown ? Math.max(0, limitMs - timerState.elapsedMs) : timerState.elapsedMs;
    const text = formatTime(display);
    if (text !== this._lastTimerText) {
      r.timerValue.textContent = text;
      this._lastTimerText = text;
    }
    const ratio = limitMs ? clamp(timerState.elapsedMs / limitMs, 0, 1) : clamp(timerState.elapsedMs / 60000, 0, 1);
    r.timerFill.style.width = `${ratio * 100}%`;
    const low = countdown && display <= 30000;
    const critical = countdown && display <= 10000;
    if (this._lastWarning !== 'x') {
      r.timerValue.classList.toggle('is-low', low);
      r.timerValue.classList.toggle('is-critical', critical);
      r.timerFill.classList.toggle('is-low', ratio > 0.7);
      r.timerFill.classList.toggle('is-critical', ratio > 0.9);
    }
  }

  showWarning(message, { duration = 2600, tone = 'warn' } = {}) {
    const r = this.refs;
    r.warning.textContent = message;
    r.warning.className = `hud__warning is-visible hud__warning--${tone}`;
    clearTimeout(this._warnTimer);
    this._warnTimer = setTimeout(() => { r.warning.className = 'hud__warning is-hidden'; }, duration);
  }

  setFrozen(frozen) {
    this.el.classList.toggle('is-frozen', Boolean(frozen));
  }
}

export { HINT_TYPES };
