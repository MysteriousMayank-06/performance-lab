import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { field, toast } from '../components/ui.js';
import { store } from '../services/store.js';
import { navigate } from '../router.js';
import { parseNum, displayToKg, storeKg } from '../calculations/units.js';
import { GOALS, EXPERIENCE, WEEKDAYS, EQUIPMENT } from '../data/vocab.js';
import { titleCase } from '../utils/format.js';
import { startEmpty } from '../services/actions.js';

const STEPS = ['name', 'units', 'level', 'schedule', 'weight', 'finish'];

export async function render(params, scope) {
  const draft = {
    name: store.profile.display_name || store.user?.user_metadata?.display_name || '', wu: store.profile.preferred_weight_unit, du: store.profile.preferred_distance_unit,
    height: '', birth: '', exp: store.profile.training_experience, goal: store.profile.primary_goal,
    days: new Set(store.profile.settings.available_days || []), equip: new Set(store.profile.settings.equipment || []), weight: '',
  };
  let step = 0;
  const root = h('div', { class: 'view onboarding' });
  const dots = h('div', { class: 'ob-dots', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': STEPS.length });
  const titleEl = h('h1', { class: 'hero-title' });
  const subEl = h('p', { class: 'ob-sub' });
  const sheet = h('div', { class: 'sheet ob-sheet' });
  root.append(h('div', { class: 'hero' }, dots, titleEl, subEl), sheet);

  const saveProgress = async () => {
    const heightCm = parseNum(draft.height) == null ? null : (draft.du === 'mi' ? Math.round(parseNum(draft.height) * 2.54) : parseNum(draft.height));
    const by = parseNum(draft.birth);
    await store.updateProfile({
      display_name: draft.name.trim(), preferred_weight_unit: draft.wu, preferred_distance_unit: draft.du, height_cm: heightCm && heightCm > 80 && heightCm < 260 ? heightCm : store.profile.height_cm,
      birth_year: by && by > 1900 && by <= new Date().getFullYear() - 10 ? Math.round(by) : store.profile.birth_year,
      training_experience: draft.exp, primary_goal: draft.goal, settings: { available_days: [...draft.days], equipment: [...draft.equip] },
    });
  };

  const choice = (items, value, onPick, cols = 1) => h('div', { class: 'choice-grid c' + cols, role: 'radiogroup' }, items.map(it => {
    const on = value === it.value;
    return h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: 'choice' + (on ? ' is-on' : ''), onclick: () => { onPick(it.value); draw(); } },
      h('span', { class: 't' }, it.label), it.sub ? h('span', { class: 's' }, it.sub) : null);
  }));

  const nav = (next, { skip = false, nextLabel = 'Continue', validate } = {}) => {
    const err = h('div', { class: 'field-error', role: 'alert' });
    const go = h('button', { class: 'btn btn-ink', onclick: async () => {
      const bad = validate?.(); if (bad) { err.textContent = bad; return; }
      await saveProgress().catch(() => {}); next ? next() : (step++, draw());
    } }, nextLabel, icon('arrow-right', 18));
    return h('div', { class: 'stack' }, err, h('div', { class: 'row between' },
      step > 0 ? h('button', { class: 'btn btn-soft', onclick: () => { step--; draw(); }, 'aria-label': 'Back' }, icon('arrow-left', 18), 'Back') : h('span'),
      h('div', { class: 'row' }, skip ? h('button', { class: 'link-btn', onclick: () => { step++; draw(); } }, 'Skip') : null, go)));
  };

  const finish = async (where) => {
    await saveProgress();
    if (parseNum(draft.weight)) await store.saveMeasurement({ measurement_type: 'weight', value: storeKg(displayToKg(parseNum(draft.weight), draft.wu)), unit: 'kg' });
    if (where === 'example') await store.addExampleRoutines();
    await store.updateProfile({ onboarding_completed: true });
    if (where === 'custom') navigate('/routine/new');
    else if (where === 'empty') await startEmpty();
    else if (where === 'example') { navigate('/plan'); toast('Example routines added — edit them freely.'); }
    else navigate('/home');
  };

  function draw() {
    const id = STEPS[step];
    clear(dots); STEPS.forEach((_, i) => dots.append(h('span', { class: 'ob-dot' + (i === step ? ' on' : i < step ? ' past' : '') })));
    dots.setAttribute('aria-valuenow', step + 1); dots.setAttribute('aria-label', `Step ${step + 1} of ${STEPS.length}`);
    clear(sheet); sheet.classList.remove('view'); void sheet.offsetWidth; sheet.classList.add('view');
    const body = h('div', { class: 'stack ob-body' });
    if (id === 'name') {
      titleEl.textContent = 'Welcome to your lab'; subEl.textContent = 'A few quick questions so the app fits you. You can change everything later.';
      const n = h('input', { class: 'input', value: draft.name, placeholder: 'Your first name', maxlength: 40, autocomplete: 'given-name', autofocus: true });
      n.addEventListener('input', () => { draft.name = n.value; });
      body.append(field('What should we call you?', n), nav(null, { validate: () => draft.name.trim().length < 1 ? 'Enter a name so we can greet you.' : '' }));
    } else if (id === 'units') {
      titleEl.textContent = 'Units & body'; subEl.textContent = 'Weights are stored in kilograms and converted for display, so switching units never corrupts history.';
      const hgt = h('input', { class: 'input', inputmode: 'decimal', value: draft.height, placeholder: draft.du === 'mi' ? 'Height in inches (optional)' : 'Height in cm (optional)' }); hgt.addEventListener('input', () => { draft.height = hgt.value; });
      const by = h('input', { class: 'input', inputmode: 'numeric', value: draft.birth, placeholder: 'e.g. 2001 (optional)', maxlength: 4 }); by.addEventListener('input', () => { draft.birth = by.value; });
      body.append(h('div', { class: 'field' }, h('label', null, 'Weight unit'), choice([{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }], draft.wu, v => { draft.wu = v; }, 2)),
        h('div', { class: 'field' }, h('label', null, 'Distance unit'), choice([{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }], draft.du, v => { draft.du = v; }, 2)),
        h('div', { class: 'grid-2' }, field('Height', hgt), field('Birth year', by)), nav(null, { skip: true }));
    } else if (id === 'level') {
      titleEl.textContent = 'Your training'; subEl.textContent = 'Used only to pick sensible defaults. No medical questions.';
      body.append(h('div', { class: 'field' }, h('label', null, 'Experience'), choice(EXPERIENCE, draft.exp, v => { draft.exp = v; }, 3)),
        h('div', { class: 'field' }, h('label', null, 'Main goal'), choice(GOALS, draft.goal, v => { draft.goal = v; }, 2)), nav(null, { skip: true }));
    } else if (id === 'schedule') {
      titleEl.textContent = 'Days & equipment'; subEl.textContent = 'Training days are flexible — pick the ones that usually work for you.';
      const days = h('div', { class: 'day-pick' }, WEEKDAYS.map((d, i) => { const on = draft.days.has(i); return h('button', { type: 'button', class: 'day' + (on ? ' is-on' : ''), 'aria-pressed': String(on), onclick: () => { on ? draft.days.delete(i) : draft.days.add(i); draw(); } }, d); }));
      const eq = h('div', { class: 'chip-row wrap' }, EQUIPMENT.map(e => { const on = draft.equip.has(e); return h('button', { type: 'button', class: 'chip' + (on ? ' is-on' : ''), 'aria-pressed': String(on), onclick: () => { on ? draft.equip.delete(e) : draft.equip.add(e); draw(); } }, titleCase(e)); }));
      body.append(h('div', { class: 'field' }, h('label', null, 'Days you can train'), days), h('div', { class: 'field' }, h('label', null, 'Equipment you have access to'), eq), nav(null, { skip: true }));
    } else if (id === 'weight') {
      titleEl.textContent = 'Starting point'; subEl.textContent = 'Optional. A first body-weight entry gives your trend chart something to start from.';
      const w = h('input', { class: 'input', inputmode: 'decimal', value: draft.weight, placeholder: `Body weight in ${draft.wu} (optional)` }); w.addEventListener('input', () => { draft.weight = w.value; });
      body.append(field('Current body weight', w), nav(null, { skip: true, validate: () => draft.weight && (parseNum(draft.weight) == null || parseNum(draft.weight) <= 20 || parseNum(draft.weight) > 500) ? 'Enter a realistic weight, or skip this step.' : '' }));
    } else {
      titleEl.textContent = 'You\'re all set'; subEl.textContent = 'How do you want to begin? Nothing here is final.';
      body.append(h('div', { class: 'stack' },
        h('button', { class: 'choice big', onclick: () => finish('custom') }, h('span', { class: 'ico' }, icon('edit', 22)), h('span', null, h('span', { class: 't' }, 'Create a custom routine'), h('span', { class: 's' }, 'Build your own split, exercise by exercise'))),
        h('button', { class: 'choice big', onclick: () => finish('empty') }, h('span', { class: 'ico' }, icon('play', 22)), h('span', null, h('span', { class: 't' }, 'Start an empty workout'), h('span', { class: 's' }, 'Add exercises as you go'))),
        h('button', { class: 'choice big', onclick: () => finish('example') }, h('span', { class: 'ico' }, icon('copy', 22)), h('span', null, h('span', { class: 't' }, 'Use editable example routines'), h('span', { class: 's' }, 'Full body, Upper/Lower and Push/Pull/Legs — examples, not prescriptions'))),
        h('button', { class: 'link-btn', style: { alignSelf: 'center', marginTop: '8px' }, onclick: () => finish('home') }, 'Just take me to the app')),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-soft', onclick: () => { step--; draw(); } }, icon('arrow-left', 18), 'Back')));
    }
    sheet.append(body);
  }
  draw();
  return root;
}
