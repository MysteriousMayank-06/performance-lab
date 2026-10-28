import { h } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate } from '../router.js';
import { toast, openSheet, confirmDialog, field, segmented } from '../components/ui.js';
import { auth } from '../auth.js';
import { Local } from '../db.js';
import { parseNum } from '../calculations/units.js';
import { GOALS, EXPERIENCE, EQUIPMENT, WEEKDAYS } from '../data/vocab.js';
import { titleCase } from '../utils/format.js';
import { exportAllJSON } from '../services/export.js';
import { onSync } from '../services/sync.js';
import { uuid } from '../utils/id.js';
import { applyTheme } from '../app.js';

export async function render(params, scope) {
  const p = store.profile, s = p.settings;
  const goalLabel = (v) => GOALS.find(g => g.value === v)?.label || 'Not set';
  const row = (ic, title, sub, onclick, end) => h('button', { class: 'list-row', onclick }, h('span', { class: 'ico' }, icon(ic, 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null), end ?? icon('chevron-right', 18));
  const toggleRow = (ic, title, sub, on, onChange) => { const t = h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(!!on), 'aria-label': title, onclick: () => { const v = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', String(v)); onChange(v, t); } }); return h('div', { class: 'list-row' }, h('span', { class: 'ico' }, icon(ic, 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null), t); };

  const syncDot = h('span', { class: 'sync-dot' });
  scope.add(onSync((st) => { syncDot.className = 'sync-dot ' + st.state; }));

  const hero = h('div', { class: 'hero hero-compact' },
    h('div', { class: 'between-row' }, h('h1', { class: 'topbar-title big-title' }, 'Profile'), h('span')),
    h('div', { class: 'profile-head' }, h('div', { class: 'avatar glass big' }, (p.display_name || 'P')[0].toUpperCase()), h('div', null, h('div', { class: 'name' }, p.display_name || 'Athlete'), h('div', { class: 'email' }, store.user.email))),
    h('div', { class: 'pill-note' }, icon('lock', 14), 'Private — only you can see your data'));

  const sheet = h('div', { class: 'sheet' },
    group('Training', [
      row('user', 'Personal details', [p.display_name, p.height_cm ? `${p.height_cm} cm` : null, p.birth_year ? `b. ${p.birth_year}` : null].filter(Boolean).join(' · ') || 'Name, height, birth year', personalSheet),
      row('target', 'Experience & goal', `${EXPERIENCE.find(e => e.value === p.training_experience)?.label || 'Experience not set'} · ${goalLabel(p.primary_goal)}`, goalSheet),
      row('dumbbell', 'Equipment', s.equipment?.length ? `${s.equipment.length} selected` : 'Used to suggest alternatives', equipSheet),
      row('timer', 'Default rest timer', `${p.default_rest_seconds} seconds`, restSheet),
      row('flag', 'Goals', s.goals?.filter(g => !g.done).length ? `${s.goals.filter(g => !g.done).length} active` : 'Add personal milestones', goalsSheet),
      row('calendar', 'Week starts on', WEEKDAYS[p.week_starts_on], weekSheet)]),
    group('Preferences', [
      h('div', { class: 'list-row' }, h('span', { class: 'ico' }, icon('scale', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Units'), h('div', { class: 's' }, 'Stored in kg/m, converted for display')),
        segmented([{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }], p.preferred_weight_unit, (v) => store.updateProfile({ preferred_weight_unit: v, preferred_distance_unit: v === 'lb' ? 'mi' : 'km' }))),
      toggleRow(p.preferred_theme === 'light' ? 'sun' : 'moon', 'Light theme', 'Dark is the default', p.preferred_theme === 'light', async (v) => { await store.updateProfile({ preferred_theme: v ? 'light' : 'dark' }); applyTheme(v ? 'light' : 'dark'); }),
      toggleRow('bolt', 'Rest-timer sound', null, s.sound !== false, (v) => store.updateProfile({ settings: { sound: v } })),
      toggleRow('bell', 'Vibration', 'Where your device supports it', s.vibrate !== false, (v) => store.updateProfile({ settings: { vibrate: v } })),
      toggleRow('bell', 'Workout reminders', 'Shows only while the app is open or installed', !!s.reminders?.enabled, async (v, t) => {
        if (v && 'Notification' in window && Notification.permission !== 'granted') { const r = await Notification.requestPermission(); if (r !== 'granted') { t.setAttribute('aria-checked', 'false'); toast('Notifications are blocked in your browser settings.'); return; } }
        if (v && !('Notification' in window)) { t.setAttribute('aria-checked', 'false'); toast('This browser does not support notifications.'); return; }
        await store.updateProfile({ settings: { reminders: { ...(s.reminders || {}), enabled: v, time: s.reminders?.time || '18:00' } } });
      }),
      row('clock', 'Reminder time', s.reminders?.time || '18:00', reminderSheet)]),
    group('Tools & data', [
      row('scale', 'Plate calculator', null, () => navigate('/tools/plates')),
      row('cloud', 'Data & sync', null, () => navigate('/sync'), syncDot),
      row('download', 'Export all my data', 'Full JSON backup', () => { exportAllJSON(); toast('Backup downloaded'); })]),
    group('Account', [
      row('shield', 'Privacy', 'Private by default · no ads · no trackers', privacySheet),
      row('logout', 'Sign out', null, async () => { if (store.outboxKeys.size && !(await confirmDialog({ title: 'Unsynced changes', message: `${store.outboxKeys.size} change(s) haven’t synced yet. They stay on this device and sync next time you sign in here — or sign out anyway?`, confirmLabel: 'Sign out' }))) return; await auth.signOut(); }),
      h('button', { class: 'list-row', style: { color: 'var(--danger)' }, onclick: deleteAccount }, h('span', { class: 'ico' }, icon('trash', 22)), h('span', { class: 'grow t' }, 'Delete account'))]),
    h('p', { class: 'faint', style: { textAlign: 'center', fontSize: 'var(--fs-xs)' } }, 'Performance Lab · free & private'));

  function group(title, rows) { return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, title)), h('div', { class: 'list' }, rows)); }
  const reload = () => navigate('/profile', { replace: true });

  function personalSheet() {
    openSheet((b, api) => {
      const n = h('input', { class: 'input', value: p.display_name || '', maxlength: 40 });
      const ht = h('input', { class: 'input', inputmode: 'decimal', value: p.height_cm || '', placeholder: 'cm' });
      const by = h('input', { class: 'input', inputmode: 'numeric', value: p.birth_year || '', placeholder: 'e.g. 2001', maxlength: 4 });
      b.append(h('div', { class: 'stack' }, field('Name', n), h('div', { class: 'grid-2' }, field('Height (cm)', ht), field('Birth year', by)), h('button', { class: 'btn btn-ink btn-block', onclick: async () => {
        const hv = parseNum(ht.value), bv = parseNum(by.value);
        await store.updateProfile({ display_name: n.value.trim(), height_cm: hv && hv > 80 && hv < 260 ? hv : null, birth_year: bv && bv > 1900 && bv < new Date().getFullYear() - 8 ? Math.round(bv) : null }); api.close(); reload();
      } }, 'Save')));
    }, { title: 'Personal details' });
  }
  function goalSheet() {
    openSheet((b, api) => {
      let exp = p.training_experience, goal = p.primary_goal;
      const mk = (items, get, set) => { const w = h('div', { class: 'choice-grid c2' }); const d = () => { w.replaceChildren(...items.map(it => h('button', { type: 'button', class: 'choice' + (get() === it.value ? ' is-on' : ''), onclick: () => { set(it.value); d(); } }, h('span', { class: 't' }, it.label), it.sub ? h('span', { class: 's' }, it.sub) : null))); }; d(); return w; };
      b.append(h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', null, 'Experience'), mk(EXPERIENCE, () => exp, v => exp = v)), h('div', { class: 'field' }, h('label', null, 'Main goal'), mk(GOALS, () => goal, v => goal = v)), h('button', { class: 'btn btn-ink btn-block', onclick: async () => { await store.updateProfile({ training_experience: exp, primary_goal: goal }); api.close(); reload(); } }, 'Save')));
    }, { title: 'Experience & goal' });
  }
  function equipSheet() {
    openSheet((b, api) => {
      const sel = new Set(s.equipment || []);
      b.append(h('div', { class: 'stack' }, h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, 'Used only to rank exercise alternatives. Leave empty to see everything.'), h('div', { class: 'chip-row wrap' }, EQUIPMENT.map(e => { const c = h('button', { type: 'button', class: 'chip' + (sel.has(e) ? ' is-on' : ''), 'aria-pressed': String(sel.has(e)), onclick: () => { sel.has(e) ? sel.delete(e) : sel.add(e); c.classList.toggle('is-on'); c.setAttribute('aria-pressed', String(sel.has(e))); } }, titleCase(e)); return c; })),
        h('button', { class: 'btn btn-ink btn-block', onclick: async () => { await store.updateProfile({ settings: { equipment: [...sel] } }); api.close(); reload(); } }, 'Save')));
    }, { title: 'Equipment' });
  }
  function restSheet() {
    openSheet((b, api) => { const r = h('input', { class: 'input', inputmode: 'numeric', value: p.default_rest_seconds }); b.append(h('div', { class: 'stack' }, field('Seconds between sets', r), h('div', { class: 'chip-row' }, [60, 90, 120, 180].map(v => h('button', { class: 'chip', onclick: () => { r.value = v; } }, `${v}s`))), h('button', { class: 'btn btn-ink btn-block', onclick: async () => { const v = parseNum(r.value); if (!v || v < 5 || v > 900) { toast('Enter 5–900 seconds', { error: true }); return; } await store.updateProfile({ default_rest_seconds: Math.round(v) }); api.close(); reload(); } }, 'Save'))); }, { title: 'Default rest' });
  }
  function weekSheet() {
    openSheet((b, api) => b.append(h('div', { class: 'list' }, [1, 0, 6].map(d => h('button', { class: 'list-row', onclick: async () => { await store.updateProfile({ week_starts_on: d }); api.close(); reload(); } }, h('span', { class: 'grow t' }, ['Sunday', 'Monday', '', '', '', '', 'Saturday'][d]), p.week_starts_on === d ? icon('check', 20) : null)))), { title: 'Week starts on' });
  }
  function reminderSheet() {
    openSheet((b, api) => { const t = h('input', { class: 'input', type: 'time', value: s.reminders?.time || '18:00' }); b.append(h('div', { class: 'stack' }, field('Remind me at', t), h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)', lineHeight: 1.5 } }, 'Reminders only appear on days with a planned workout you haven’t done, and only while the app is open or installed — browsers can’t guarantee background alerts.'), h('button', { class: 'btn btn-ink btn-block', onclick: async () => { await store.updateProfile({ settings: { reminders: { ...(s.reminders || {}), time: t.value || '18:00' } } }); api.close(); reload(); } }, 'Save'))); }, { title: 'Reminder time' });
  }
  function goalsSheet() {
    openSheet((b, api) => {
      const goals = [...(s.goals || [])];
      const list = h('div', { class: 'list' });
      const draw = () => { list.replaceChildren(...goals.map(g => h('div', { class: 'list-row' }, h('button', { class: 'check-btn' + (g.done ? ' on' : ''), 'aria-pressed': String(!!g.done), 'aria-label': `Mark “${g.title}” ${g.done ? 'not done' : 'done'}`, onclick: () => { g.done = !g.done; g.done_at = g.done ? new Date().toISOString() : null; draw(); } }, icon('check', 20)), h('span', { class: 'grow t', style: g.done ? { textDecoration: 'line-through', opacity: .6 } : null }, g.title), h('button', { class: 'icon-btn sm', 'aria-label': 'Remove goal', onclick: () => { goals.splice(goals.indexOf(g), 1); draw(); } }, icon('x', 18))))); if (!goals.length) list.append(h('p', { class: 'muted' }, 'No goals yet. Try “First pull-up”, “Bench 80 kg” or “12 workouts this month”.')); };
      const i = h('input', { class: 'input', placeholder: 'New goal', maxlength: 80 });
      b.append(h('div', { class: 'stack' }, list, h('div', { class: 'row' }, i, h('button', { class: 'btn btn-soft', onclick: () => { if (i.value.trim()) { goals.push({ id: uuid(), title: i.value.trim(), done: false }); i.value = ''; draw(); } } }, 'Add')), h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'You tick goals off yourself — nothing is awarded automatically.'), h('button', { class: 'btn btn-ink btn-block', onclick: async () => { await store.updateProfile({ settings: { goals } }); api.close(); reload(); } }, 'Save')));
      draw();
    }, { title: 'Goals' });
  }
  function privacySheet() {
    openSheet((b) => b.append(h('div', { class: 'stack', style: { lineHeight: 1.55 } }, h('p', null, 'Your workouts, measurements and notes are stored in your own account and protected by database row-level security — other users cannot read or enumerate them.'), h('p', null, 'There is no public profile, no sharing by default, no advertising and no analytics trackers.'), h('p', null, 'Data is also kept on this device (IndexedDB) so the app works offline. Signing out keeps that local copy until you delete the account or clear site data.'))), { title: 'Privacy' });
  }
  async function deleteAccount() {
    if (!(await confirmDialog({ title: 'Delete your account?', message: 'This permanently deletes your account and ALL workouts, routines and measurements. Export a backup first if you want to keep anything. This cannot be undone.', confirmLabel: 'Delete everything', danger: true }))) return;
    if (!navigator.onLine) { toast('You need to be online to delete your account.', { error: true }); return; }
    try { await auth.deleteAccount(); } catch (e) { console.warn(e); toast('Could not delete the account. Nothing was removed — try again.', { error: true }); return; }
    await Local.destroy(store.user.id); localStorage.clear(); toast('Account deleted'); setTimeout(() => location.reload(), 800);
  }
  return h('div', { class: 'view page-inner' }, hero, sheet);
}
