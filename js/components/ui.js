import { h, clear } from '../utils/dom.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- toast
let toastHost;
export function toast(message, { action, onAction, error = false, duration = 3600 } = {}) {
  if (!toastHost) { toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const el = h('div', { class: 'toast' + (error ? ' error' : '') }, h('span', null, message),
    action ? h('button', { class: 'toast-action', onclick: () => { onAction?.(); dismiss(); } }, action) : null);
  toastHost.append(el);
  let gone = false;
  const dismiss = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  setTimeout(dismiss, duration);
  return dismiss;
}

// ---------------------------------------------------------- bottom sheet
const FOCUSABLE = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
export function openSheet(build, { title = '', label = title, tall = false } = {}) {
  const returnTo = document.activeElement;
  const overlay = h('div', { class: 'overlay' });
  const body = h('div');
  const sheet = h('div', { class: 'bottom-sheet' + (tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': label || 'Dialog' }, title ? h('h2', null, title) : null, body);
  let closed = false;
  const api = {
    el: sheet, body,
    close(result) {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('closing'); sheet.classList.add('closing');
      setTimeout(() => { overlay.remove(); sheet.remove(); returnTo?.focus?.(); }, 230);
      api.onClose?.(result);
    },
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { api.close(); return; }
    if (e.key === 'Tab') {
      const f = [...sheet.querySelectorAll(FOCUSABLE)].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  overlay.addEventListener('click', () => api.close());
  // Swipe the grabber area down to dismiss (mobile).
  let drag = null;
  sheet.addEventListener('pointerdown', (e) => {
    const r = sheet.getBoundingClientRect();
    if (e.clientY - r.top > 36 || window.innerWidth >= 900) return;
    drag = { y: e.clientY }; sheet.setPointerCapture(e.pointerId); sheet.style.animation = 'none'; sheet.style.transition = 'none';
  });
  sheet.addEventListener('pointermove', (e) => { if (!drag) return; const dy = Math.max(0, e.clientY - drag.y); drag.dy = dy; sheet.style.transform = `translateY(${dy}px)`; });
  const endDrag = () => { if (!drag) return; const dy = drag.dy || 0; drag = null; sheet.style.transition = 'transform .25s var(--ease)'; if (dy > 90) api.close(); else sheet.style.transform = ''; };
  sheet.addEventListener('pointerup', endDrag); sheet.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', onKey);
  document.body.append(overlay, sheet);
  build(body, api);
  requestAnimationFrame(() => (sheet.querySelector('[autofocus]') || sheet.querySelector(FOCUSABLE))?.focus({ preventScroll: true }));
  return api;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const sheet = openSheet((body, api) => {
      body.append(
        h('p', { class: 'muted', style: { marginBottom: '20px', lineHeight: 1.5 } }, message),
        h('div', { class: 'stack' },
          h('button', { class: 'btn btn-block ' + (danger ? 'btn-danger' : 'btn-ink'), onclick: () => { resolve(true); api.close(); } }, confirmLabel),
          h('button', { class: 'btn btn-block btn-soft', onclick: () => api.close() }, cancelLabel)));
    }, { title });
    sheet.onClose = () => resolve(false);
  });
}

/** Action list sheet: items = [{label, icon, danger, onSelect}] */
export function actionSheet(title, items) {
  openSheet((body, api) => {
    body.append(h('div', { class: 'list' }, items.map(it =>
      h('button', { class: 'list-row', style: it.danger ? { color: 'var(--danger)' } : null, onclick: () => { api.close(); it.onSelect?.(); } },
        h('span', { class: 'ico' }, icon(it.icon || 'chevron-right', 20)), h('span', { class: 'grow t' }, it.label)))));
  }, { title });
}

// --------------------------------------------------------- misc builders
export function field(label, input, { error = '', id } = {}) {
  const fid = id || 'f' + Math.random().toString(36).slice(2, 8);
  input.id = fid;
  return h('div', { class: 'field' }, h('label', { for: fid }, label), input, h('div', { class: 'field-error', 'aria-live': 'polite' }, error));
}
export function emptyState(iconName, title, text, action) {
  return h('div', { class: 'empty' }, icon(iconName, 40), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}
export function errorState(text, onRetry) {
  return h('div', { class: 'empty' }, icon('warn', 40), h('h3', null, 'Something went wrong'), h('p', null, text),
    onRetry ? h('button', { class: 'btn btn-soft btn-sm', onclick: onRetry }, 'Try again') : null);
}
export function skeletonList(n = 3) {
  return h('div', { class: 'stack' }, Array.from({ length: n }, () => h('div', { class: 'skeleton', style: { height: '60px', borderRadius: '16px' } })));
}
export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'group' });
  const render = (v) => {
    clear(wrap);
    options.forEach(o => wrap.append(h('button', { type: 'button', 'aria-pressed': String(o.value === v), onclick: () => { onChange(o.value); render(o.value); } }, o.label)));
  };
  render(value); return wrap;
}
export function haptic(ms = 12) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ } }

/** Wrap an async click handler so double taps can't submit twice. */
export function once(btn, fn) {
  btn.addEventListener('click', async (e) => {
    if (btn.getAttribute('aria-busy') === 'true') return;
    btn.setAttribute('aria-busy', 'true');
    try { await fn(e); } finally { btn.removeAttribute('aria-busy'); }
  });
  return btn;
}
