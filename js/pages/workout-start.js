import { h } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store, elapsedSeconds } from '../services/store.js';
import { navigate } from '../router.js';
import { startRoutine, startEmpty, repeatSession } from '../services/actions.js';
import { fmtClock, relativeDay } from '../utils/format.js';
import { toast } from '../components/ui.js';

export async function render(params, scope) {
  const active = store.activeSession();
  const routines = store.routines.filter(r => !r.archived_at);
  const last = store.completed()[0];
  const clock = h('span', { class: 'num' });
  if (active) { const u = () => { clock.textContent = fmtClock(elapsedSeconds(active)); }; u(); scope.interval(u, 1000); }

  const hero = h('div', { class: 'hero hero-center' },
    h('h1', { class: 'hero-title' }, active ? 'Your workout is waiting' : 'Modern tools for modern training'),
    h('div', { class: 'plate-art', 'aria-hidden': 'true' }, h('div', { class: 'halo' }), h('div', { class: 'glass-plate' }, icon('logo', 64))),
    active
      ? h('div', { class: 'cta-row' }, h('button', { class: 'btn btn-light btn-lg', onclick: () => navigate('/workout/active') }, icon('play', 18), 'Resume · ', clock), h('button', { class: 'icon-btn btn-glass', 'aria-label': 'Resume workout', onclick: () => navigate('/workout/active') }, icon('arrow-right', 22)))
      : h('div', { class: 'cta-row' }, h('button', { class: 'btn btn-light btn-lg', onclick: startEmpty }, 'Start empty workout'), h('button', { class: 'icon-btn btn-glass', 'aria-label': 'Start empty workout', onclick: startEmpty }, icon('arrow-right', 22))));

  const rows = routines.map(r => h('div', { class: 'list-row' },
    h('button', { class: 'row grow', style: { gap: 'var(--sp-3)', textAlign: 'left' }, onclick: () => navigate('/routine/' + r.id), 'aria-label': `Edit ${r.name}` },
      h('span', { class: 'ico' }, icon('dumbbell', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, r.name), h('div', { class: 's' }, `${r.exercises.length} exercises${r.folder_name ? ' · ' + r.folder_name : ''}`))),
    h('button', { class: 'btn btn-ink btn-sm', 'aria-label': `Start ${r.name}`, onclick: () => startRoutine(r) }, icon('play', 16), 'Start')));

  const sheet = h('div', { class: 'sheet' },
    last && !active ? h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Repeat last')),
      h('button', { class: 'card is-pressable row between', onclick: () => repeatSession(last) }, h('span', null, h('h3', null, last.name), h('span', { class: 'sub' }, relativeDay(last.ended_at || last.started_at))), icon('repeat', 22))) : null,
    h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Your routines'), h('a', { class: 'link', href: '#/plan' }, 'Manage')),
      rows.length ? h('div', { class: 'list' }, rows)
        : h('div', { class: 'empty' }, icon('copy', 40), h('h3', null, 'No routines yet'), h('p', null, 'Build your own, or add editable examples (Full Body, Upper/Lower, Push/Pull/Legs).'),
          h('div', { class: 'stack', style: { width: '100%' } },
            h('button', { class: 'btn btn-ink', onclick: () => navigate('/routine/new') }, 'Create routine'),
            h('button', { class: 'btn btn-soft', onclick: async (e) => { e.currentTarget.setAttribute('aria-busy', 'true'); await store.addExampleRoutines(); toast('Example routines added'); navigate('/workout'); } }, 'Add example routines')))));
  return h('div', { class: 'view page-inner' }, hero, sheet);
}
