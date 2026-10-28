import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { navigate } from '../router.js';
import { toast, openSheet, actionSheet, confirmDialog, field, segmented } from '../components/ui.js';
import { bubbleField } from '../components/bubbles.js';
import { lineChart, barChart } from '../components/chart.js';
import { muscleSetCounts, sessionStats, setLoadKg, isWorkingSet } from '../calculations/lifting.js';
import { performancesFor, recordsFrom, detectPRs } from '../calculations/records.js';
import { weeklyCounts } from '../calculations/consistency.js';
import { kgToDisplay, displayToKg, parseNum, round, storeKg } from '../calculations/units.js';
import { fmtNumber, fmtDate, localISODate, startOfWeek, titleCase } from '../utils/format.js';
import { MUSCLE_GROUPS, MEASUREMENTS } from '../data/vocab.js';
import { downloadCSV } from '../services/export.js';

const RANGES = [{ value: 28, label: '4w' }, { value: 56, label: '8w' }, { value: 84, label: '12w' }, { value: 182, label: '6m' }, { value: 365, label: '1y' }, { value: 0, label: 'All' }];
let range = 56, chosenEx = null, mType = 'waist', smooth = false;

export async function render(params, scope) {
  const root = h('div', { class: 'view page-inner' });
  const unit = store.unit;
  const imperial = store.distUnit === 'mi';
  const heroHost = h('div', { class: 'hero' });
  const body = h('div', { class: 'sheet' });
  root.append(heroHost, body);

  const inRange = () => { const c = range ? Date.now() - range * 86400000 : 0; return store.completed().filter(s => new Date(s.started_at) >= c); };

  function draw() {
    const sessions = inRange();
    drawHero(sessions); drawBody(sessions);
  }

  // ------------------------------------------------------------------ hero (bubbles, like the reference)
  function drawHero(sessions) {
    clear(heroHost);
    const counts = muscleSetCounts(sessions, (id) => store.exercise(id));
    const groups = MUSCLE_GROUPS.map(g => ({ g, n: g.members.reduce((a, m) => a + (counts[m] || 0), 0) })).filter(x => x.n > 0);
    const total = groups.reduce((a, x) => a + x.n, 0);
    heroHost.append(
      h('div', { class: 'between-row' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Workout history', onclick: () => navigate('/history') }, icon('clock', 22)), h('div', { class: 'topbar-title' }, 'Progress'), h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Export data', onclick: exportSheet }, icon('download', 22))),
      h('div', { class: 'seg-glass small', role: 'group', 'aria-label': 'Time range' }, RANGES.map(r => h('button', { 'aria-pressed': String(range === r.value), onclick: () => { range = r.value; draw(); } }, r.label))),
      total ? bubbleField(groups.map(x => ({ key: x.g.key, label: x.g.label, share: (x.n / total) * 100, icon: x.g.icon })))
        : h('div', { class: 'glass empty-glass' }, icon('pie', 36), h('h3', null, 'No training data in this range'), h('p', null, 'Muscle-group balance appears after you complete workouts.')));
    heroHost._total = total; heroHost._groups = groups;
  }

  // ------------------------------------------------------------------ body
  function drawBody(sessions) {
    clear(body);
    const groups = heroHost._groups || [], total = heroHost._total || 0;
    const sets = sessions.reduce((n, s) => n + sessionStats(s).sets, 0);
    const top = [...groups].sort((a, b) => b.n - a.n).slice(0, 2);
    const volume = sessions.reduce((n, s) => n + sessionStats(s).volume, 0);
    body.append(
      h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Training summary'), h('span', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Calculated from completed sets')),
        h('div', { class: 'big-num num' }, String(sets), h('span', null, ' sets')),
        h('div', { class: 'grid-2' },
          h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Workouts'), h('span', { class: 'v' }, String(sessions.length))),
          h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Loaded volume'), h('span', { class: 'v' }, volume ? fmtNumber(kgToDisplay(volume, unit), 0) : '—', volume ? h('small', null, unit) : null)),
          ...top.map(t => h('div', { class: 'stat' }, h('span', { class: 'k' }, t.g.label + ' sets'), h('span', { class: 'v' }, fmtNumber(t.n, 1)))) ),
        h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)', lineHeight: 1.5 } }, 'Muscle bubbles: each working set counts 1 for primary muscles and 0.5 for secondary muscles. Warm-ups and unfinished sets never count. Volume is load × reps for loaded exercises only (dumbbell weight = one dumbbell).')),
      consistencySection(), volumeSection(), strengthSection(sessions), recordsSection(), weightSection(), measurementSection(), gapsSection(sessions));
  }

  function consistencySection() {
    const n = range ? Math.min(26, Math.max(4, Math.round(range / 7))) : 12;
    const wc = weeklyCounts(store.sessions, n, store.profile.week_starts_on);
    return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Weekly workouts')), barChart(wc.map(w => ({ label: n > 14 ? '' : fmtDate(w.from, { day: 'numeric', month: 'short' }).replace(' ', ' '), value: w.count }))),
      h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Consistency is one signal — not a score. Rest weeks are normal.'));
  }
  function volumeSection() {
    const n = range ? Math.min(26, Math.max(4, Math.round(range / 7))) : 12, start = startOfWeek(new Date(), store.profile.week_starts_on);
    const bars = [];
    for (let i = n - 1; i >= 0; i--) { const f = new Date(start); f.setDate(f.getDate() - i * 7); const t = new Date(f); t.setDate(t.getDate() + 7); const v = store.completed().filter(s => { const d = new Date(s.started_at); return d >= f && d < t; }).reduce((a, s) => a + sessionStats(s).volume, 0); bars.push({ label: n > 14 ? '' : fmtDate(f, { day: 'numeric', month: 'short' }).replace(' ', ' '), value: Math.round(kgToDisplay(v, unit)) }); }
    if (!bars.some(b => b.value)) return null;
    return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, `Weekly volume (${unit})`)), barChart(bars, { fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v }), h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Barbell, dumbbell, machine and added-weight work only. Bodyweight, cardio and assisted work is not summed into this figure.'));
  }
  function strengthSection(sessions) {
    const withHist = store.exercises.filter(e => (e.exercise_type === 'weight_reps' || e.exercise_type === 'bodyweight_reps') && performancesFor(e.id, store.sessions).length);
    if (!withHist.length) return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Strength')), h('div', { class: 'empty' }, icon('chart', 36), h('p', null, 'Log a loaded exercise to see its strength trend here.')));
    if (!chosenEx || !withHist.some(e => e.id === chosenEx)) chosenEx = withHist.sort((a, b) => performancesFor(b.id, store.sessions).length - performancesFor(a.id, store.sessions).length)[0].id;
    const sel = h('select', { class: 'select', 'aria-label': 'Exercise' }, withHist.sort((a, b) => a.name.localeCompare(b.name)).map(e => h('option', { value: e.id, selected: e.id === chosenEx }, e.name)));
    const host = h('div');
    const paint = () => {
      clear(host); const ex = store.exercise(chosenEx); const c = range ? Date.now() - range * 86400000 : 0;
      const pts = performancesFor(chosenEx, store.sessions).filter(p => new Date(p.date) >= c).reverse().map(p => { const l = p.sets.map(s => setLoadKg(s, ex.exercise_type)).filter(Boolean); if (!l.length) return null; const y = kgToDisplay(Math.max(...l), unit); return { x: new Date(p.date).getTime(), y, tip: `${fmtNumber(y, 1)} ${unit} · ${fmtDate(p.date)}` }; }).filter(Boolean);
      host.append(lineChart(pts, { fmtY: v => fmtNumber(v, 0) }), h('button', { class: 'link-btn', onclick: () => navigate('/exercise/' + chosenEx) }, 'Open exercise details'));
    };
    sel.addEventListener('change', () => { chosenEx = sel.value; paint(); });
    paint();
    return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, `Top weight (${unit})`)), sel, host);
  }
  function recordsSection() {
    const rows = [];
    for (const ex of store.exercises) {
      if (ex.exercise_type !== 'weight_reps') continue; const p = performancesFor(ex.id, store.sessions); if (!p.length) continue;
      const r = recordsFrom(p, ex.exercise_type).max_weight; if (r) rows.push({ ex, r });
    }
    rows.sort((a, b) => new Date(b.r.date) - new Date(a.r.date));
    return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Personal records')),
      rows.length ? h('div', { class: 'list' }, rows.slice(0, 8).map(({ ex, r }) => h('button', { class: 'list-row', onclick: () => navigate('/exercise/' + ex.id) }, h('span', { class: 'ico pr' }, icon('trophy', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, ex.name), h('div', { class: 's' }, `Heaviest set · ${fmtDate(r.date)}`)), h('span', { class: 'end' }, `${fmtNumber(kgToDisplay(r.value, unit), 1)} ${unit} × ${r.reps}`))))
        : h('p', { class: 'muted' }, 'Records are derived from your completed sets — none yet.'));
  }

  // ------------------------------------------------------------------ body weight
  function weightSection() {
    const all = store.weightSeries(); const c = range ? Date.now() - range * 86400000 : 0;
    const series = all.filter(m => new Date(m.measured_at) >= c);
    const latest = all[all.length - 1], first = series[0];
    let pts = series.map(m => ({ x: new Date(m.measured_at).getTime(), y: kgToDisplay(m.value, unit), tip: `${fmtNumber(kgToDisplay(m.value, unit), 1)} ${unit} · ${fmtDate(m.measured_at)}` }));
    if (smooth && pts.length >= 3) pts = pts.map((p, i) => { const w = pts.slice(Math.max(0, i - 2), i + 1); const y = w.reduce((a, q) => a + q.y, 0) / w.length; return { ...p, y, tip: `3-entry average ${fmtNumber(y, 1)} ${unit} · ${fmtDate(p.x)}` }; });
    const change = series.length >= 2 ? kgToDisplay(series[series.length - 1].value - first.value, unit) : null;
    return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Body weight'), h('button', { class: 'link-btn', onclick: () => weightSheet() }, '+ Add')),
      latest ? h('div', { class: 'grid-3' },
        h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Latest'), h('span', { class: 'v' }, fmtNumber(kgToDisplay(latest.value, unit), 1), h('small', null, unit))),
        h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Previous'), h('span', { class: 'v' }, all.length > 1 ? fmtNumber(kgToDisplay(all[all.length - 2].value, unit), 1) : '—')),
        h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Change'), h('span', { class: 'v' }, change == null ? '—' : (change > 0 ? '+' : '') + fmtNumber(change, 1)))) : null,
      all.length ? [h('button', { class: 'chip' + (smooth ? ' is-on' : ''), style: { alignSelf: 'flex-start' }, 'aria-pressed': String(smooth), onclick: () => { smooth = !smooth; draw(); } }, 'Smooth (3-entry average)'), lineChart(pts, { fmtY: v => fmtNumber(v, 1), color: 'var(--brand)' }),
        h('div', { class: 'list' }, [...all].reverse().slice(0, 4).map(m => h('button', { class: 'list-row compact', onclick: () => actionSheet(`${fmtNumber(kgToDisplay(m.value, unit), 1)} ${unit}`, [{ label: 'Edit', icon: 'edit', onSelect: () => weightSheet(m) }, { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { await store.deleteMeasurement(m.id); toast('Entry deleted'); draw(); } }]) }, h('span', { class: 'grow' }, h('div', { class: 't' }, `${fmtNumber(kgToDisplay(m.value, unit), 1)} ${unit}`), h('div', { class: 's' }, fmtDate(m.measured_at, { day: 'numeric', month: 'short', year: 'numeric' }) + (m.notes ? ' · ' + m.notes : ''))), icon('more', 18)))),
        h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)', lineHeight: 1.5 } }, 'Daily weight swings with water, food and sleep. One reading says nothing about fat or muscle — look at the trend.')]
        : h('div', { class: 'empty' }, icon('scale', 36), h('p', null, 'No body-weight entries yet.'), h('button', { class: 'btn btn-soft btn-sm', onclick: () => weightSheet() }, 'Add first entry')));
  }
  function dateField(initial) { return h('input', { class: 'input', type: 'date', value: localISODate(new Date(initial || Date.now())), max: localISODate(), 'aria-label': 'Date' }); }
  const atNoon = (v) => { const [y, m, d] = v.split('-').map(Number); const dt = new Date(); const base = new Date(y, m - 1, d, dt.getHours(), dt.getMinutes()); return base.toISOString(); };
  function weightSheet(existing) {
    openSheet((b, api) => {
      const v = h('input', { class: 'input', inputmode: 'decimal', value: existing ? round(kgToDisplay(existing.value, unit), 2) : '', placeholder: `Weight in ${unit}`, autofocus: true });
      const d = dateField(existing?.measured_at), n = h('input', { class: 'input', value: existing?.notes || '', maxlength: 120, placeholder: 'Optional note' }); const err = h('div', { class: 'field-error', role: 'alert' });
      b.append(h('div', { class: 'stack' }, field(`Weight (${unit})`, v), field('Date', d), field('Note', n), err, h('button', { class: 'btn btn-ink btn-block', onclick: async () => {
        const x = parseNum(v.value); const kg = displayToKg(x, unit);
        if (x == null || kg < 20 || kg > 500) { err.textContent = 'Enter a realistic body weight.'; return; }
        if (!d.value) { err.textContent = 'Pick a date.'; return; }
        await store.saveMeasurement({ ...(existing || {}), measurement_type: 'weight', value: storeKg(kg), unit: 'kg', measured_at: existing && localISODate(new Date(existing.measured_at)) === d.value ? existing.measured_at : atNoon(d.value), notes: n.value.trim() || null });
        api.close(); toast('Weight saved'); draw();
      } }, 'Save')));
    }, { title: existing ? 'Edit weight' : 'Log body weight' });
  }

  // ------------------------------------------------------------------ measurements
  const toDisp = (cm) => imperial ? cm / 2.54 : cm, fromDisp = (v) => imperial ? v * 2.54 : v;
  function measurementSection() {
    const ms = store.measurements.filter(m => m.measurement_type !== 'weight');
    const typeKey = (m) => m.measurement_type === 'custom' ? 'custom:' + (m.custom_label || 'Custom') : m.measurement_type;
    const labelOf = (k) => k.startsWith('custom:') ? k.slice(7) : MEASUREMENTS.find(x => x.value === k)?.label || titleCase(k);
    const keys = [...new Set(ms.map(typeKey))];
    if (keys.length && !keys.includes(mType)) mType = keys[0];
    const du = imperial ? 'in' : 'cm';
    const mine = ms.filter(m => typeKey(m) === mType).sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
    const c = range ? Date.now() - range * 86400000 : 0;
    const pts = mine.filter(m => new Date(m.measured_at) >= c).map(m => ({ x: new Date(m.measured_at).getTime(), y: toDisp(m.value), tip: `${fmtNumber(toDisp(m.value), 1)} ${du} · ${fmtDate(m.measured_at)}` }));
    return h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Measurements'), h('button', { class: 'link-btn', onclick: () => measurementSheet() }, '+ Add')),
      keys.length ? [h('div', { class: 'chip-row' }, keys.map(k => h('button', { class: 'chip' + (k === mType ? ' is-on' : ''), onclick: () => { mType = k; draw(); } }, labelOf(k)))), lineChart(pts, { fmtY: v => fmtNumber(v, 1) }),
        mine.length ? h('div', { class: 'list' }, [...mine].reverse().slice(0, 3).map(m => h('button', { class: 'list-row compact', onclick: () => actionSheet(labelOf(mType), [{ label: 'Edit', icon: 'edit', onSelect: () => measurementSheet(m) }, { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { await store.deleteMeasurement(m.id); toast('Entry deleted'); draw(); } }]) }, h('span', { class: 'grow' }, h('div', { class: 't' }, `${fmtNumber(toDisp(m.value), 1)} ${du}`), h('div', { class: 's' }, fmtDate(m.measured_at, { day: 'numeric', month: 'short', year: 'numeric' }))), icon('more', 18)))) : null,
        h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Changes are shown as recorded — they don\'t prove muscle gain or fat loss on their own.')]
        : h('div', { class: 'empty' }, icon('ruler', 36), h('p', null, 'No measurements logged. Nothing is estimated for you.'), h('button', { class: 'btn btn-soft btn-sm', onclick: () => measurementSheet() }, 'Add measurement')));
  }
  function measurementSheet(existing) {
    openSheet((b, api) => {
      const t = h('select', { class: 'select' }, MEASUREMENTS.map(m => h('option', { value: m.value, selected: m.value === (existing?.measurement_type || 'waist') }, m.label)));
      const cl = h('input', { class: 'input', placeholder: 'Custom name (e.g. Shoulders)', maxlength: 30, value: existing?.custom_label || '' }); const clF = field('Custom name', cl); clF.hidden = t.value !== 'custom';
      t.addEventListener('change', () => { clF.hidden = t.value !== 'custom'; });
      const v = h('input', { class: 'input', inputmode: 'decimal', value: existing ? round(toDisp(existing.value), 2) : '', placeholder: imperial ? 'Inches' : 'Centimetres' });
      const d = dateField(existing?.measured_at); const err = h('div', { class: 'field-error', role: 'alert' });
      b.append(h('div', { class: 'stack' }, field('Type', t), clF, field(`Value (${imperial ? 'in' : 'cm'})`, v), field('Date', d), err, h('button', { class: 'btn btn-ink btn-block', onclick: async () => {
        const x = parseNum(v.value); if (x == null || x <= 0 || x > 400) { err.textContent = 'Enter a realistic measurement.'; return; }
        if (t.value === 'custom' && !cl.value.trim()) { err.textContent = 'Name your custom measurement.'; return; }
        const label = t.value === 'custom' ? cl.value.trim() : null;
        await store.saveMeasurement({ ...(existing || {}), measurement_type: t.value, custom_label: label, value: Math.round(fromDisp(x) * 100) / 100, unit: 'cm', measured_at: existing && localISODate(new Date(existing.measured_at)) === d.value ? existing.measured_at : atNoon(d.value) });
        if (t.value === 'custom') mType = 'custom:' + label; else mType = t.value; api.close(); toast('Measurement saved'); draw();
      } }, 'Save')));
    }, { title: existing ? 'Edit measurement' : 'Add measurement' });
  }

  function gapsSection(sessions) {
    const gaps = [];
    if (!store.weightSeries().length) gaps.push('No body-weight entries');
    if (!store.measurements.some(m => m.measurement_type !== 'weight')) gaps.push('No body measurements');
    if (sessions.length < 4) gaps.push('Fewer than 4 workouts in this range, so trends are thin');
    if (!gaps.length) return null;
    return h('div', { class: 'rec-card hold' }, h('b', null, 'Missing data'), h('div', { class: 'why' }, gaps.join(' · ')), h('div', { class: 'why' }, 'Observed values come straight from your logs; nothing is invented to fill gaps.'));
  }

  function exportSheet() {
    openSheet((b, api) => {
      const item = (label, sub, fn) => h('button', { class: 'list-row', onclick: async () => { await fn(); api.close(); toast('Export ready'); } }, h('span', { class: 'ico' }, icon('download', 20)), h('span', { class: 'grow' }, h('div', { class: 't' }, label), h('div', { class: 's' }, sub)));
      b.append(h('div', { class: 'list' }, item('Workouts (sets)', 'One row per set with IDs and timestamps', () => downloadCSV('sets')), item('Routines', 'Exercises and targets', () => downloadCSV('routines')), item('Body weight', 'Date and weight in kg', () => downloadCSV('weight')), item('Body measurements', 'Date, type and value in cm', () => downloadCSV('measurements')), item('Personal records', 'Derived from completed sets', () => downloadCSV('records')), item('Full backup (JSON)', 'Everything, for safekeeping', () => downloadCSV('backup'))));
    }, { title: 'Export data' });
  }
  draw();
  return root;
}
