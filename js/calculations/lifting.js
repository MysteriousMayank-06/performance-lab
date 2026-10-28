// Volume + estimated 1RM. All weights in kg.
// Conventions (also documented in README):
//  - Dumbbell weight = weight of ONE dumbbell (not combined). Volume uses that figure x reps, so it
//    is not comparable with barbell volume; muscle-group views show it separately.
//  - Warm-up sets never count toward volume, records, or progression.
//  - Bodyweight exercises count volume only for ADDED weight x reps. Assisted exercises have no volume.
//  - Cardio/isometric/mobility have no load volume (duration/distance are reported separately).
//  - Incomplete sets never count. Missing values are null, never 0.

export const MAX_E1RM_REPS = 12;

export function isWorkingSet(s) { return !!s && s.is_completed && s.set_type !== 'warmup'; }

export function e1rm(weightKg, reps) {
  if (!weightKg || !reps || weightKg <= 0 || reps < 1 || reps > MAX_E1RM_REPS) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30); // Epley
}

export function setLoadKg(set, exerciseType) {
  if (exerciseType === 'weight_reps') return set.weight_kg;
  if (exerciseType === 'bodyweight_reps') return set.added_weight_kg;
  return null;
}

export function setVolume(set, exerciseType) {
  if (!isWorkingSet(set)) return 0;
  const load = setLoadKg(set, exerciseType);
  if (!load || !set.reps) return 0;
  return load * set.reps;
}

export function exerciseVolume(ex) {
  return (ex.sets || []).reduce((sum, s) => sum + setVolume(s, ex.type), 0);
}

export function sessionStats(session) {
  let volume = 0, sets = 0, reps = 0, exercisesDone = 0, skipped = 0;
  for (const ex of session.exercises || []) {
    if (ex.status === 'skipped') { skipped++; continue; }
    const done = (ex.sets || []).filter(isWorkingSet);
    const warm = (ex.sets || []).filter(s => s.is_completed && s.set_type === 'warmup');
    if (done.length || warm.length) exercisesDone++;
    sets += done.length;
    reps += done.reduce((a, s) => a + (s.reps || 0), 0);
    volume += exerciseVolume(ex);
  }
  return { volume, sets, reps, exercisesDone, skipped };
}

/** Best set of an exercise performance, used for "previous performance" summaries. */
export function bestSet(sets, type) {
  let best = null;
  for (const s of sets.filter(isWorkingSet)) {
    const load = setLoadKg(s, type) ?? 0;
    if (!best || load > (setLoadKg(best, type) ?? 0) || (load === (setLoadKg(best, type) ?? 0) && (s.reps || 0) > (best.reps || 0))) best = s;
  }
  return best;
}

/** Counting rule for muscle-group sets: primary = 1 set, secondary = 0.5 set (documented in README). */
export const SECONDARY_WEIGHT = 0.5;
export function muscleSetCounts(sessions, exerciseLookup) {
  const out = {};
  for (const s of sessions) for (const ex of s.exercises || []) {
    const n = (ex.sets || []).filter(isWorkingSet).length;
    if (!n) continue;
    const meta = exerciseLookup(ex.exercise_id) || ex;
    for (const m of meta.primary_muscles || []) out[m] = (out[m] || 0) + n;
    for (const m of meta.secondary_muscles || []) out[m] = (out[m] || 0) + n * SECONDARY_WEIGHT;
  }
  return out;
}
