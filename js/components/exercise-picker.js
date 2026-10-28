// Exercise browser (search + filters) used by the library page, routine builder and active workout.
import { h, clear, debounce } from '../utils/dom.js';
import { icon } from './icons.js';
import { store } from '../services/store.js';
import { titleCase } from '../utils/format.js';
import { openSheet, toast, field } from './ui.js';
import { MUSCLE_GROUPS, MUSCLE_ALL, EQUIPMENT, EQUIPMENT_FILTERS, TYPES, TYPE_LABEL, TRACKING_BY_TYPE, groupOfMuscle } from '../data/vocab.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Relevance score; tolerant of small spelling mistakes ("benchpress", "bech press"). 0 = no match. */
export function searchScore(ex, q) {
  const nq = norm(q); if (!nq) return 1;
  let best = 0;
  for (const t of [ex.name, ...(ex.aliases || [])].map(norm)) {
    if (t === nq) best = Math.max(best, 100);
    else if (t.startsWith(nq)) best = Math.max(best, 80);
    else if (t.includes(nq)) best = Math.max(best, 60);
    else if (t.replace(/ /g, '').includes(nq.replace(/ /g, ''))) best = Math.max(best, 55);
    else {
      const ts = t.split(' ');
      if (nq.split(' ').every(w => ts.some(x => x.startsWith(w) || (w.length > 3 && lev(x, w) <= 1)))) best = Math.max(best, 40);
    }
  }
  return best;
}

export function filterExercises(list, { q = '', muscle = null, equipment = null, type = null, favorites = false, recent = false }) {
  let out = list;
  if (muscle) { const g = MUSCLE_GROUPS.find(x => x.key === muscle); out = out.filter(e => (e.primary_muscles || []).some(m => g.members.includes(m))); }
  if (equipment) out = out.filter(e => (e.equipment || []).includes(equipment) || (equipment === 'bodyweight' && e.exercise_type === 'bodyweight_reps'));
  if (type) out = out.filter(e => e.exercise_type === type);
  if (favorites) out = out.filter(e => store.exSetting(e.id).is_favorite);
  if (recent) { const ids = new Set(store.recentExercises(30).map(e => e.id)); out = out.filter(e => ids.has(e.id)); }
  if (q) return out.map(e => [e, searchScore(e, q)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).map(x => x[0]);
  return [...out].sort((a, b) => a.name.localeCompare(b.name));
}

export function exerciseSubtitle(e) {
  const m = (e.primary_muscles || []).map(x => titleCase(x)).join(', ');
  const eq = (e.equipment || []).filter(x => x !== 'bodyweight').map(titleCase).join(' · ');
  return [m, eq].filter(Boolean).join(' · ');
}

/** Embeddable browser. onPick(exercise). */
export function exerciseBrowser({ onPick, scope, showCreate = true, autofocus = false }) {
  const state = { q: '', muscle: null, equipment: null, type: null, favorites: false, recent: false };
  const root = h('div', { class: 'stack ex-browser' });
  const input = h('input', { type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises', autocomplete: 'off', enterkeyhint: 'search', autofocus: autofocus || null });
  const chips = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filters' });
  const chips2 = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Equipment filters' });
  const list = h('div', { class: 'list ex-list' });
  const count = h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' }, 'aria-live': 'polite' });

  const chip = (label, on, fn, ic) => h('button', { class: 'chip' + (on ? ' is-on' : ''), type: 'button', 'aria-pressed': String(!!on), onclick: fn }, ic ? icon(ic, 14) : null, label);
  const renderChips = () => {
    clear(chips); clear(chips2);
    chips.append(
      chip('Favorites', state.favorites, () => { state.favorites = !state.favorites; draw(); }, 'star'),
      chip('Recent', state.recent, () => { state.recent = !state.recent; draw(); }, 'clock'),
      ...MUSCLE_GROUPS.map(g => chip(g.label, state.muscle === g.key, () => { state.muscle = state.muscle === g.key ? null : g.key; draw(); })));
    chips2.append(...EQUIPMENT_FILTERS.map(e => chip(titleCase(e), state.equipment === e, () => { state.equipment = state.equipment === e ? null : e; draw(); })),
      ...TYPES.filter(t => ['cardio', 'isometric', 'mobility', 'assisted'].includes(t.value)).map(t => chip(t.label.split(' (')[0], state.type === t.value, () => { state.type = state.type === t.value ? null : t.value; draw(); })));
  };
  const draw = () => {
    renderChips();
    const res = filterExercises(store.exercises, state);
    clear(list);
    const shown = res.slice(0, 80);
    shown.forEach(e => list.append(h('button', { class: 'list-row', type: 'button', onclick: () => onPick(e) },
      h('span', { class: 'ico' }, icon(e.exercise_type === 'cardio' ? 'timer' : (groupOfMuscle(e.primary_muscles?.[0])?.icon || 'dumbbell'), 22)),
      h('span', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 's' }, exerciseSubtitle(e) || TYPE_LABEL[e.exercise_type])),
      store.exSetting(e.id).is_favorite ? h('span', { class: 'fav', 'aria-label': 'Favorite' }, icon('star', 16)) : null,
      !e.is_system ? h('span', { class: 'badge badge-ok' }, 'Custom') : null)));
    count.textContent = res.length ? `${res.length} exercise${res.length === 1 ? '' : 's'}${res.length > 80 ? ' — refine your search to see more' : ''}` : '';
    if (!res.length) list.append(h('div', { class: 'empty' }, icon('search', 36), h('h3', null, 'No matches'), h('p', null, state.q ? `Nothing found for “${state.q}”. Check the spelling, clear a filter, or create it as a custom exercise.` : 'Try clearing a filter.'),
      showCreate ? h('button', { class: 'btn btn-soft btn-sm', onclick: () => openCustomExercise({ name: state.q, onSaved: onPick }) }, 'Create custom exercise') : null));
  };
  const onInput = debounce(() => { state.q = input.value; draw(); }, 120);
  input.addEventListener('input', onInput);
  root.append(h('div', { class: 'search-bar' }, icon('search', 20), input), chips, chips2, count, list,
    showCreate ? h('button', { class: 'btn btn-soft btn-block', onclick: () => openCustomExercise({ onSaved: (e) => { onPick(e); } }) }, icon('plus', 18), 'New custom exercise') : null);
  draw();
  const off = store.on((w) => { if (w === 'exercises' || w === 'exsettings') draw(); });
  scope?.add(off);
  return root;
}

/** Bottom sheet that resolves with the chosen exercise (or null). */
export function pickExercise(title = 'Add exercise') {
  return new Promise((resolve) => {
    let picked = null;
    const sheet = openSheet((body, api) => {
      body.append(exerciseBrowser({ onPick: (e) => { picked = e; api.close(e); } }));
    }, { title, tall: true });
    const prev = sheet.onClose;
    sheet.onClose = (r) => { prev?.(r); resolve(picked); };
  });
}

/** Create / edit a custom exercise. */
export function openCustomExercise({ existing = null, name = '', onSaved } = {}) {
  openSheet((body, api) => {
    const f = existing || { name, exercise_type: 'weight_reps', primary_muscles: [], equipment: [], instructions: '' };
    const nameIn = h('input', { class: 'input', value: f.name || '', maxlength: 80, placeholder: 'e.g. Landmine press', autocomplete: 'off' });
    const typeSel = h('select', { class: 'select' }, TYPES.map(t => h('option', { value: t.value, selected: t.value === f.exercise_type }, t.label)));
    const musc = new Set(f.primary_muscles || []), eq = new Set(f.equipment || []);
    const multi = (items, set, labelFn) => h('div', { class: 'chip-row wrap' }, items.map(it => {
      const b = h('button', { type: 'button', class: 'chip' + (set.has(it) ? ' is-on' : ''), 'aria-pressed': String(set.has(it)), onclick: () => { set.has(it) ? set.delete(it) : set.add(it); b.classList.toggle('is-on'); b.setAttribute('aria-pressed', String(set.has(it))); } }, labelFn(it));
      return b;
    }));
    const instr = h('textarea', { class: 'textarea', placeholder: 'Optional: how to perform it' }, f.instructions || '');
    const err = h('div', { class: 'field-error', 'aria-live': 'polite' });
    const save = h('button', { class: 'btn btn-ink btn-block', onclick: async () => {
      const n = nameIn.value.trim();
      if (n.length < 2) { err.textContent = 'Give the exercise a name (at least 2 letters).'; nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return; }
      if (!musc.size) { err.textContent = 'Pick at least one primary muscle.'; return; }
      const dup = store.exercises.find(e => e.id !== existing?.id && norm(e.name) === norm(n));
      if (dup) { err.textContent = `“${dup.name}” already exists — search for it instead.`; return; }
      save.setAttribute('aria-busy', 'true');
      const row = await store.saveExercise({ ...(existing || {}), name: n, aliases: existing?.aliases || [], primary_muscles: [...musc], secondary_muscles: existing?.secondary_muscles || [],
        equipment: [...eq], exercise_type: typeSel.value, movement_pattern: existing?.movement_pattern ?? null, tracking_config: TRACKING_BY_TYPE[typeSel.value], instructions: instr.value.trim() || null, common_mistakes: existing?.common_mistakes ?? null });
      toast(existing ? 'Exercise updated' : 'Custom exercise created'); api.close(); onSaved?.(row);
    } }, existing ? 'Save changes' : 'Create exercise');
    body.append(h('div', { class: 'stack' },
      field('Name', nameIn), field('Tracking style', typeSel),
      h('div', { class: 'field' }, h('label', null, 'Primary muscles'), multi(MUSCLE_ALL, musc, m => titleCase(m))),
      h('div', { class: 'field' }, h('label', null, 'Equipment'), multi(EQUIPMENT, eq, m => titleCase(m))),
      field('Instructions', instr), err, save));
  }, { title: existing ? 'Edit exercise' : 'Custom exercise', tall: true });
}
