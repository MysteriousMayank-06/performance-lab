// Active workout: the screen used between sets. Autosaves to IndexedDB on every meaningful change.
import { h, clear, debounce } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store, elapsedSeconds } from '../services/store.js';
import { restTimer } from '../services/timer.js';
import { navigate } from '../router.js';
import { toast, openSheet, confirmDialog, actionSheet, haptic, field } from '../components/ui.js';
import { pickExercise } from '../components/exercise-picker.js';
import { openSetSheet } from '../components/set-sheet.js';
import { fmtSets } from '../components/perf.js';
import { fieldsFor, canComplete } from '../calculations/fields.js';
import { parseNum, kgToDisplay, round } from '../calculations/units.js';
import { isWorkingSet, sessionStats, setLoadKg } from '../calculations/lifting.js';
import { performancesFor, recordsFrom, detectPRs } from '../calculations/records.js';
import { suggestNext } from '../calculations/progression.js';
import { suggestSubstitutes } from '../calculations/substitutes.js';
import { fmtClock, fmtDuration, fmtDate, fmtNumber, titleCase } from '../utils/format.js';
import { uuid } from '../utils/id.js';
import { SET_TYPES } from '../data/vocab.js';

export async function render(params, scope) {
  const session = store.activeSession();
  if (!session) { navigate('/workout', { replace: true }); return h('div'); }

  // ------------------------------------------------------------ persistence
  let dirty = false;
  const persist = async () => { dirty = false; await store.saveSession(session); };
  const queueSave = debounce(persist, 350);
  const touchSoon = () => { dirty = true; queueSave(); };            // typing: debounced
  const touch = () => { dirty = true; queueSave.cancel(); return persist(); }; // taps & structural edits: saved immediately
  const flush = () => { if (dirty) { queueSave.cancel(); persist(); } };
  scope.listen(window, 'pl:flush', flush);
  scope.listen(document, 'visibilitychange', () => { if (document.hidden) flush(); });
  scope.listen(window, 'beforeunload', (e) => { if (dirty) { flush(); e.preventDefault(); e.returnValue = ''; } });
  scope.add(() => flush());

  // keep the screen on while training (best effort; not supported everywhere)
  let lock = null;
  const getLock = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported or denied */ } };
  getLock(); scope.listen(document, 'visibilitychange', () => { if (!document.hidden) getLock(); });
  scope.add(() => { lock?.release?.().catch(() => {}); });

  // ------------------------------------------------------------ undo stack for structural edits
  const history = [];
  const snapshot = () => { history.push(JSON.stringify(session.exercises)); if (history.length > 25) history.shift(); updateUndo(); };
  const undo = () => { const s = history.pop(); if (!s) return; session.exercises = JSON.parse(s); touch(); drawAll(); updateUndo(); toast('Undone'); };

  const unit = store.unit, dUnit = store.distUnit;
  const prevCache = new Map();
  const prev = (ex) => { if (!prevCache.has(ex.exercise_id)) prevCache.set(ex.exercise_id, ex.exercise_id ? performancesFor(ex.exercise_id, store.sessions.filter(s => s.id !== session.id)) : []); return prevCache.get(ex.exercise_id); };
  const bestBefore = (ex) => { const p = prev(ex); return p.length ? recordsFrom(p, ex.type).max_weight?.value ?? null : null; };

  // ------------------------------------------------------------ header
  const clockEl = h('div', { class: 'aw-clock num', role: 'timer', 'aria-label': 'Workout time' });
  const subEl = h('div', { class: 'aw-sub' });
  const barEl = h('span');
  const pauseBtn = h('button', { class: 'btn btn-glass btn-sm', onclick: togglePause });
  const undoBtn = h('button', { class: 'icon-btn btn-glass', 'aria-label': 'Undo last change', onclick: undo });
  undoBtn.append(icon('undo', 20));
  function updateUndo() { undoBtn.disabled = !history.length; undoBtn.style.opacity = history.length ? 1 : .4; }

  function progress() {
    const ex = session.exercises.filter(e => e.status !== 'skipped');
    const total = ex.reduce((n, e) => n + e.sets.length, 0), done = ex.reduce((n, e) => n + e.sets.filter(s => s.is_completed).length, 0);
    return { total, done, ex: ex.length, exDone: ex.filter(e => e.sets.length && e.sets.every(s => s.is_completed)).length };
  }
  function updateHeader() {
    const p = progress();
    clockEl.textContent = fmtClock(elapsedSeconds(session));
    subEl.textContent = session.status === 'paused' ? 'Paused' : p.ex ? `${p.exDone} of ${p.ex} exercises · ${p.done}/${p.total} sets` : 'Add your first exercise';
    barEl.style.width = (p.total ? (p.done / p.total) * 100 : 0) + '%';
    clear(pauseBtn); pauseBtn.append(icon(session.status === 'paused' ? 'play' : 'pause', 16), session.status === 'paused' ? 'Resume' : 'Pause');
  }
  async function togglePause() {
    if (session.status === 'paused') { session.paused_ms = (session.paused_ms || 0) + (Date.now() - new Date(session.pause_started_at).getTime()); session.pause_started_at = null; session.status = 'in_progress'; }
    else { session.pause_started_at = new Date().toISOString(); session.status = 'paused'; }
    await persist(); updateHeader();
  }
  scope.interval(updateHeader, 1000);

  const title = h('button', { class: 'aw-title', 'aria-label': 'Rename workout', onclick: rename }, session.name, icon('edit', 14));
  function rename() {
    openSheet((body, api) => {
      const i = h('input', { class: 'input', value: session.name, maxlength: 60, autofocus: true });
      body.append(h('div', { class: 'stack' }, field('Workout name', i), h('button', { class: 'btn btn-ink btn-block', onclick: () => { session.name = i.value.trim() || 'Workout'; title.firstChild.textContent = session.name; touch(); api.close(); } }, 'Save')));
    }, { title: 'Rename' });
  }

  const header = h('div', { class: 'aw-top' },
    h('div', { class: 'between-row' },
      h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Minimise workout', onclick: () => { flush(); navigate('/home'); } }, icon('chevron-down', 22)),
      title,
      h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Workout options', onclick: () => actionSheet('Workout', [
        { label: 'Rename workout', icon: 'edit', onSelect: rename },
        { label: 'Workout notes', icon: 'list', onSelect: notesSheet },
        { label: 'Discard workout', icon: 'trash', danger: true, onSelect: discard },
      ]) }, icon('more', 22))),
    clockEl, subEl, h('div', { class: 'aw-progress' }, barEl),
    h('div', { class: 'row aw-actions' }, pauseBtn, h('button', { class: 'btn btn-glass btn-sm', onclick: addExercise }, icon('plus', 16), 'Exercise'), undoBtn));

  function notesSheet() {
    openSheet((body, api) => {
      const t = h('textarea', { class: 'textarea', maxlength: 1000, placeholder: 'How is the session going?' }, session.notes || '');
      body.append(h('div', { class: 'stack' }, t, h('button', { class: 'btn btn-ink btn-block', onclick: () => { session.notes = t.value.trim(); touch(); api.close(); } }, 'Save notes')));
    }, { title: 'Workout notes' });
  }

  // ------------------------------------------------------------ exercise list
  const listEl = h('div', { class: 'stack ex-stack' });

  function groupPos(i) { const g = session.exercises[i].group_id; if (!g) return null; const a = session.exercises[i - 1]?.group_id === g, b = session.exercises[i + 1]?.group_id === g; return a && b ? 'mid' : a ? 'end' : b ? 'start' : null; }

  function drawAll() {
    const y = $page()?.scrollTop;
    clear(listEl);
    if (!session.exercises.length) listEl.append(h('div', { class: 'empty' }, icon('dumbbell', 40), h('h3', null, 'Empty workout'), h('p', null, 'Add an exercise to start logging sets. Everything saves automatically, even offline.'), h('button', { class: 'btn btn-ink', onclick: addExercise }, icon('plus', 18), 'Add exercise')));
    session.exercises.forEach((ex, i) => listEl.append(card(ex, i)));
    updateHeader(); updateUndo();
    if (y != null) requestAnimationFrame(() => { const p = $page(); if (p) p.scrollTop = y; });
  }
  const $page = () => document.getElementById('page');
  function redrawCard(ex) { const i = session.exercises.indexOf(ex); const old = listEl.children[i]; if (old) old.replaceWith(card(ex, i, false)); updateHeader(); }

  function card(ex, i, animate = true) {
    const fields = fieldsFor(ex.type, unit, dUnit);
    const perfs = prev(ex), last = perfs[0];
    const setting = store.exSetting(ex.exercise_id);
    const setupNote = store.exNote(ex.exercise_id);
    const gp = groupPos(i);
    const best = bestBefore(ex);
    let workN = 0;

    const rows = ex.sets.map((s, si) => {
      if (s.set_type !== 'warmup') workN++;
      const t = SET_TYPES.find(x => x.value === (s.set_type || 'normal'));
      const label = s.set_type === 'warmup' || (s.set_type && s.set_type !== 'normal') ? t.short : String(workN);
      const inputs = fields.map(f => {
        const inp = h('input', { class: 'num-input', inputmode: f.mode, enterkeyhint: 'next', autocomplete: 'off', value: f.toDisp(s[f.key]) ?? '', placeholder: last?.sets?.[si] ? String(f.toDisp(last.sets[si][f.key]) ?? '') : '0', 'aria-label': `${f.label} for set ${si + 1} of ${ex.name}` });
        inp.addEventListener('focus', () => inp.select());
        inp.addEventListener('input', () => {
          let v = f.fromDisp(parseNum(inp.value)); if (v != null && v < 0) v = null; s[f.key] = v;
          if (s.is_completed && !canComplete(s, ex.type)) { s.is_completed = false; s.completed_at = null; row.classList.remove('done'); updateHeader(); }
          s.client_updated_at = new Date().toISOString(); touchSoon();
        });
        return inp;
      });
      const pr = s.is_completed && s.set_type !== 'warmup' && best != null && (setLoadKg(s, ex.type) || 0) > best + 1e-9;
      const check = h('button', { class: 'check-btn', 'aria-pressed': String(!!s.is_completed), 'aria-label': s.is_completed ? `Undo set ${si + 1}` : `Complete set ${si + 1}`, onclick: () => toggleSet(ex, s, row) }, icon('check', 22));
      const idx = h('button', { class: 'idx' + (s.set_type === 'warmup' ? ' warm' : ''), 'aria-label': `Set ${si + 1} options`, onclick: () => openSetSheet({ set: s, type: ex.type, index: si, onSave: (n) => { Object.assign(s, n, { client_updated_at: new Date().toISOString() }); if (s.is_completed && !canComplete(s, ex.type)) { s.is_completed = false; s.completed_at = null; } touch(); redrawCard(ex); }, onDelete: () => { snapshot(); ex.sets.splice(si, 1); touch(); redrawCard(ex); } }) }, label);
      const row = h('div', { class: 'set-row' + (s.is_completed ? ' done' : '') + (fields.length === 1 ? ' three' : ''), dataset: { set: s.id } }, idx, ...inputs, check, pr ? h('span', { class: 'badge badge-pr pr-tag' }, 'PR') : null);
      return row;
    });

    // suggestion (transparent rule, shown only when it says "increase")
    let sug = null;
    if (setting.progression_enabled !== false && perfs.length >= 2 && (ex.type === 'weight_reps' || ex.type === 'bodyweight_reps')) {
      const r = suggestNext(perfs, ex.type, { minReps: ex.target_min_reps ?? setting.min_reps ?? 8, maxReps: ex.target_max_reps ?? setting.max_reps ?? 12, incrementKg: setting.increment_kg ?? (unit === 'lb' ? 2.268 : 2.5), targetSets: ex.target_sets || 3 });
      if (r.status === 'increase') sug = r;
    }
    const target = ex.target_sets ? `Target ${ex.target_sets} × ${ex.target_min_reps && ex.target_max_reps ? `${ex.target_min_reps}–${ex.target_max_reps}` : ex.target_max_reps || '—'}` : null;
    const head = h('div', { class: 'set-head' + (fields.length === 1 ? ' three' : '') }, h('span', null, 'SET'), ...fields.map(f => h('span', null, f.label)), h('span', { 'aria-hidden': 'true' }, ''));

    const node = h('article', { class: `ex-card${ex.status === 'skipped' ? ' skipped' : ''}${gp ? ' grp grp-' + gp : ''}${animate ? ' pop-in' : ''}`, 'aria-label': ex.name },
      gp === 'start' || (gp && !session.exercises[i - 1]?.group_id) ? h('div', { class: 'grp-label' }, icon('superset', 14), titleCase(ex.group_type || 'superset')) : null,
      h('div', { class: 'ex-head' },
        h('button', { class: 'ex-name grow', onclick: () => ex.exercise_id && (flush(), navigate('/exercise/' + ex.exercise_id)) }, h('div', null, ex.name), h('div', { class: 'ex-meta' }, [...(ex.primary_muscles || []).map(titleCase)].join(', '), target ? ` · ${target}` : '', ex.status === 'skipped' ? ' · Skipped' : '')),
        h('button', { class: 'icon-btn', 'aria-label': `Options for ${ex.name}`, onclick: () => exerciseMenu(ex, i) }, icon('more', 20))),
      last ? h('div', { class: 'prev-line' }, 'Last time: ', h('b', null, fmtSets(last.sets, ex.type, unit, dUnit)), h('span', { class: 'faint' }, ` · ${fmtDate(last.date)}`)) : h('div', { class: 'prev-line faint' }, 'No previous sessions — this will be your baseline.'),
      setupNote ? h('div', { class: 'prev-line note' }, icon('info', 14), setupNote) : null,
      sug ? h('button', { class: 'rec-chip', onclick: () => { ex.sets.filter(s => !s.is_completed && s.set_type !== 'warmup').forEach(s => { s.weight_kg = sug.suggestedWeightKg; }); touch(); redrawCard(ex); toast('Applied suggested weight'); } }, icon('arrow-up-right', 14), `Suggested: ${fmtNumber(kgToDisplay(sug.suggestedWeightKg, unit), 1)} ${unit} — tap to apply`) : null,
      ex.status === 'skipped' ? null : h('div', { class: 'stack', style: { gap: '4px' } }, head, ...rows),
      ex.status === 'skipped' ? h('button', { class: 'btn btn-soft btn-sm', onclick: () => { ex.status = 'active'; touch(); redrawCard(ex); } }, 'Restore exercise') : h('div', { class: 'grid-2' },
        h('button', { class: 'btn btn-soft btn-sm', onclick: () => addSet(ex) }, icon('plus', 16), 'Add set'),
        h('button', { class: 'btn btn-soft btn-sm', onclick: () => addSet(ex, 'warmup') }, icon('flame', 16), 'Warm-up')),
      ex.showNotes || ex.notes ? h('textarea', { class: 'textarea compact', placeholder: 'Exercise notes (setup, cues…)', 'aria-label': `Notes for ${ex.name}`, oninput: (e) => { ex.notes = e.target.value; touchSoon(); } }, ex.notes || '') : null);
    return node;
  }

  function addSet(ex, type = 'normal') {
    const lastSet = [...ex.sets].reverse().find(s => type === 'warmup' ? s.set_type === 'warmup' : s.set_type !== 'warmup') || ex.sets[ex.sets.length - 1];
    const ns = { id: uuid(), set_type: type, is_completed: false, completed_at: null, weight_kg: type === 'warmup' && lastSet?.weight_kg ? Math.round(lastSet.weight_kg * 0.5 * 4) / 4 : lastSet?.weight_kg ?? null, reps: lastSet?.reps ?? null, duration_seconds: lastSet?.duration_seconds ?? null, distance_meters: lastSet?.distance_meters ?? null, added_weight_kg: lastSet?.added_weight_kg ?? null, assistance_kg: lastSet?.assistance_kg ?? null };
    if (type === 'warmup') { const at = ex.sets.findIndex(s => s.set_type !== 'warmup'); ex.sets.splice(at < 0 ? ex.sets.length : at, 0, ns); } else ex.sets.push(ns);
    touch(); redrawCard(ex);
    requestAnimationFrame(() => listEl.querySelector(`[data-set="${ns.id}"] input`)?.focus());
  }

  function toggleSet(ex, s, row) {
    if (s.is_completed) {
      s.is_completed = false; s.completed_at = null; s.client_updated_at = new Date().toISOString(); touch(); redrawCard(ex); return;
    }
    if (!canComplete(s, ex.type)) {
      row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); haptic(30);
      toast(ex.type === 'cardio' ? 'Enter a duration first' : ex.type === 'isometric' || ex.type === 'mobility' ? 'Enter the hold time first' : 'Enter reps first');
      row.querySelector('input:placeholder-shown, input')?.focus(); return;
    }
    s.is_completed = true; s.completed_at = new Date().toISOString(); s.client_updated_at = s.completed_at; touch(); haptic(14);
    const idx = session.exercises.indexOf(ex);
    const inGroupMid = ex.group_id && session.exercises[idx + 1]?.group_id === ex.group_id;
    redrawCard(ex);
    const fresh = listEl.querySelector(`[data-set="${s.id}"]`); fresh?.classList.add('just-done');
    const allDone = session.exercises.every(e => e.status === 'skipped' || e.sets.every(x => x.is_completed));
    if (!inGroupMid && !allDone && s.set_type !== 'warmup') restTimer.start(ex.rest_seconds || store.profile.default_rest_seconds);
    else if (!inGroupMid && !allDone) restTimer.start(Math.min(45, ex.rest_seconds || 45));
    toast('Set logged', { action: 'Undo', onAction: () => { s.is_completed = false; s.completed_at = null; touch(); redrawCard(ex); restTimer.skip(); }, duration: 2600 });
  }

  // ------------------------------------------------------------ exercise-level actions
  async function addExercise() {
    const meta = await pickExercise('Add exercise'); if (!meta) return;
    snapshot(); const ex = store.makeSessionExercise(meta, { sessionId: session.id }); session.exercises.push(ex); touch(); drawAll();
    requestAnimationFrame(() => listEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function exerciseMenu(ex, i) {
    const items = [
      { label: 'Exercise details', icon: 'info', onSelect: () => { flush(); navigate('/exercise/' + ex.exercise_id); } },
      { label: ex.showNotes || ex.notes ? 'Hide notes' : 'Add notes', icon: 'list', onSelect: () => { ex.showNotes = !ex.showNotes; if (!ex.showNotes && !ex.notes) delete ex.showNotes; redrawCard(ex); } },
      { label: 'Replace exercise', icon: 'repeat', onSelect: () => replaceExercise(ex) },
    ];
    if (i > 0) items.push({ label: 'Move up', icon: 'arrow-up', onSelect: () => move(i, -1) });
    if (i < session.exercises.length - 1) items.push({ label: 'Move down', icon: 'arrow-down', onSelect: () => move(i, 1) });
    if (ex.group_id) items.push({ label: 'Remove from superset', icon: 'x', onSelect: () => { snapshot(); ungroup(ex); touch(); drawAll(); } });
    else if (i < session.exercises.length - 1) items.push({ label: 'Superset with next exercise', icon: 'superset', onSelect: () => { snapshot(); const nx = session.exercises[i + 1]; const g = nx.group_id || uuid(); ex.group_id = g; ex.group_type = 'superset'; nx.group_id = g; nx.group_type = 'superset'; touch(); drawAll(); } });
    items.push({ label: ex.status === 'skipped' ? 'Restore exercise' : 'Skip exercise', icon: 'skip', onSelect: () => { snapshot(); ex.status = ex.status === 'skipped' ? 'active' : 'skipped'; touch(); drawAll(); } });
    items.push({ label: 'Remove exercise', icon: 'trash', danger: true, onSelect: () => removeExercise(ex) });
    actionSheet(ex.name, items);
  }
  function ungroup(ex) { const g = ex.group_id; ex.group_id = null; ex.group_type = null; const rest = session.exercises.filter(e => e.group_id === g); if (rest.length === 1) { rest[0].group_id = null; rest[0].group_type = null; } }
  function move(i, d) { snapshot(); const a = session.exercises; [a[i], a[i + d]] = [a[i + d], a[i]]; touch(); drawAll(); }
  async function removeExercise(ex) {
    const done = ex.sets.filter(s => s.is_completed).length;
    if (done && !(await confirmDialog({ title: 'Remove exercise?', message: `${done} completed set${done > 1 ? 's' : ''} will be removed from this workout. You can undo right after.`, confirmLabel: 'Remove', danger: true }))) return;
    snapshot(); if (ex.group_id) ungroup(ex); session.exercises = session.exercises.filter(e => e !== ex); touch(); drawAll();
    toast('Exercise removed', { action: 'Undo', onAction: undo });
  }
  function replaceExercise(ex) {
    const meta = store.exercise(ex.exercise_id);
    const subs = meta ? suggestSubstitutes(meta, store.exercises, { equipment: store.profile.settings.equipment }) : [];
    const doReplace = async (m) => {
      const done = ex.sets.filter(s => s.is_completed).length;
      if (done && !(await confirmDialog({ title: 'Replace exercise?', message: 'Completed sets on this exercise will be discarded. The original routine is not changed.', confirmLabel: 'Replace', danger: true }))) return;
      snapshot(); const n = store.makeSessionExercise(m, { sessionId: session.id, target_sets: ex.sets.filter(s => s.set_type !== 'warmup').length || 3, rest_seconds: ex.rest_seconds });
      n.group_id = ex.group_id; n.group_type = ex.group_type; session.exercises[session.exercises.indexOf(ex)] = n; touch(); drawAll(); toast(`Swapped to ${m.name}`, { action: 'Undo', onAction: undo });
    };
    openSheet((body, api) => {
      body.append(h('div', { class: 'stack' },
        subs.length ? h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, 'Suggested by movement pattern, muscles and your equipment. Similar — not identical.') : null,
        h('div', { class: 'list' }, subs.map(s => h('button', { class: 'list-row', onclick: () => { api.close(); doReplace(s.exercise); } },
          h('span', { class: 'grow' }, h('div', { class: 't' }, s.exercise.name), h('div', { class: 's' }, 'Why: ' + s.reasons.slice(0, 3).join(', '))), icon('chevron-right', 18)))),
        h('button', { class: 'btn btn-soft btn-block', onclick: async () => { api.close(); const m = await pickExercise('Choose replacement'); if (m) doReplace(m); } }, icon('search', 18), 'Search all exercises')));
    }, { title: 'Replace ' + ex.name });
  }

  // ------------------------------------------------------------ finish / discard
  function summarize() {
    const st = sessionStats(session);
    const copy = { ...session, ended_at: new Date().toISOString() };
    const prs = detectPRs(copy, store.completed());
    const planned = session.exercises.filter(e => e.status !== 'skipped').reduce((n, e) => n + e.sets.length, 0);
    const prevSame = store.completed().find(s => (session.routine_id && s.routine_id === session.routine_id) || (!session.routine_id && s.name === session.name));
    return { st, prs, planned, prevSame, prevStats: prevSame ? sessionStats(prevSame) : null };
  }
  function finish() {
    flush();
    const sm = summarize();
    openSheet((body, api) => {
      let difficulty = null;
      const stat = (k, v, sub) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v, sub ? h('small', null, sub) : null));
      const unfinished = sm.planned - session.exercises.reduce((n, e) => n + e.sets.filter(s => s.is_completed).length, 0);
      const vol = kgToDisplay(sm.st.volume, unit);
      const cmp = [];
      if (sm.prevStats && sm.st.volume && sm.prevStats.volume) { const d = ((sm.st.volume - sm.prevStats.volume) / sm.prevStats.volume) * 100; cmp.push(`Volume ${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(0)}% vs ${fmtDate(sm.prevSame.started_at)}`); }
      if (sm.prevStats) { const ds = sm.st.sets - sm.prevStats.sets; cmp.push(ds === 0 ? 'Same number of sets as last time' : `${Math.abs(ds)} ${ds > 0 ? 'more' : 'fewer'} sets than last time`); }
      const notes = h('textarea', { class: 'textarea', placeholder: 'Notes (optional)', maxlength: 1000 }, session.notes || '');
      const diff = h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': 'How hard was it?' }, [1, 2, 3, 4, 5].map(n => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', class: 'chip diff', onclick: (e) => { difficulty = difficulty === n ? null : n; diff.querySelectorAll('.chip').forEach((c, i) => { const on = difficulty === i + 1; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', String(on)); }); } }, ['Easy', 'Light', 'Solid', 'Hard', 'Max'][n - 1])));
      const save = h('button', { class: 'btn btn-ink btn-block', onclick: async () => {
        save.setAttribute('aria-busy', 'true');
        const now = new Date();
        if (session.pause_started_at) { session.paused_ms = (session.paused_ms || 0) + (now - new Date(session.pause_started_at)); session.pause_started_at = null; }
        session.ended_at = now.toISOString(); session.status = 'completed'; session.difficulty = difficulty; session.notes = notes.value.trim();
        session.duration_seconds = elapsedSeconds(session, now.getTime());
        session.exercises.forEach(e => { e.sets = e.sets.filter(s => s.is_completed); e.showNotes = undefined; if (!e.sets.length && e.status !== 'skipped') e.status = 'skipped'; else if (e.status === 'active') e.status = 'done'; });
        restTimer.skip(); dirty = false; await store.saveSession(session);
        api.close(); toast('Workout saved'); navigate('/session/' + session.id + '?done=1');
      } }, 'Save workout');
      body.append(h('div', { class: 'stack' },
        sm.st.sets === 0 ? h('div', { class: 'rec-card decline' }, h('b', null, 'No completed sets yet'), h('span', { class: 'why' }, 'Saving now records an empty workout. You can keep going or discard it instead.')) : null,
        h('div', { class: 'grid-2' }, stat('Duration', fmtDuration(elapsedSeconds(session))), stat('Sets done', `${sm.st.sets}`, `/${sm.planned}`), stat('Reps', String(sm.st.reps)), stat('Volume', sm.st.volume ? fmtNumber(vol, 0) : '—', sm.st.volume ? unit : '')),
        unfinished > 0 ? h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `${unfinished} unfinished set${unfinished > 1 ? 's' : ''} won't be saved.`) : null,
        sm.prs.length ? h('div', { class: 'stack' }, h('h3', null, 'Records'), ...sm.prs.slice(0, 5).map(p => h('div', { class: 'pr-row' }, h('span', { class: 'medal' }, icon('trophy', 20)), h('span', null, h('b', null, p.name), h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' } }, `${p.label}${p.estimated ? ' (estimated)' : ''}: ${p.unit === 'kg' ? fmtNumber(kgToDisplay(p.value, unit), 1) + ' ' + unit : Math.round(p.value) + ' ' + p.unit}`))))) : null,
        cmp.length ? h('div', { class: 'prev-line' }, cmp.join(' · ')) : null,
        h('div', { class: 'field' }, h('label', null, 'How did it feel?'), diff), notes,
        save, h('button', { class: 'btn btn-soft btn-block', onclick: () => api.close() }, 'Keep training')));
    }, { title: 'Finish workout', tall: true });
  }
  async function discard() {
    if (!(await confirmDialog({ title: 'Discard workout?', message: 'This workout will not count toward your history or records.', confirmLabel: 'Discard', danger: true }))) return;
    session.status = 'discarded'; session.ended_at = new Date().toISOString(); dirty = false; restTimer.skip(); await store.saveSession(session); toast('Workout discarded'); navigate('/workout');
  }

  const sheet = h('div', { class: 'sheet aw-sheet' }, listEl,
    h('div', { class: 'finish-bar' }, h('button', { class: 'btn btn-soft', onclick: addExercise }, icon('plus', 18), 'Add exercise'), h('button', { class: 'btn btn-ink', onclick: finish }, icon('flag', 18), 'Finish')));
  drawAll(); updateUndo();
  return h('div', { class: 'view page-inner' }, header, sheet);
}
