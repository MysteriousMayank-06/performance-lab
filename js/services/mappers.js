// Convert between the nested local session shape and the normalized Postgres rows.
const SET_COLS = ['set_number','set_type','weight_kg','reps','duration_seconds','distance_meters','assistance_kg','added_weight_kg','left_reps','right_reps','rpe','rir','is_completed','completed_at','notes'];

export function toRemoteSession(s, userId, deviceId) {
  const session = {
    id: s.id, user_id: userId, routine_id: s.routine_id ?? null, name: s.name || 'Workout', status: s.status,
    started_at: s.started_at ?? null, ended_at: s.ended_at ?? null,
    duration_seconds: s.duration_seconds ?? null, session_notes: s.notes ?? null,
    difficulty_rating: s.difficulty ?? null, energy_rating: s.energy ?? null, sleep_rating: s.sleep ?? null,
    source_device_id: deviceId, version: s.version,
  };
  const exercises = [], sets = [];
  (s.exercises || []).forEach((ex, i) => {
    exercises.push({
      id: ex.id, session_id: s.id, exercise_id: ex.exercise_id ?? null, exercise_name_snapshot: ex.name,
      position: i, status: ex.status || 'active', group_id: ex.group_id ?? null, group_type: ex.group_type ?? null,
      target_sets: ex.target_sets ?? null, target_min_reps: ex.target_min_reps ?? null, target_max_reps: ex.target_max_reps ?? null,
      rest_seconds: ex.rest_seconds ?? null, notes: ex.notes ?? null,
      tracking_snapshot: { type: ex.type, primary_muscles: ex.primary_muscles || [], secondary_muscles: ex.secondary_muscles || [] },
    });
    (ex.sets || []).forEach((st, j) => {
      const row = { id: st.id, session_exercise_id: ex.id, client_updated_at: st.client_updated_at ?? null };
      for (const c of SET_COLS) row[c] = c === 'set_number' ? j + 1 : (st[c] ?? (c === 'is_completed' ? false : c === 'set_type' ? 'normal' : null));
      sets.push(row);
    });
  });
  return { session, exercises, sets };
}

export function fromRemoteSession(row) {
  const exs = [...(row.session_exercises || [])].sort((a, b) => a.position - b.position);
  return {
    id: row.id, user_id: row.user_id, routine_id: row.routine_id, name: row.name, status: row.status,
    started_at: row.started_at, ended_at: row.ended_at, duration_seconds: row.duration_seconds,
    notes: row.session_notes, difficulty: row.difficulty_rating, energy: row.energy_rating, sleep: row.sleep_rating,
    version: row.version, serverVersion: row.version, paused_ms: 0, pause_started_at: null,
    exercises: exs.map(ex => ({
      id: ex.id, exercise_id: ex.exercise_id, name: ex.exercise_name_snapshot, status: ex.status,
      group_id: ex.group_id, group_type: ex.group_type, target_sets: ex.target_sets, target_min_reps: ex.target_min_reps,
      target_max_reps: ex.target_max_reps, rest_seconds: ex.rest_seconds, notes: ex.notes,
      type: ex.tracking_snapshot?.type || 'weight_reps',
      primary_muscles: ex.tracking_snapshot?.primary_muscles || [], secondary_muscles: ex.tracking_snapshot?.secondary_muscles || [],
      sets: [...(ex.sets || [])].sort((a, b) => a.set_number - b.set_number).map(st => {
        const o = { id: st.id }; for (const c of SET_COLS) o[c] = st[c]; return o;
      }),
    })),
  };
}

export function toRemoteRoutine(r, userId) {
  return {
    routine: { id: r.id, user_id: userId, name: r.name, description: r.description ?? null, folder_name: r.folder_name ?? null, is_example: !!r.is_example, archived_at: r.archived_at ?? null },
    items: (r.exercises || []).map((e, i) => ({
      id: e.id, routine_id: r.id, exercise_id: e.exercise_id, position: i, target_sets: e.target_sets ?? null,
      target_min_reps: e.target_min_reps ?? null, target_max_reps: e.target_max_reps ?? null, target_weight_kg: e.target_weight_kg ?? null,
      rest_seconds: e.rest_seconds ?? null, target_rpe: e.target_rpe ?? null, target_rir: e.target_rir ?? null,
      group_id: e.group_id ?? null, group_type: e.group_type ?? null, notes: e.notes ?? null,
    })),
  };
}
export function fromRemoteRoutine(row) {
  return {
    id: row.id, name: row.name, description: row.description, folder_name: row.folder_name, is_example: row.is_example, archived_at: row.archived_at,
    exercises: [...(row.routine_exercises || [])].sort((a, b) => a.position - b.position).map(e => ({
      id: e.id, exercise_id: e.exercise_id, target_sets: e.target_sets, target_min_reps: e.target_min_reps, target_max_reps: e.target_max_reps,
      target_weight_kg: e.target_weight_kg, rest_seconds: e.rest_seconds, target_rpe: e.target_rpe, target_rir: e.target_rir,
      group_id: e.group_id, group_type: e.group_type, notes: e.notes,
    })),
  };
}
