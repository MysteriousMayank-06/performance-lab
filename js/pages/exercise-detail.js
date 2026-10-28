import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate, back } from '../router.js';
import { toast, openSheet, confirmDialog, segmented, field, haptic } from '../components/ui.js';
import { muscleFigure } from '../components/muscle-figure.js';
import { lineChart } from '../components/chart.js';
import { openCustomExercise } from '../components/exercise-picker.js';
import { fmtSets } from '../components/perf.js';
import { performancesFor, recordsFrom } from '../calculations/records.js';
import { suggestNext, DEFAULTS } from '../calculations/progression.js';
import { suggestSubstitutes } from '../calculations/substitutes.js';
import { setLoadKg, e1rm, exerciseVolume, isWorkingSet } from '../calculations/lifting.js';
import { kgToDisplay, displayToKg, parseNum, round, storeKg } from '../calculations/units.js';
import { fmtDate, fmtNumber, titleCase } from '../utils/format.js';
import { TYPE_LABEL } from '../data/vocab.js';

const RANGES = [{ value: 28, label: '4w' }, { value: 56, label: '8w' }, { value: 84, label: '12w' }, { value: 182, label: '6m' }, { value: 365, label: '1y' }, { value: 0, label: 'All' }];
let range = 84, metric = null;

export async function render({ id }, scope) {
  const ex = store.exercise(id);
  if (!ex) return h('div', { class: 'view page-inner' }, h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass', 'aria-label': 'Back', onclick: () => back('/exercises') }, icon('arrow-left', 22))), h('div', { class: 'sheet' }, h('div', { class: 'empty' }, icon('search', 40), h('h3', null, 'Exercise not found'), h('p', null, 'It may have been a custom exercise that was deleted. Your past workouts keep their records.'), h('button', { class: 'btn btn-ink', onclick: () => navigate('/exercises') }, 'Browse exercises'))));
  const unit = store.unit, dUnit = store.distUnit;
  const type = ex.exercise_type;
  const loaded = type === 'weight_reps' || type === 'bodyweight_reps';
  const perfs = performancesFor(id, store.sessions);
  const recs = recordsFrom(perfs, type);
  const setting = () => store.exSetting(id);
  const metrics = loaded ? [{ value: 'top', label: 'Top weight' }, { value: 'e1rm', label: 'Est. 1RM' }, { value: 'vol', label: 'Volume' }] : type === 'cardio' || type === 'isometric' || type === 'mobility' ? [{ value: 'dur', label: 'Duration' }] : [{ value: 'reps', label: 'Best reps' }];
  if (!metrics.some(m => m.value === metric)) metric = metrics[0].value;

  const chartHost = h('div'), extra = h('div');
  function drawChart() {
    clear(chartHost);
    const cutoff = range ? Date.now() - range * 86400000 : 0;
    const pts = perfs.filter(p => new Date(p.date) >= cutoff).reverse().map(p => {
      let y = null, tip = '';
      if (metric === 'top') { const l = p.sets.map(s => setLoadKg(s, type)).filter(Boolean); if (l.length) { y = kgToDisplay(Math.max(...l), unit); tip = `${fmtNumber(y, 1)} ${unit}`; } }
      else if (metric === 'e1rm') { const e = p.sets.map(s => { const l = setLoadKg(s, type); return l ? e1rm(l, s.reps) : null; }).filter(Boolean); if (e.length) { y = kgToDisplay(Math.max(...e), unit); tip = `~${fmtNumber(y, 1)} ${unit} (est.)`; } }
      else if (metric === 'vol') { const v = exerciseVolume({ ...p.exercise, type }); if (v) { y = kgToDisplay(v, unit); tip = `${fmtNumber(y, 0)} ${unit}`; } }
      else if (metric === 'dur') { const d = p.sets.reduce((a, s) => a + (s.duration_seconds || 0), 0); if (d) { y = round(d / 60, 1); tip = `${y} min`; } }
      else { const r = Math.max(...p.sets.map(s => s.reps || 0)); if (r) { y = r; tip = `${r} reps`; } }
      return y == null ? null : { x: new Date(p.date).getTime(), y, tip: `${tip} · ${fmtDate(p.date)}` };
    }).filter(Boolean);
    chartHost.append(lineChart(pts, { fmtY: v => fmtNumber(v, v < 10 ? 1 : 0) }));
    if (metric === 'e1rm') chartHost.append(h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)', marginTop: '8px' } }, 'Estimated with the Epley formula (weight × (1 + reps ÷ 30)), only from sets of 1–12 reps. It is an estimate, not a tested max.'));
  }

  // ---------------------------------------------------------- records
  const rec = (k, v, sub) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v, sub ? h('small', null, sub) : null));
  const recsRow = [];
  if (loaded) {
    recsRow.push(rec('Heaviest set', recs.max_weight ? fmtNumber(kgToDisplay(recs.max_weight.value, unit), 1) : '—', recs.max_weight ? `${unit} × ${recs.max_weight.reps}` : ''));
    recsRow.push(rec('Best est. 1RM', recs.est_1rm ? fmtNumber(kgToDisplay(recs.est_1rm.value, unit), 1) : '—', recs.est_1rm ? `${unit}${recs.est_1rm.isEstimate ? ' (est.)' : ''}` : ''));
    recsRow.push(rec('Best session volume', recs.session_volume ? fmtNumber(kgToDisplay(recs.session_volume.value, unit), 0) : '—', recs.session_volume ? unit : ''));
    recsRow.push(rec('Sessions logged', String(perfs.length)));
  } else {
    if (recs.max_reps) recsRow.push(rec('Most reps', String(recs.max_reps.value)));
    if (recs.longest_duration) recsRow.push(rec('Longest', fmtNumber(recs.longest_duration.value, 0), 's'));
    recsRow.push(rec('Sessions logged', String(perfs.length)));
  }

  // ---------------------------------------------------------- progression
  const cfg = () => ({ minReps: setting().min_reps ?? DEFAULTS.minReps, maxReps: setting().max_reps ?? DEFAULTS.maxReps, incrementKg: setting().increment_kg ?? (unit === 'lb' ? 2.268 : DEFAULTS.incrementKg), targetSets: DEFAULTS.targetSets });
  function progressionCard() {
    const s = setting();
    if (!loaded) return null;
    if (s.progression_enabled === false) return h('div', { class: 'rec-card hold' }, h('b', null, 'Suggestions are turned off for this exercise'), h('button', { class: 'link-btn', style: { alignSelf: 'flex-start' }, onclick: progressionSheet }, 'Change settings'));
    const r = suggestNext(perfs, type, cfg());
    return h('div', { class: `rec-card ${r.status}` },
      h('div', { class: 'row between' }, h('b', null, r.headline), h('button', { class: 'icon-btn sm', 'aria-label': 'Progression settings', onclick: progressionSheet }, icon('sliders', 18))),
      h('div', { style: { fontSize: 'var(--fs-sm)', lineHeight: 1.45 } }, r.detail),
      r.evidence.length ? h('div', { class: 'why' }, 'Based on: ', r.evidence.map(e => `${fmtDate(e.date)} — ${e.weight != null ? fmtNumber(kgToDisplay(e.weight, unit), 1) + ' ' + unit : 'bodyweight'} × ${e.reps.join(', ')}`).join('  ·  ')) : null,
      h('div', { class: 'why' }, 'Rule: ' + r.rule),
      r.status === 'increase' ? h('div', { class: 'why' }, 'Suggestions never change your routine automatically. Turn them off or adjust the rule with the sliders icon.') : null);
  }
  function progressionSheet() {
    openSheet((b, api) => {
      const s = setting(), c = cfg();
      const on = h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(s.progression_enabled !== false), 'aria-label': 'Enable suggestions', onclick: () => { const v = on.getAttribute('aria-checked') !== 'true'; on.setAttribute('aria-checked', String(v)); } });
      const mn = h('input', { class: 'input', inputmode: 'numeric', value: c.minReps }), mx = h('input', { class: 'input', inputmode: 'numeric', value: c.maxReps });
      const inc = h('input', { class: 'input', inputmode: 'decimal', value: round(kgToDisplay(c.incrementKg, unit), 2) });
      const rest = h('input', { class: 'input', inputmode: 'numeric', value: s.default_rest_seconds ?? '', placeholder: String(store.profile.default_rest_seconds) });
      b.append(h('div', { class: 'stack' },
        h('div', { class: 'row between' }, h('span', null, h('b', null, 'Weight suggestions'), h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' } }, 'Double progression — transparent rules, no AI')), on),
        h('div', { class: 'grid-2' }, field('Min reps', mn), field('Max reps', mx)), field(`Increment (${unit})`, inc), field('Rest for this exercise (seconds)', rest),
        h('button', { class: 'btn btn-ink btn-block', onclick: async () => {
          const a = parseNum(mn.value), z = parseNum(mx.value), i = parseNum(inc.value), r = parseNum(rest.value);
          if (a && z && a > z) { toast('Min reps can’t exceed max reps', { error: true }); return; }
          await store.saveExSetting(id, { progression_enabled: on.getAttribute('aria-checked') === 'true', min_reps: a ? Math.round(a) : null, max_reps: z ? Math.round(z) : null, increment_kg: i && i > 0 ? storeKg(displayToKg(i, unit)) : null, default_rest_seconds: r && r > 0 ? Math.round(r) : null });
          api.close(); navigate('/exercise/' + id, { replace: true });
        } }, 'Save')));
    }, { title: 'Progression settings' });
  }

  // ---------------------------------------------------------- history list
  const history = perfs.slice(0, 8).map(p => h('div', { class: 'list-row compact' }, h('span', { class: 'grow' }, h('div', { class: 't' }, fmtSets(p.sets, type, unit, dUnit)), h('div', { class: 's' }, fmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))), h('button', { class: 'icon-btn sm', 'aria-label': 'Open workout', onclick: () => navigate('/session/' + p.session.id) }, icon('chevron-right', 18))));

  // ---------------------------------------------------------- notes
  const note = h('textarea', { class: 'textarea', placeholder: 'Private setup notes: seat height, grip, machine settings, cues…', maxlength: 600, 'aria-label': 'Private notes' }, store.exNote(id));
  let saveT; note.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(() => store.saveExNote(id, note.value.trim()), 500); });
  scope.add(() => { clearTimeout(saveT); if (note.value.trim() !== store.exNote(id)) store.saveExNote(id, note.value.trim()); });

  // ---------------------------------------------------------- substitutes
  const subs = suggestSubstitutes(ex, store.exercises, { equipment: store.profile.settings.equipment });
  const fav = h('button', { class: 'icon-btn glass is-pressable' + (setting().is_favorite ? ' on' : ''), 'aria-label': 'Favorite', 'aria-pressed': String(!!setting().is_favorite), onclick: async () => { await store.saveExSetting(id, { is_favorite: !setting().is_favorite }); fav.classList.toggle('on', setting().is_favorite); fav.setAttribute('aria-pressed', String(!!setting().is_favorite)); haptic(10); } }, icon('star', 22));

  const hero = h('div', { class: 'hero hero-compact' },
    h('div', { class: 'between-row' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: () => back('/exercises') }, icon('arrow-left', 22)), h('div', { class: 'topbar-title' }, 'Exercise'),
      h('div', { class: 'row' }, !ex.is_system ? h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Edit exercise', onclick: () => openCustomExercise({ existing: ex, onSaved: () => navigate('/exercise/' + id, { replace: true }) }) }, icon('edit', 20)) : null, fav)),
    h('h1', { class: 'hero-title' }, ex.name),
    h('div', { class: 'pill-note' }, TYPE_LABEL[type] + (ex.equipment?.length ? ' · ' + ex.equipment.filter(e => e !== 'bodyweight').map(titleCase).join(', ') : '')),
    h('div', { class: 'glass fig-card' }, muscleFigure(ex.primary_muscles || [], ex.secondary_muscles || []),
      h('div', { class: 'fig-legend' }, h('span', null, h('i', { class: 'p' }), 'Primary: ' + ((ex.primary_muscles || []).map(titleCase).join(', ') || '—')), (ex.secondary_muscles || []).length ? h('span', null, h('i', { class: 's' }), 'Secondary: ' + ex.secondary_muscles.map(titleCase).join(', ')) : null)));

  const sheet = h('div', { class: 'sheet' },
    h('button', { class: 'btn btn-ink btn-block', onclick: async () => { const { startEmpty } = await import('../services/actions.js'); const a = store.activeSession(); if (!a) { await store.startSession({ name: ex.name }); const s = store.activeSession(); s.exercises.push(store.makeSessionExercise(ex, { sessionId: s.id })); await store.saveSession(s); navigate('/workout/active'); } else { a.exercises.push(store.makeSessionExercise(ex, { sessionId: a.id })); await store.saveSession(a); toast(`Added to ${a.name}`); navigate('/workout/active'); } } }, icon('play', 18), store.activeSession() ? 'Add to current workout' : 'Start workout with this'),
    h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Progress')), segmented(RANGES, range, (v) => { range = v; drawChart(); }), loaded || metrics.length > 1 ? segmented(metrics, metric, (v) => { metric = v; drawChart(); }) : null, chartHost),
    h('div', { class: 'grid-2' }, recsRow),
    progressionCard(),
    ex.instructions ? h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'How to')), h('p', { style: { lineHeight: 1.55 } }, ex.instructions)) : null,
    ex.common_mistakes ? h('div', { class: 'prev-line' }, h('b', null, 'Common mistakes: '), ex.common_mistakes) : null,
    perfs.length ? h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Recent sessions')), h('div', { class: 'list' }, history)) : h('div', { class: 'prev-line' }, 'No completed sessions yet — your history and records will appear after you log this exercise.'),
    h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'My notes')), note, h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Private to your account. Shown when you do this exercise in a workout.')),
    subs.length ? h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Alternatives')), h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Similar, not identical. Ranked by movement pattern, muscles and your equipment.'),
      h('div', { class: 'list' }, subs.map(s => h('button', { class: 'list-row', onclick: () => navigate('/exercise/' + s.exercise.id) }, h('span', { class: 'grow' }, h('div', { class: 't' }, s.exercise.name), h('div', { class: 's' }, 'Why: ' + s.reasons.slice(0, 3).join(', '))), icon('chevron-right', 18))))) : null,
    !ex.is_system ? h('button', { class: 'btn btn-danger btn-block', onclick: async () => { if (await confirmDialog({ title: 'Delete custom exercise?', message: 'Past workouts keep their records and the exercise name. It will be removed from the library and any routines.', confirmLabel: 'Delete', danger: true })) { for (const r of store.routines) if (r.exercises.some(e => e.exercise_id === id)) await store.saveRoutine({ ...r, exercises: r.exercises.filter(e => e.exercise_id !== id) }); await store.deleteExercise(id); toast('Exercise deleted'); navigate('/exercises'); } } }, icon('trash', 18), 'Delete exercise') : null);
  drawChart();
  return h('div', { class: 'view page-inner' }, hero, sheet);
}
