import { h, clear, debounce } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate } from '../router.js';
import { toast, openSheet, actionSheet, confirmDialog, field, segmented } from '../components/ui.js';
import { startRoutine } from '../services/actions.js';
import { dayStatus } from '../calculations/consistency.js';
import { fmtDate, startOfWeek, startOfDay, localISODate, relativeDay } from '../utils/format.js';
import { WEEKDAYS, WEEKDAYS_LONG } from '../data/vocab.js';
import { sessionStats } from '../calculations/lifting.js';

let tab = 'routines', calMode = 'week', monthOffset = 0, folder = null, showArchived = false;

export async function render(params, scope) {
  const root = h('div', { class: 'view page-inner' });
  const body = h('div', { class: 'sheet' });
  const p = () => store.profile;

  const hero = h('div', { class: 'hero hero-compact' },
    h('div', { class: 'between-row' }, h('h1', { class: 'topbar-title big-title' }, 'Plan'),
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Exercise library', onclick: () => navigate('/exercises') }, icon('search', 22)),
        h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'New routine', onclick: () => navigate('/routine/new') }, icon('plus', 22)))),
    h('div', { class: 'seg-glass', role: 'tablist' }, ['routines', 'calendar'].map(t => h('button', { role: 'tab', 'aria-selected': String(tab === t), onclick: () => { tab = t; draw(); } }, t === 'routines' ? 'Routines' : 'Calendar'))));
  root.append(hero, body);

  function draw() {
    hero.querySelectorAll('[role=tab]').forEach((b, i) => b.setAttribute('aria-selected', String(tab === ['routines', 'calendar'][i])));
    clear(body); body.classList.remove('view'); void body.offsetWidth; body.classList.add('view');
    tab === 'routines' ? drawRoutines() : drawCalendar();
  }
  scope.add(store.on((w) => { if (w === 'routines' || w === 'profile') draw(); }));

  // ------------------------------------------------------------------ routines
  function drawRoutines() {
    const all = store.routines;
    const folders = [...new Set(all.map(r => r.folder_name).filter(Boolean))];
    let q = '';
    const list = h('div', { class: 'list' });
    const paint = () => {
      clear(list);
      const rs = all.filter(r => (showArchived ? !!r.archived_at : !r.archived_at) && (!folder || r.folder_name === folder) && (!q || r.name.toLowerCase().includes(q)));
      rs.forEach(r => list.append(h('div', { class: 'list-row' },
        h('button', { class: 'row grow', style: { gap: 'var(--sp-3)', textAlign: 'left', minWidth: 0 }, onclick: () => navigate('/routine/' + r.id), 'aria-label': `Open ${r.name}` },
          h('span', { class: 'ico' }, icon('dumbbell', 22)),
          h('span', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 't' }, r.name), h('div', { class: 's' }, `${r.is_example ? 'Example · ' : ''}${r.exercises.length} exercises${r.folder_name && !r.is_example ? ' · ' + r.folder_name : ''}${lastUsed(r) ? ' · ' + lastUsed(r) : ''}`))),
        r.archived_at ? null : h('button', { class: 'icon-btn', 'aria-label': `Start ${r.name}`, onclick: () => startRoutine(r) }, icon('play', 20)),
        h('button', { class: 'icon-btn', 'aria-label': `More for ${r.name}`, onclick: () => routineMenu(r) }, icon('more', 20)))));
      if (!rs.length) list.append(all.length ? h('div', { class: 'empty' }, icon('search', 36), h('h3', null, showArchived ? 'No archived routines' : 'No routines match'), h('p', null, 'Try another folder or search.')) : h('div', { class: 'empty' }, icon('copy', 40), h('h3', null, 'No routines yet'), h('p', null, 'Create a routine, or add editable examples to start from.'),
        h('div', { class: 'stack', style: { width: '100%' } }, h('button', { class: 'btn btn-ink', onclick: () => navigate('/routine/new') }, 'Create routine'), h('button', { class: 'btn btn-soft', onclick: async () => { await store.addExampleRoutines(); toast('Example routines added'); } }, 'Add example routines'))));
    };
    const search = h('input', { type: 'search', placeholder: 'Search routines', 'aria-label': 'Search routines' });
    search.addEventListener('input', debounce(() => { q = search.value.trim().toLowerCase(); paint(); }, 120));
    body.append(h('div', { class: 'search-bar' }, icon('search', 20), search),
      folders.length || all.some(r => r.archived_at) ? h('div', { class: 'chip-row' },
        h('button', { class: 'chip' + (!folder && !showArchived ? ' is-on' : ''), onclick: () => { folder = null; showArchived = false; draw(); } }, 'All'),
        ...folders.map(f => h('button', { class: 'chip' + (folder === f ? ' is-on' : ''), onclick: () => { folder = folder === f ? null : f; showArchived = false; draw(); } }, icon('folder', 14), f)),
        all.some(r => r.archived_at) ? h('button', { class: 'chip' + (showArchived ? ' is-on' : ''), onclick: () => { showArchived = !showArchived; draw(); } }, 'Archived') : null) : null,
      list, h('button', { class: 'btn btn-soft btn-block', onclick: () => navigate('/routine/new') }, icon('plus', 18), 'New routine'));
    paint();
  }
  function lastUsed(r) { const s = store.completed().find(x => x.routine_id === r.id); return s ? 'last ' + relativeDay(s.started_at).split(',')[0].toLowerCase() : ''; }

  function routineMenu(r) {
    actionSheet(r.name, [
      !r.archived_at && { label: 'Start workout', icon: 'play', onSelect: () => startRoutine(r) },
      { label: 'Edit routine', icon: 'edit', onSelect: () => navigate('/routine/' + r.id) },
      { label: 'Duplicate', icon: 'copy', onSelect: async () => { await store.duplicateRoutine(r.id); toast('Routine duplicated'); } },
      { label: 'Rename', icon: 'edit', onSelect: () => promptSheet('Rename routine', r.name, async (v) => { await store.saveRoutine({ ...r, name: v, is_example: false }); }) },
      { label: r.folder_name ? `Folder: ${r.folder_name}` : 'Add to folder', icon: 'folder', onSelect: () => promptSheet('Folder name (blank to remove)', r.folder_name || '', async (v) => { await store.saveRoutine({ ...r, folder_name: v || null }); }, true) },
      { label: 'History', icon: 'clock', onSelect: () => routineHistory(r) },
      { label: r.archived_at ? 'Unarchive' : 'Archive', icon: 'download', onSelect: async () => { await store.saveRoutine({ ...r, archived_at: r.archived_at ? null : new Date().toISOString() }); toast(r.archived_at ? 'Restored' : 'Archived', { action: 'Undo', onAction: () => store.saveRoutine({ ...r }) }); } },
      { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: `Delete “${r.name}”?`, message: 'Your past workouts stay in your history — only the template is removed.', confirmLabel: 'Delete', danger: true })) { await store.deleteRoutine(r.id); toast('Routine deleted'); } } },
    ].filter(Boolean));
  }
  function promptSheet(title, value, onSave, allowEmpty = false) {
    openSheet((b, api) => { const i = h('input', { class: 'input', value, maxlength: 60, autofocus: true }); b.append(h('div', { class: 'stack' }, i, h('button', { class: 'btn btn-ink btn-block', onclick: async () => { const v = i.value.trim(); if (!v && !allowEmpty) return; await onSave(v); api.close(); } }, 'Save'))); }, { title });
  }
  function routineHistory(r) {
    const ss = store.completed().filter(s => s.routine_id === r.id);
    openSheet((b, api) => b.append(ss.length ? h('div', { class: 'list' }, ss.slice(0, 30).map(s => h('button', { class: 'list-row', onclick: () => { api.close(); navigate('/session/' + s.id); } }, h('span', { class: 'grow' }, h('div', { class: 't' }, fmtDate(s.started_at, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })), h('div', { class: 's' }, `${sessionStats(s).sets} sets`)), icon('chevron-right', 18)))) : h('p', { class: 'muted' }, 'You have not completed this routine yet.')), { title: `${r.name} history` });
  }

  // ------------------------------------------------------------------ calendar
  const sinceDate = () => p().settings.schedule_since ? new Date(p().settings.schedule_since) : null;
  const status = (d) => dayStatus(d, p().weekly_schedule, store.sessions, new Date(), sinceDate());
  async function setPlan(weekday, val) {
    const next = { ...(p().weekly_schedule || {}) };
    if (val == null) delete next[weekday]; else next[weekday] = val;
    await store.updateProfile({ weekly_schedule: next, settings: { schedule_since: p().settings.schedule_since || startOfDay(new Date()).toISOString() } });
  }
  function dayPlanSheet(date) {
    const wd = date.getDay(), cur = p().weekly_schedule?.[wd];
    const done = store.completed().filter(s => localISODate(new Date(s.started_at)) === localISODate(date));
    openSheet((b, api) => {
      const choose = (val) => async () => { await setPlan(wd, val); api.close(); toast(val == null ? `${WEEKDAYS_LONG[wd]}s cleared` : val === 'rest' ? `${WEEKDAYS_LONG[wd]}s are rest days` : 'Plan updated'); };
      b.append(h('div', { class: 'stack' },
        done.length ? h('div', { class: 'stack' }, h('h3', null, 'Completed'), h('div', { class: 'list' }, done.map(s => h('button', { class: 'list-row', onclick: () => { api.close(); navigate('/session/' + s.id); } }, h('span', { class: 'grow t' }, s.name), icon('chevron-right', 18))))) : null,
        h('h3', null, `Every ${WEEKDAYS_LONG[wd]}`),
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, 'Your plan repeats weekly. Past days before you started planning are never counted as missed, and rest days are never missed.'),
        h('div', { class: 'list' },
          ...store.routines.filter(r => !r.archived_at).map(r => h('button', { class: 'list-row', onclick: choose(r.id) }, h('span', { class: 'ico' }, icon('dumbbell', 20)), h('span', { class: 'grow t' }, r.name), cur === r.id ? icon('check', 20) : null)),
          h('button', { class: 'list-row', onclick: choose('rest') }, h('span', { class: 'ico' }, icon('moon', 20)), h('span', { class: 'grow t' }, 'Rest day'), cur === 'rest' ? icon('check', 20) : null),
          cur ? h('button', { class: 'list-row', onclick: choose(null) }, h('span', { class: 'ico' }, icon('x', 20)), h('span', { class: 'grow t' }, 'No plan')) : null),
        !store.routines.length ? h('button', { class: 'btn btn-soft', onclick: () => { api.close(); navigate('/routine/new'); } }, 'Create a routine first') : null));
    }, { title: `${WEEKDAYS_LONG[wd]} ${date.getDate()} ${date.toLocaleDateString(undefined, { month: 'short' })}` });
  }
  const label = { done: 'Done', rest: 'Rest', missed: 'Missed', planned: 'Planned', none: '' };
  function drawCalendar() {
    const seg = segmented([{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], calMode, (v) => { calMode = v; draw(); });
    body.append(seg);
    if (calMode === 'week') {
      const start = startOfWeek(new Date(), p().week_starts_on);
      const rows = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); const st = status(d); const rt = st.plan && st.plan !== 'rest' ? store.routines.find(r => r.id === st.plan) : null;
        const today = startOfDay(d).getTime() === startOfDay(new Date()).getTime();
        return h('button', { class: `week-row ${st.state}${today ? ' today' : ''}`, onclick: () => dayPlanSheet(d), 'aria-label': `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()}: ${label[st.state] || 'no plan'}` },
          h('span', { class: 'wd' }, h('b', null, WEEKDAYS[d.getDay()]), h('span', null, String(d.getDate()))),
          h('span', { class: 'grow' }, h('div', { class: 't' }, st.state === 'done' ? st.sessions[0].name : st.plan === 'rest' ? 'Rest day' : rt ? rt.name : st.plan ? 'Routine removed' : 'Unplanned'), h('div', { class: 's' }, st.state === 'done' && rt && rt.name !== st.sessions[0].name ? `Planned: ${rt.name}` : label[st.state] || 'Tap to plan')),
          st.state === 'done' ? icon('check', 20) : icon('chevron-right', 18)); });
      body.append(h('div', { class: 'stack' }, rows));
    } else {
      const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
      const first = new Date(base), days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      const lead = (first.getDay() - p().week_starts_on + 7) % 7;
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'cal-cell out' }));
      for (let d = 1; d <= days; d++) { const date = new Date(base.getFullYear(), base.getMonth(), d); const st = status(date); const today = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
        cells.push(h('button', { class: `cal-cell ${st.state}${today ? ' today' : ''}`, onclick: () => dayPlanSheet(date), 'aria-label': `${date.toDateString()}: ${label[st.state] || 'no plan'}` }, String(d))); }
      const heads = Array.from({ length: 7 }, (_, i) => h('div', null, WEEKDAYS[(i + p().week_starts_on) % 7][0]));
      body.append(h('div', { class: 'stack' },
        h('div', { class: 'row between' }, h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => { monthOffset--; draw(); } }, icon('arrow-left', 20)), h('h3', { 'aria-live': 'polite' }, base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })), h('button', { class: 'icon-btn', 'aria-label': 'Next month', onclick: () => { monthOffset++; draw(); } }, icon('arrow-right', 20))),
        h('div', { class: 'cal-head' }, heads), h('div', { class: 'cal-grid' }, cells)));
    }
    body.append(h('div', { class: 'legend' }, [['done', 'Done'], ['planned', 'Planned'], ['missed', 'Missed'], ['rest', 'Rest']].map(([k, l]) => h('span', { class: 'lg ' + k }, h('i'), l))),
      h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)', lineHeight: 1.5 } }, 'A missed workout is just information — rest days never count against you, and nothing here sends guilt-trip reminders.'));
  }
  draw();
  return root;
}
