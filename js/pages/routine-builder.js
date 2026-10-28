import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate, back } from '../router.js';
import { toast, confirmDialog, field } from '../components/ui.js';
import { pickExercise } from '../components/exercise-picker.js';
import { parseNum, kgToDisplay, displayToKg, round, storeKg } from '../calculations/units.js';
import { startRoutine } from '../services/actions.js';
import { uuid } from '../utils/id.js';
import { titleCase } from '../utils/format.js';

export async function render({ id }, scope) {
  const existing = id === 'new' ? null : store.routines.find(r => r.id === id);
  if (id !== 'new' && !existing) return h('div', { class: 'view page-inner' }, h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass', 'aria-label': 'Back', onclick: () => navigate('/plan') }, icon('arrow-left', 22))), h('div', { class: 'sheet' }, h('div', { class: 'empty' }, icon('search', 40), h('h3', null, 'Routine not found'), h('button', { class: 'btn btn-ink', onclick: () => navigate('/plan') }, 'Back to Plan'))));
  const unit = store.unit;
  const r = existing ? structuredClone(existing) : { name: '', description: '', folder_name: '', exercises: [] };
  const original = JSON.stringify(r);
  const isDirty = () => JSON.stringify(r) !== original;
  const list = h('div', { class: 'stack' });
  const errBox = h('div', { class: 'field-error', role: 'alert' });

  const name = h('input', { class: 'input input-glass title-input', value: r.name, placeholder: 'Routine name', maxlength: 60, 'aria-label': 'Routine name', autofocus: !existing || null });
  name.addEventListener('input', () => { r.name = name.value; name.removeAttribute('aria-invalid'); errBox.textContent = ''; });
  const desc = h('textarea', { class: 'textarea', placeholder: 'Description (optional)', maxlength: 300, 'aria-label': 'Description' }, r.description || '');
  desc.addEventListener('input', () => { r.description = desc.value; });
  const folderIn = h('input', { class: 'input', value: r.folder_name || '', placeholder: 'Folder (optional) e.g. Strength block', maxlength: 40, list: 'folders', 'aria-label': 'Folder' });
  folderIn.addEventListener('input', () => { r.folder_name = folderIn.value.trim() || null; });
  const dl = h('datalist', { id: 'folders' }, [...new Set(store.routines.map(x => x.folder_name).filter(Boolean))].map(f => h('option', { value: f })));

  const num = (item, key, ph, label, { min = 0, max = 999, step } = {}) => {
    const i = h('input', { class: 'num-input', inputmode: step ? 'decimal' : 'numeric', value: item[key] ?? '', placeholder: ph, 'aria-label': label });
    i.addEventListener('focus', () => i.select());
    i.addEventListener('input', () => { const v = parseNum(i.value); item[key] = v == null ? null : Math.min(max, Math.max(min, step ? v : Math.round(v))); });
    return h('label', { class: 'mini-field' }, h('span', null, label), i);
  };

  function draw() {
    clear(list);
    r.exercises.forEach((it, i) => {
      const meta = store.exercise(it.exercise_id);
      const loaded = meta && (meta.exercise_type === 'weight_reps' || meta.exercise_type === 'bodyweight_reps');
      const reps = meta && (meta.exercise_type === 'weight_reps' || meta.exercise_type === 'bodyweight_reps' || meta.exercise_type === 'assisted');
      const grouped = it.group_id && (r.exercises[i - 1]?.group_id === it.group_id || r.exercises[i + 1]?.group_id === it.group_id);
      const w = h('input', { class: 'num-input', inputmode: 'decimal', value: it.target_weight_kg != null ? round(kgToDisplay(it.target_weight_kg, unit), 2) : '', placeholder: '—', 'aria-label': `Target weight in ${unit}` });
      w.addEventListener('focus', () => w.select());
      w.addEventListener('input', () => { it.target_weight_kg = storeKg(displayToKg(parseNum(w.value), unit)); });
      list.append(h('article', { class: 'ex-card builder-card' + (grouped ? ' grp' : '') },
        h('div', { class: 'ex-head' },
          h('span', { class: 'idx-pill' }, String(i + 1)),
          h('div', { class: 'ex-name grow' }, h('div', null, meta?.name || 'Unknown exercise'), h('div', { class: 'ex-meta' }, meta ? (meta.primary_muscles || []).map(titleCase).join(', ') : 'This exercise was deleted')),
          h('div', { class: 'row-reorder' },
            h('button', { class: 'icon-btn sm', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [r.exercises[i - 1], r.exercises[i]] = [r.exercises[i], r.exercises[i - 1]]; draw(); } }, icon('arrow-up', 18)),
            h('button', { class: 'icon-btn sm', 'aria-label': 'Move down', disabled: i === r.exercises.length - 1, onclick: () => { [r.exercises[i + 1], r.exercises[i]] = [r.exercises[i], r.exercises[i + 1]]; draw(); } }, icon('arrow-down', 18)))),
        h('div', { class: 'mini-grid' },
          num(it, 'target_sets', '3', 'Sets', { min: 1, max: 20 }),
          reps ? num(it, 'target_min_reps', '8', 'Min reps', { min: 1, max: 100 }) : null,
          reps ? num(it, 'target_max_reps', '12', 'Max reps', { min: 1, max: 100 }) : null,
          loaded ? h('label', { class: 'mini-field' }, h('span', null, `Weight (${unit})`), w) : null,
          num(it, 'rest_seconds', '90', 'Rest (s)', { min: 0, max: 900 })),
        it.showNotes || it.notes ? h('textarea', { class: 'textarea compact', placeholder: 'Notes / cues for this exercise', 'aria-label': 'Exercise notes', oninput: (e) => { it.notes = e.target.value; } }, it.notes || '') : null,
        h('div', { class: 'row builder-actions' },
          h('button', { class: 'chip', onclick: () => { it.showNotes = !it.showNotes; draw(); } }, icon('list', 14), 'Notes'),
          i < r.exercises.length - 1 ? h('button', { class: 'chip' + (grouped ? ' is-on' : ''), 'aria-pressed': String(!!grouped), onclick: () => toggleSuperset(i) }, icon('superset', 14), 'Superset with next') : null,
          h('button', { class: 'chip danger', onclick: () => { r.exercises.splice(i, 1); fixGroups(); draw(); toast('Exercise removed', { action: 'Undo', onAction: () => { r.exercises.splice(i, 0, it); draw(); } }); } }, icon('trash', 14), 'Remove'))));
    });
    if (!r.exercises.length) list.append(h('div', { class: 'empty' }, icon('dumbbell', 40), h('h3', null, 'No exercises yet'), h('p', null, 'Add exercises, then set targets for each.')));
  }
  function toggleSuperset(i) {
    const a = r.exercises[i], b = r.exercises[i + 1];
    if (a.group_id && a.group_id === b.group_id) { b.group_id = null; b.group_type = null; fixGroups(); }
    else { const g = a.group_id || b.group_id || uuid(); a.group_id = g; b.group_id = g; a.group_type = b.group_type = 'superset'; }
    draw();
  }
  function fixGroups() { const c = {}; r.exercises.forEach(e => { if (e.group_id) c[e.group_id] = (c[e.group_id] || 0) + 1; }); r.exercises.forEach(e => { if (e.group_id && c[e.group_id] < 2) { e.group_id = null; e.group_type = null; } }); }

  async function add() {
    const m = await pickExercise('Add to routine'); if (!m) return;
    const t = m.exercise_type;
    r.exercises.push({ id: uuid(), exercise_id: m.id, target_sets: t === 'weight_reps' || t === 'bodyweight_reps' || t === 'assisted' ? 3 : 1, target_min_reps: t === 'weight_reps' ? 8 : null, target_max_reps: t === 'weight_reps' ? 12 : null, rest_seconds: store.exSetting(m.id).default_rest_seconds ?? store.profile.default_rest_seconds });
    draw(); requestAnimationFrame(() => list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function validate() {
    if (r.name.trim().length < 2) { errBox.textContent = 'Give the routine a name.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return false; }
    for (const e of r.exercises) { if (e.target_min_reps && e.target_max_reps && e.target_min_reps > e.target_max_reps) { errBox.textContent = `Min reps can't be higher than max reps (${store.exercise(e.exercise_id)?.name}).`; return false; } }
    errBox.textContent = ''; return true;
  }
  let saving = false;
  async function save(thenStart = false) {
    if (saving || !validate()) return;
    if (thenStart && !r.exercises.length) { errBox.textContent = 'Add at least one exercise to start this routine.'; return; }
    saving = true;
    try {
      const row = await store.saveRoutine({ ...r, name: r.name.trim(), is_example: existing?.is_example && JSON.stringify(existing.exercises) === JSON.stringify(r.exercises) ? true : false, exercises: r.exercises.map(({ showNotes, ...e }) => e) });
      toast('Routine saved');
      if (thenStart) await startRoutine(row); else navigate('/plan');
    } finally { saving = false; }
  }
  async function leave() { if (isDirty() && !(await confirmDialog({ title: 'Discard changes?', message: 'You have unsaved changes to this routine.', confirmLabel: 'Discard', danger: true }))) return; back('/plan'); }

  scope.listen(window, 'beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  draw();
  return h('div', { class: 'view page-inner' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: leave }, icon('arrow-left', 22)), h('div', { class: 'title' }, existing ? 'Edit routine' : 'New routine'), h('button', { class: 'btn btn-light btn-sm', onclick: () => save(false) }, 'Save')),
    h('div', { class: 'hero hero-compact' }, name),
    h('div', { class: 'sheet' }, dl, desc, folderIn, h('div', { class: 'sheet-head' }, h('h2', null, 'Exercises'), h('button', { class: 'link-btn', onclick: add }, '+ Add')), list, errBox,
      h('button', { class: 'btn btn-soft btn-block', onclick: add }, icon('plus', 18), 'Add exercise'),
      h('div', { class: 'grid-2' }, h('button', { class: 'btn btn-ink', onclick: () => save(false) }, 'Save routine'), h('button', { class: 'btn btn-soft', onclick: () => save(true) }, icon('play', 16), 'Save & start')),
      ));
}
