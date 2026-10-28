import { h, clear, debounce } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate } from '../router.js';
import { sessionStats } from '../calculations/lifting.js';
import { kgToDisplay } from '../calculations/units.js';
import { fmtDuration, fmtNumber, relativeDay } from '../utils/format.js';

export async function render(params, scope) {
  const unit = store.unit;
  let q = '', shown = 30;
  const list = h('div', { class: 'stack' });
  const search = h('input', { type: 'search', placeholder: 'Search workouts or exercises', 'aria-label': 'Search workouts' });
  const draw = () => {
    clear(list);
    const all = store.completed().filter(s => !q || s.name.toLowerCase().includes(q) || s.exercises.some(e => e.name.toLowerCase().includes(q)));
    if (!all.length) { list.append(h('div', { class: 'empty' }, icon('clock', 40), h('h3', null, q ? 'No matching workouts' : 'No workouts yet'), h('p', null, q ? 'Try a different search.' : 'Completed workouts will appear here.'), q ? null : h('button', { class: 'btn btn-ink', onclick: () => navigate('/workout') }, 'Start a workout'))); return; }
    let month = '';
    const wrap = h('div', { class: 'list' });
    all.slice(0, shown).forEach(s => {
      const m = new Date(s.started_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (m !== month) { month = m; wrap.append(h('div', { class: 'list-group' }, m)); }
      const st = sessionStats(s);
      wrap.append(h('button', { class: 'list-row', onclick: () => navigate('/session/' + s.id) }, h('span', { class: 'ico' }, icon('dumbbell', 22)),
        h('span', { class: 'grow' }, h('div', { class: 't' }, s.name), h('div', { class: 's' }, `${relativeDay(s.ended_at || s.started_at)} · ${st.sets} sets${s.duration_seconds ? ' · ' + fmtDuration(s.duration_seconds) : ''}`)),
        h('span', { class: 'end' }, st.volume ? `${fmtNumber(kgToDisplay(st.volume, unit), 0)} ${unit}` : '')));
    });
    list.append(wrap);
    if (all.length > shown) list.append(h('button', { class: 'btn btn-soft btn-block', onclick: () => { shown += 30; draw(); } }, `Show more (${all.length - shown} left)`));
  };
  search.addEventListener('input', debounce(() => { q = search.value.trim().toLowerCase(); shown = 30; draw(); }, 150));
  draw();
  return h('div', { class: 'view page-inner' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: () => navigate('/progress') }, icon('arrow-left', 22)), h('div', { class: 'title' }, 'History'), h('span', { style: { width: '48px' } })),
    h('div', { class: 'hero hero-compact' }, h('div', { class: 'eyebrow' }, 'Total workouts'), h('div', { class: 'big num' }, String(store.completed().length))),
    h('div', { class: 'sheet' }, h('div', { class: 'search-bar' }, icon('search', 20), search), list));
}
