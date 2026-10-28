import { h } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate, back } from '../router.js';
import { toast, confirmDialog, openSheet, actionSheet } from '../components/ui.js';
import { openSetSheet } from '../components/set-sheet.js';
import { fmtSets } from '../components/perf.js';
import { sessionStats, isWorkingSet } from '../calculations/lifting.js';
import { detectPRs } from '../calculations/records.js';
import { fieldsFor } from '../calculations/fields.js';
import { kgToDisplay } from '../calculations/units.js';
import { fmtDuration, fmtNumber, fmtDateLong, fmtTimeOfDay, titleCase } from '../utils/format.js';
import { repeatSession } from '../services/actions.js';
import { SET_TYPES } from '../data/vocab.js';

export async function render({ id }) {
  const s = store.session(id);
  if (!s || s.status === 'discarded') return h('div', { class: 'view page-inner' }, h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass', 'aria-label': 'Back', onclick: () => back('/history') }, icon('arrow-left', 22))), h('div', { class: 'sheet' }, h('div', { class: 'empty' }, icon('search', 40), h('h3', null, 'Workout not found'), h('p', null, 'It may have been deleted on another device.'), h('button', { class: 'btn btn-ink', onclick: () => navigate('/history') }, 'Back to history'))));
  const unit = store.unit, dUnit = store.distUnit;
  const justDone = /[?&]done=1/.test(location.hash) && s.status === 'completed';
  const st = sessionStats(s);
  const prs = s.status === 'completed' ? detectPRs(s, store.completed().filter(x => new Date(x.started_at) < new Date(s.started_at))) : [];

  const exCards = s.exercises.filter(e => e.status !== 'skipped' || e.sets.length).map((ex) => h('div', { class: 'ex-card' },
    h('div', { class: 'ex-head' }, h('button', { class: 'ex-name grow', onclick: () => ex.exercise_id && navigate('/exercise/' + ex.exercise_id) }, h('div', null, ex.name), h('div', { class: 'ex-meta' }, (ex.primary_muscles || []).map(titleCase).join(', '))), prs.some(p => p.exerciseId === ex.exercise_id) ? h('span', { class: 'badge badge-pr' }, 'PR') : null),
    h('div', { class: 'list hist-sets' }, ex.sets.filter(x => x.is_completed).map((set, i) => {
      const f = fieldsFor(ex.type, unit, dUnit);
      return h('button', { class: 'list-row compact', 'aria-label': `Edit set ${i + 1}`, onclick: () => openSetSheet({ set, type: ex.type, index: i, onSave: async (n) => { Object.assign(set, n); await store.saveSession(s); toast('Set updated'); navigate('/session/' + id, { replace: true }); }, onDelete: async () => { ex.sets = ex.sets.filter(x => x !== set); await store.saveSession(s); toast('Set deleted'); navigate('/session/' + id, { replace: true }); } }) },
        h('span', { class: 'idx-pill' + (set.set_type === 'warmup' ? ' warm' : '') }, set.set_type === 'warmup' ? 'W' : SET_TYPES.find(t => t.value === set.set_type)?.short || String(i + 1)),
        h('span', { class: 'grow t' }, fmtSets([set], ex.type, unit, dUnit)), set.rpe ? h('span', { class: 'badge badge-warm' }, `RPE ${set.rpe}`) : null, icon('edit', 16));
    })),
    ex.notes ? h('div', { class: 'prev-line' }, ex.notes) : null));

  const stat = (k, v, sub) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v, sub ? h('small', null, sub) : null));
  const hero = h('div', { class: 'hero' },
    h('div', { class: 'between-row' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: () => back('/history') }, icon('arrow-left', 22)),
      h('div', { class: 'topbar-title' }, justDone ? 'Workout complete' : 'Workout'),
      h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'More actions', onclick: () => actionSheet(s.name, [
        { label: 'Repeat this workout', icon: 'repeat', onSelect: () => repeatSession(s) },
        { label: 'Save as routine', icon: 'copy', onSelect: async () => { const r = await store.saveRoutine({ name: s.name, description: 'Created from a completed workout.', exercises: s.exercises.filter(e => e.exercise_id && store.exercise(e.exercise_id)).map(e => ({ exercise_id: e.exercise_id, target_sets: Math.max(1, e.sets.filter(isWorkingSet).length), rest_seconds: e.rest_seconds ?? null })) }); toast('Routine saved'); navigate('/routine/' + r.id); } },
        { label: 'Edit name & notes', icon: 'edit', onSelect: () => editMeta(s) },
        { label: 'Delete workout', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Delete workout?', message: 'This permanently removes it from your history and records.', confirmLabel: 'Delete', danger: true })) { await store.deleteSession(s.id); toast('Workout deleted'); navigate('/history'); } } },
      ]) }, icon('more', 22))),
    justDone ? h('div', { class: 'done-badge' }, icon('check', 34)) : null,
    h('h1', { class: 'hero-title' }, s.name),
    h('div', { class: 'eyebrow' }, `${fmtDateLong(new Date(s.started_at))} · ${fmtTimeOfDay(s.started_at)}`),
    s.status !== 'completed' ? h('div', { class: 'pill-note' }, titleCase(s.status)) : null);

  const sheet = h('div', { class: 'sheet' },
    h('div', { class: 'grid-2' }, stat('Duration', s.duration_seconds ? fmtDuration(s.duration_seconds) : '—'), stat('Sets', String(st.sets)), stat('Reps', String(st.reps)), stat('Volume', st.volume ? fmtNumber(kgToDisplay(st.volume, unit), 0) : '—', st.volume ? unit : '')),
    prs.length ? h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Records')), ...prs.map(p => h('div', { class: 'pr-row' }, h('span', { class: 'medal' }, icon('trophy', 20)), h('span', null, h('b', null, p.name), h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' } }, `${p.label}${p.estimated ? ' (estimated)' : ''}: ${p.unit === 'kg' ? fmtNumber(kgToDisplay(p.value, unit), 1) + ' ' + unit : Math.round(p.value) + ' ' + p.unit}${p.previous != null ? ` (was ${p.unit === 'kg' ? fmtNumber(kgToDisplay(p.previous, unit), 1) : Math.round(p.previous)})` : ''}`))))) : null,
    s.difficulty || s.notes ? h('div', { class: 'stack' }, s.difficulty ? h('div', { class: 'prev-line' }, 'Felt: ', h('b', null, ['Easy', 'Light', 'Solid', 'Hard', 'Max'][s.difficulty - 1])) : null, s.notes ? h('div', { class: 'prev-line' }, s.notes) : null) : null,
    h('div', { class: 'sheet-head' }, h('h2', null, 'Exercises'), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Tap a set to edit')),
    exCards.length ? h('div', { class: 'stack' }, exCards) : h('p', { class: 'muted' }, 'No sets were logged.'),
    h('button', { class: 'btn btn-ink btn-block', onclick: () => repeatSession(s) }, icon('repeat', 18), 'Repeat this workout'));
  return h('div', { class: 'view page-inner' }, hero, sheet);
}

function editMeta(s) {
  openSheet((body, api) => {
    const n = h('input', { class: 'input', value: s.name, maxlength: 60, 'aria-label': 'Workout name' });
    const t = h('textarea', { class: 'textarea', maxlength: 1000, 'aria-label': 'Notes' }, s.notes || '');
    body.append(h('div', { class: 'stack' }, n, t, h('button', { class: 'btn btn-ink btn-block', onclick: async () => { s.name = n.value.trim() || s.name; s.notes = t.value.trim(); await store.saveSession(s); api.close(); navigate('/session/' + s.id, { replace: true }); } }, 'Save')));
  }, { title: 'Edit workout' });
}
