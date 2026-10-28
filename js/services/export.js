// CSV / JSON export. Weights are exported in kg and distances in metres (storage units) so files are unambiguous.
import { store } from './store.js';
import { toCSV, download, localISODate } from '../utils/format.js';
import { performancesFor, recordsFrom } from '../calculations/records.js';
import { isWorkingSet } from '../calculations/lifting.js';

export function buildCSV(kind) {
  if (kind === 'sets') {
    const rows = [];
    for (const s of store.sessions.filter(x => x.status === 'completed')) for (const e of s.exercises) for (const [i, st] of e.sets.entries()) {
      if (!st.is_completed) continue;
      rows.push({ session_id: s.id, session_name: s.name, started_at: s.started_at, ended_at: s.ended_at, duration_seconds: s.duration_seconds, exercise_id: e.exercise_id, exercise: e.name, set_id: st.id, set_number: i + 1, set_type: st.set_type, weight_kg: st.weight_kg, reps: st.reps, added_weight_kg: st.added_weight_kg, assistance_kg: st.assistance_kg, duration_set_seconds: st.duration_seconds, distance_m: st.distance_meters, rpe: st.rpe, rir: st.rir, completed_at: st.completed_at, notes: st.notes });
    }
    return toCSV(rows, ['session_id', 'session_name', 'started_at', 'ended_at', 'duration_seconds', 'exercise_id', 'exercise', 'set_id', 'set_number', 'set_type', 'weight_kg', 'reps', 'added_weight_kg', 'assistance_kg', 'duration_set_seconds', 'distance_m', 'rpe', 'rir', 'completed_at', 'notes']);
  }
  if (kind === 'routines') {
    const rows = store.routines.flatMap(r => r.exercises.map((e, i) => ({ routine_id: r.id, routine: r.name, folder: r.folder_name, position: i + 1, exercise_id: e.exercise_id, exercise: store.exercise(e.exercise_id)?.name, sets: e.target_sets, min_reps: e.target_min_reps, max_reps: e.target_max_reps, weight_kg: e.target_weight_kg, rest_seconds: e.rest_seconds, group_id: e.group_id, notes: e.notes })));
    return toCSV(rows, ['routine_id', 'routine', 'folder', 'position', 'exercise_id', 'exercise', 'sets', 'min_reps', 'max_reps', 'weight_kg', 'rest_seconds', 'group_id', 'notes']);
  }
  if (kind === 'weight') return toCSV(store.weightSeries().map(m => ({ id: m.id, measured_at: m.measured_at, weight_kg: m.value, notes: m.notes })), ['id', 'measured_at', 'weight_kg', 'notes']);
  if (kind === 'measurements') return toCSV(store.measurements.filter(m => m.measurement_type !== 'weight').map(m => ({ id: m.id, measured_at: m.measured_at, type: m.measurement_type === 'custom' ? m.custom_label : m.measurement_type, value_cm: m.value, notes: m.notes })), ['id', 'measured_at', 'type', 'value_cm', 'notes']);
  if (kind === 'records') {
    const rows = [];
    for (const ex of store.exercises) { const p = performancesFor(ex.id, store.sessions); if (!p.length) continue; const r = recordsFrom(p, ex.exercise_type); for (const [k, v] of Object.entries(r)) if (v) rows.push({ exercise_id: ex.id, exercise: ex.name, record: k, value: v.value, estimated: !!v.isEstimate, achieved_at: v.date, session_id: v.sessionId }); }
    return toCSV(rows, ['exercise_id', 'exercise', 'record', 'value', 'estimated', 'achieved_at', 'session_id']);
  }
  return null;
}

export function backupJSON() {
  return JSON.stringify({ app: 'performance-lab', exported_at: new Date().toISOString(), version: 1, profile: store.profile, routines: store.routines, sessions: store.sessions, measurements: store.measurements, custom_exercises: store.exercises.filter(e => !e.is_system), exercise_settings: store.exsettings, exercise_notes: store.exnotes }, null, 2);
}

export function downloadCSV(kind) {
  const stamp = localISODate();
  if (kind === 'backup') return download(`performance-lab-backup-${stamp}.json`, backupJSON(), 'application/json');
  download(`performance-lab-${kind}-${stamp}.csv`, buildCSV(kind));
}

/** Full JSON backup download (used by Profile and the Sync page). */
export function exportAllJSON() { return downloadCSV('backup'); }
