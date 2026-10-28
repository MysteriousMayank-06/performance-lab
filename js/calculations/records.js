// Personal records are DERIVED from completed sessions (no separate table to drift out of sync).
import { isWorkingSet, e1rm, setLoadKg, exerciseVolume } from './lifting.js';

/** All completed performances of one exercise, newest first. */
export function performancesFor(exerciseId, sessions) {
  const out = [];
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    for (const ex of s.exercises || []) {
      if (ex.exercise_id !== exerciseId || ex.status === 'skipped') continue;
      const work = (ex.sets || []).filter(isWorkingSet);
      if (!work.length) continue;
      out.push({ session: s, exercise: ex, sets: work, date: s.ended_at || s.started_at });
    }
  }
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Record values across a list of performances. */
export function recordsFrom(perfs, type) {
  const r = { max_weight: null, est_1rm: null, session_volume: null, max_reps: null, longest_duration: null };
  for (const p of perfs) {
    const vol = exerciseVolume({ ...p.exercise, type });
    if (vol && (!r.session_volume || vol > r.session_volume.value)) r.session_volume = { value: vol, date: p.date, sessionId: p.session.id };
    for (const s of p.sets) {
      const load = setLoadKg(s, type);
      if (load && s.reps && (!r.max_weight || load > r.max_weight.value)) r.max_weight = { value: load, reps: s.reps, date: p.date, sessionId: p.session.id };
      const est = load ? e1rm(load, s.reps) : null;
      if (est && (!r.est_1rm || est > r.est_1rm.value)) r.est_1rm = { value: est, isEstimate: s.reps !== 1, date: p.date, sessionId: p.session.id };
      if (!load && s.reps && (!r.max_reps || s.reps > r.max_reps.value)) r.max_reps = { value: s.reps, date: p.date, sessionId: p.session.id };
      if (s.duration_seconds && (!r.longest_duration || s.duration_seconds > r.longest_duration.value)) r.longest_duration = { value: s.duration_seconds, date: p.date, sessionId: p.session.id };
    }
  }
  return r;
}

/** Which records did `session` set compared with everything before it? */
export function detectPRs(session, priorSessions) {
  const prs = [];
  const prior = priorSessions.filter(s => s.id !== session.id && s.status === 'completed');
  for (const ex of session.exercises || []) {
    if (!ex.exercise_id || ex.status === 'skipped') continue;
    const work = (ex.sets || []).filter(isWorkingSet);
    if (!work.length) continue;
    const before = recordsFrom(performancesFor(ex.exercise_id, prior), ex.type);
    const now = recordsFrom([{ session, exercise: ex, sets: work, date: session.ended_at || new Date().toISOString() }], ex.type);
    const hadHistory = performancesFor(ex.exercise_id, prior).length > 0;
    if (!hadHistory) continue; // a first-ever log is a baseline, not a "record"
    const check = (key, label, unit) => {
      if (now[key] && (!before[key] || now[key].value > before[key].value + 1e-9)) {
        prs.push({ exerciseId: ex.exercise_id, name: ex.name, type: key, label, value: now[key].value, previous: before[key]?.value ?? null, unit, estimated: key === 'est_1rm' && now[key].isEstimate });
      }
    };
    if (ex.type === 'weight_reps' || ex.type === 'bodyweight_reps') { check('max_weight', 'Heaviest set', 'kg'); check('est_1rm', 'Estimated 1RM', 'kg'); }
    if (ex.type === 'bodyweight_reps' && !work.some(s => s.added_weight_kg)) check('max_reps', 'Most reps', 'reps');
    if (ex.type === 'isometric') check('longest_duration', 'Longest hold', 's');
  }
  return prs;
}
