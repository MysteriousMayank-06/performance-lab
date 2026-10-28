import { h } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate, back } from '../router.js';
import { exerciseBrowser } from '../components/exercise-picker.js';

export async function render(params, scope) {
  const total = store.exercises.length, custom = store.exercises.filter(e => !e.is_system).length;
  return h('div', { class: 'view page-inner' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: () => back('/plan') }, icon('arrow-left', 22)), h('div', { class: 'title' }, 'Exercise library'), h('span', { style: { width: '48px' } })),
    h('div', { class: 'hero hero-compact' }, h('div', { class: 'eyebrow' }, 'Exercises available'), h('div', { class: 'big num' }, String(total)), h('div', { class: 'pill-note' }, icon('star', 14), custom ? `${custom} custom` : 'Add your own any time')),
    h('div', { class: 'sheet' }, exerciseBrowser({ onPick: (e) => navigate('/exercise/' + e.id), scope })));
}
