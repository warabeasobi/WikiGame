/* ui/notifications.js — toasts, achievement pop-ups and modal dialogs. */

import { el, uid } from '../core/util.js';
import { t } from '../core/i18n.js';
import { playSound } from './sound.js';

let toastHost = null;
let modalHost = null;
let achievementHost = null;

function hosts() {
  if (!toastHost) {
    toastHost = document.getElementById('toasts') || el('div', { id: 'toasts', class: 'toast-host', 'aria-live': 'polite', 'aria-atomic': 'false' });
    if (!toastHost.isConnected) document.body.appendChild(toastHost);
  }
  if (!modalHost) {
    modalHost = document.getElementById('modals') || el('div', { id: 'modals', class: 'modal-host' });
    if (!modalHost.isConnected) document.body.appendChild(modalHost);
  }
  if (!achievementHost) {
    achievementHost = document.getElementById('achievements-pop') || el('div', { id: 'achievements-pop', class: 'ach-pop-host', 'aria-live': 'polite' });
    if (!achievementHost.isConnected) document.body.appendChild(achievementHost);
  }
  return { toastHost, modalHost, achievementHost };
}

/**
 * @param {string} message
 * @param {object} [opts] { type: 'info'|'success'|'warn'|'error', duration, icon, action: {label, onClick} }
 */
export function toast(message, { type = 'info', duration = 3200, icon = null, action = null } = {}) {
  const { toastHost: host } = hosts();
  const node = el('div', { class: `toast toast--${type}`, role: 'status' }, [
    icon ? el('span', { class: 'toast__icon', text: icon, 'aria-hidden': 'true' }) : null,
    el('span', { class: 'toast__msg', text: message }),
    action ? el('button', { class: 'toast__action', type: 'button', text: action.label, onClick: () => { action.onClick(); dismiss(); } }) : null,
  ]);
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  let timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 220);
  }
  node.addEventListener('click', (e) => { if (e.target === node) dismiss(); });
  return dismiss;
}

export const notify = {
  info: (m, o) => toast(m, { ...o, type: 'info' }),
  success: (m, o) => toast(m, { ...o, type: 'success', icon: o && o.icon ? o.icon : '✓' }),
  warn: (m, o) => toast(m, { ...o, type: 'warn', icon: o && o.icon ? o.icon : '⚠' }),
  error: (m, o) => toast(m, { ...o, type: 'error', icon: o && o.icon ? o.icon : '✕', duration: (o && o.duration) || 5200 }),
};

/** Achievement banner — slides in, never blocks gameplay. */
export function achievementPopup({ name, desc, icon = '🏆', xp = 0 }) {
  const { achievementHost: host } = hosts();
  const node = el('div', { class: 'ach-pop', role: 'status' }, [
    el('span', { class: 'ach-pop__icon', text: icon, 'aria-hidden': 'true' }),
    el('div', { class: 'ach-pop__body' }, [
      el('span', { class: 'ach-pop__label', text: t('ach.newAchievement') }),
      el('strong', { class: 'ach-pop__name', text: name }),
      desc ? el('span', { class: 'ach-pop__desc', text: desc }) : null,
    ]),
    xp ? el('span', { class: 'ach-pop__xp', text: `+${xp} XP` }) : null,
  ]);
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  playSound('achievement');
  setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 400);
  }, 4200);
  return node;
}

/**
 * Promise-based modal.
 * @param {object} opts
 * @param {string} opts.title
 * @param {Node|string} opts.body
 * @param {Array<{id,label,variant,value}>} [opts.actions]
 * @param {boolean} [opts.dismissible]
 * @returns {Promise<any>} the chosen action id (or value for inputs)
 */
export function modal({ title, body, actions = [{ id: 'ok', label: t('common.done'), variant: 'primary' }], dismissible = true, className = '', onMount = null }) {
  const { modalHost: host } = hosts();
  return new Promise((resolve) => {
    const content = el('div', { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'dialog' });
    const head = el('div', { class: 'modal__head' }, [
      el('h2', { class: 'modal__title', text: title || '' }),
      dismissible ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), html: '✕', onClick: () => close(null) }) : null,
    ]);
    const bodyNode = el('div', { class: 'modal__body' });
    if (body instanceof Node) bodyNode.appendChild(body);
    else bodyNode.innerHTML = String(body || '');
    const foot = el('div', { class: 'modal__foot' }, actions.map((a) => el('button', {
      class: `btn ${a.variant ? `btn--${a.variant}` : ''}`,
      type: 'button',
      text: a.label,
      onClick: () => close(a.value !== undefined ? a.value : a.id),
    })));
    content.append(head, bodyNode, foot);
    const backdrop = el('div', { class: 'modal-backdrop' }, [content]);
    host.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('is-in'));

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) close(null);
      if (e.key === 'Tab') {
        const focusable = content.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && dismissible) close(null); });

    const previousFocus = document.activeElement;
    const focusTarget = content.querySelector('input, button.btn--primary, button') || content;
    setTimeout(() => focusTarget && focusTarget.focus && focusTarget.focus(), 40);
    if (onMount) onMount(content, close);

    function close(value) {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('is-in');
      setTimeout(() => backdrop.remove(), 200);
      if (previousFocus && previousFocus.focus) { try { previousFocus.focus(); } catch { /* noop */ } }
      resolve(value);
    }
  });
}

export function confirmDialog(message, { title = '', confirmLabel = t('common.confirm'), cancelLabel = t('common.cancel'), danger = false } = {}) {
  return modal({
    title: title || t('common.confirm'),
    body: el('p', { class: 'modal__text', text: message }),
    actions: [
      { id: 'cancel', label: cancelLabel, variant: 'ghost' },
      { id: 'confirm', label: confirmLabel, variant: danger ? 'danger' : 'primary' },
    ],
  }).then((v) => v === 'confirm');
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = t('common.save'), type = 'text', maxLength = 60 } = {}) {
  const input = el('input', { class: 'input', type, value, placeholder, maxlength: maxLength, id: uid('input') });
  const wrap = el('div', { class: 'field' }, [el('label', { class: 'field__label', for: input.id, text: label || '' }), input]);
  return modal({
    title,
    body: wrap,
    actions: [
      { id: null, label: t('common.cancel'), variant: 'ghost' },
      { id: 'ok', label: confirmLabel, variant: 'primary' },
    ],
    onMount: (content, close) => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close('ok'); });
      input.focus();
      input.select();
    },
  }).then((v) => (v === 'ok' ? input.value : null));
}

export function closeAllModals() {
  const { modalHost: host } = hosts();
  host.innerHTML = '';
}
