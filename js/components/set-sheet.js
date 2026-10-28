// Bottom sheet to edit the details of one set (type, values, RPE/RIR, left/right reps, notes).
import { h } from '../utils/dom.js';
import { openSheet, field } from './ui.js';
import { fieldsFor } from '../calculations/fields.js';
import { parseNum } from '../calculations/units.js';
import { SET_TYPES } from '../data/vocab.js';
import { store } from '../services/store.js';

export function openSetSheet({ set, type, index, onSave, onDelete }) {
  openSheet((body, api) => {
    const fields = fieldsFor(type, store.unit, store.distUnit);
    const draft = { ...set };
    const typeSel = h('select', { class: 'select' }, SET_TYPES.map(t => h('option', { value: t.value, selected: t.value === (set.set_type || 'normal') }, t.label)));
    const inputs = fields.map(f => {
      const i = h('input', { class: 'input', inputmode: f.mode, value: f.toDisp(set[f.key]) ?? '', placeholder: '—' });
      i.addEventListener('input', () => { draft[f.key] = f.fromDisp(parseNum(i.value)); });
      return field(f.label, i);
    });
    const num = (key, label, ph) => { const i = h('input', { class: 'input', inputmode: 'decimal', value: set[key] ?? '', placeholder: ph }); i.addEventListener('input', () => { draft[key] = parseNum(i.value); }); return field(label, i); };
    const isRep = fields.some(f => f.key === 'reps');
    const notes = h('textarea', { class: 'textarea', maxlength: 300, placeholder: 'Optional note for this set' }, set.notes || '');
    body.append(h('div', { class: 'stack' },
      field('Set type', typeSel),
      h('div', { class: 'grid-2' }, inputs),
      h('div', { class: 'grid-2' }, num('rpe', 'RPE (1–10)', 'optional'), num('rir', 'Reps in reserve', 'optional')),
      isRep ? h('div', { class: 'grid-2' }, num('left_reps', 'Left reps', 'optional'), num('right_reps', 'Right reps', 'optional')) : null,
      field('Notes', notes),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn btn-danger', onclick: () => { onDelete?.(); api.close(); } }, 'Delete set'),
        h('button', { class: 'btn btn-ink', onclick: () => {
          for (const k of ['rpe']) if (draft[k] != null && (draft[k] < 1 || draft[k] > 10)) draft[k] = null;
          if (draft.rir != null && (draft.rir < 0 || draft.rir > 10)) draft.rir = null;
          onSave({ ...draft, set_type: typeSel.value, notes: notes.value.trim() || null }); api.close();
        } }, 'Save'))));
  }, { title: `Set ${index + 1}` });
}
