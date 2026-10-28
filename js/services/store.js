// Local-first data store. Everything reads from memory (hydrated from IndexedDB) and every write
// goes to IndexedDB FIRST, then into the sync outbox. The UI never waits on the network.
import { Local } from '../db.js';
import { uuid } from '../utils/id.js';
import { SYSTEM_EXERCISES } from '../data/exercises.generated.js';
import { performancesFor } from '../calculations/records.js';
import { isWorkingSet } from '../calculations/lifting.js';

const listeners = new Set();
const DEFAULT_PROFILE = {
  display_name: '', birth_year: null, height_cm: null, preferred_weight_unit: 'kg', preferred_distance_unit: 'km',
  preferred_theme: 'light', training_experience: null, primary_goal: null, week_starts_on: 1, default_rest_seconds: 90,
  weekly_schedule: {}, settings: { equipment: [], reminders: { enabled: false, time: '18:00' }, sound: true, vibrate: true, plates: null },
  onboarding_completed: false,
};

export const store = {
  user: null, profile: { ...DEFAULT_PROFILE }, exercises: [], routines: [], sessions: [], measurements: [],
  exsettings: {}, exnotes: {}, outboxKeys: new Set(), conflictIds: new Set(),

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(what = 'change') { listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } }); },

  async init(user) {
    this.user = user;
    await Local.init(user.id);
    const [prof, ex, rt, ss, ms, es, en, ob, cf] = await Promise.all([
      Local.kvGet('profile'), Local.all('exercises'), Local.all('routines'), Local.all('sessions'), Local.all('measurements'),
      Local.all('exsettings'), Local.all('exnotes'), Local.all('outbox'), Local.all('conflicts'),
    ]);
    this.profile = { ...DEFAULT_PROFILE, ...(prof || {}), settings: { ...DEFAULT_PROFILE.settings, ...(prof?.settings || {}) } };
    const custom = ex.filter(e => !e.is_system);
    const sysMap = new Map(SYSTEM_EXERCISES.map(e => [e.id, e]));
    ex.filter(e => e.is_system).forEach(e => sysMap.set(e.id, e));
    this.exercises = [...sysMap.values(), ...custom];
    this.routines = rt.filter(r => !r._deleted);
    this.sessions = ss.filter(s => !s._deleted).sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
    this.measurements = ms.filter(m => !m._deleted).sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));
    this.exsettings = Object.fromEntries(es.map(e => [e.exercise_id, e]));
    this.exnotes = Object.fromEntries(en.map(e => [e.exercise_id, e]));
    this.outboxKeys = new Set(ob.map(o => o.key));
    this.conflictIds = new Set(cf.map(c => c.id));
    this.emit('init');
  },

  async enqueue(kind, id, extra = {}) {
    const key = `${kind}:${id}`;
    await Local.put('outbox', { key, kind, id, ts: Date.now(), tries: 0, error: null, ...extra });
    this.outboxKeys.add(key);
    window.dispatchEvent(new Event('pl:outbox'));
  },
  isPending(kind, id) { return this.outboxKeys.has(`${kind}:${id}`); },

  // ---------------------------------------------------------------- profile
  async updateProfile(patch) {
    this.profile = { ...this.profile, ...patch, settings: { ...this.profile.settings, ...(patch.settings || {}) } };
    await Local.kvSet('profile', this.profile);
    await this.enqueue('profile', this.user.id);
    this.emit('profile');
  },
  get unit() { return this.profile.preferred_weight_unit; },
  get distUnit() { return this.profile.preferred_distance_unit; },

  // -------------------------------------------------------------- exercises
  exercise(id) { return this.exercises.find(e => e.id === id) || null; },
  exerciseBySlug(slug) { return this.exercises.find(e => e.slug === slug) || null; },
  async saveExercise(ex) {
    const row = { ...ex, id: ex.id || uuid(), is_system: false, owner_id: this.user.id };
    await Local.put('exercises', row);
    const i = this.exercises.findIndex(e => e.id === row.id);
    if (i >= 0) this.exercises[i] = row; else this.exercises.push(row);
    await this.enqueue('exercise', row.id);
    this.emit('exercises');
    return row;
  },
  async deleteExercise(id) {
    this.exercises = this.exercises.filter(e => e.id !== id);
    await Local.del('exercises', id);
    await this.enqueue('exercise-del', id);
    this.emit('exercises');
  },
  exSetting(id) { return this.exsettings[id] || { exercise_id: id, is_favorite: false, progression_enabled: true, progression_rule: 'double' }; },
  async saveExSetting(id, patch) {
    const row = { ...this.exSetting(id), ...patch, exercise_id: id };
    this.exsettings[id] = row; await Local.put('exsettings', row);
    await this.enqueue('exsetting', id); this.emit('exsettings');
  },
  exNote(id) { return this.exnotes[id]?.content || ''; },
  async saveExNote(id, content) {
    const row = { id: this.exnotes[id]?.id || uuid(), exercise_id: id, content, note_type: 'setup' };
    this.exnotes[id] = row; await Local.put('exnotes', row);
    await this.enqueue('exnote', id); this.emit('exnotes');
  },

  // --------------------------------------------------------------- routines
  async saveRoutine(r) {
    const row = { ...r, id: r.id || uuid(), updated_local: Date.now() };
    row.exercises = (row.exercises || []).map(e => ({ ...e, id: e.id || uuid() }));
    await Local.put('routines', row);
    const i = this.routines.findIndex(x => x.id === row.id);
    if (i >= 0) this.routines[i] = row; else this.routines.unshift(row);
    await this.enqueue('routine', row.id); this.emit('routines');
    return row;
  },
  async deleteRoutine(id) {
    this.routines = this.routines.filter(r => r.id !== id);
    await Local.del('routines', id); await this.enqueue('routine-del', id);
    // sessions keep their own copy of everything, so history is unaffected
    this.emit('routines');
  },
  async duplicateRoutine(id) {
    const r = this.routines.find(x => x.id === id); if (!r) return null;
    return this.saveRoutine({ ...structuredClone(r), id: uuid(), name: `${r.name} (copy)`, is_example: false, archived_at: null, exercises: r.exercises.map(e => ({ ...e, id: uuid() })) });
  },
  async addExampleRoutines() {
    const mk = (name, desc, items) => ({
      name, description: desc, folder_name: 'Examples', is_example: true,
      exercises: items.map(([slug, sets, min, max, rest]) => ({ exercise_id: this.exerciseBySlug(slug).id, target_sets: sets, target_min_reps: min, target_max_reps: max, rest_seconds: rest })),
    });
    const defs = [
      mk('Full Body (example)', 'Example routine — edit freely. Not a personalised prescription.', [['back-squat',3,6,8,150],['barbell-bench-press',3,6,8,150],['barbell-row',3,8,10,120],['overhead-press',2,8,10,120],['plank',2,30,60,60]]),
      mk('Upper (example)', 'Example upper-body day — edit freely.', [['barbell-bench-press',3,6,8,150],['lat-pulldown',3,8,12,90],['dumbbell-shoulder-press',3,8,12,90],['seated-cable-row',3,8,12,90],['barbell-curl',2,10,12,60],['triceps-pushdown',2,10,12,60]]),
      mk('Lower (example)', 'Example lower-body day — edit freely.', [['back-squat',3,6,8,150],['romanian-deadlift',3,8,10,120],['leg-press',3,10,12,90],['lying-leg-curl',3,10,12,75],['standing-calf-raise',3,12,15,60]]),
      mk('Push (example)', 'Example push day — edit freely.', [['barbell-bench-press',3,6,8,150],['incline-dumbbell-press',3,8,12,90],['overhead-press',3,8,10,120],['lateral-raise',3,12,15,60],['triceps-pushdown',3,10,12,60]]),
      mk('Pull (example)', 'Example pull day — edit freely.', [['deadlift',3,4,6,180],['pull-up',3,6,10,120],['seated-cable-row',3,8,12,90],['face-pull',3,12,15,60],['dumbbell-curl',3,10,12,60]]),
      mk('Legs (example)', 'Example leg day — edit freely.', [['back-squat',3,6,8,150],['leg-press',3,10,12,90],['romanian-deadlift',3,8,10,120],['leg-extension',2,12,15,60],['seated-calf-raise',3,12,15,60]]),
    ];
    for (const d of defs.reverse()) await this.saveRoutine(d); // newest-first list => Full Body ends up on top
  },

  // -------------------------------------------------------------- sessions
  activeSession() { return this.sessions.find(s => s.status === 'in_progress' || s.status === 'paused') || null; },
  session(id) { return this.sessions.find(s => s.id === id) || null; },
  completed() { return this.sessions.filter(s => s.status === 'completed'); },

  /** Previous completed performance of an exercise (newest), for prefill and "last time". */
  lastPerformance(exerciseId, excludeSessionId) {
    return performancesFor(exerciseId, this.sessions.filter(s => s.id !== excludeSessionId))[0] || null;
  },

  makeSessionExercise(meta, opts = {}) {
    const exSet = this.exSetting(meta.id);
    const prev = this.lastPerformance(meta.id, opts.sessionId);
    const n = opts.target_sets || (meta.exercise_type === 'cardio' || meta.exercise_type === 'mobility' || meta.exercise_type === 'isometric' ? 1 : 3);
    const prevSets = prev?.sets || [];
    const sets = Array.from({ length: n }, (_, i) => {
      const p = prevSets[i] || prevSets[prevSets.length - 1];
      return {
        id: uuid(), set_type: 'normal', is_completed: false, completed_at: null,
        weight_kg: opts.target_weight_kg ?? p?.weight_kg ?? null,
        reps: p?.reps ?? opts.target_max_reps ?? null,
        duration_seconds: p?.duration_seconds ?? null, distance_meters: p?.distance_meters ?? null,
        added_weight_kg: p?.added_weight_kg ?? null, assistance_kg: p?.assistance_kg ?? null,
      };
    });
    return {
      id: uuid(), exercise_id: meta.id, name: meta.name, type: meta.exercise_type, status: 'active',
      primary_muscles: meta.primary_muscles, secondary_muscles: meta.secondary_muscles,
      target_sets: opts.target_sets ?? null, target_min_reps: opts.target_min_reps ?? null, target_max_reps: opts.target_max_reps ?? null,
      rest_seconds: opts.rest_seconds ?? exSet.default_rest_seconds ?? this.profile.default_rest_seconds, notes: opts.notes || '',
      group_id: opts.group_id ?? null, group_type: opts.group_type ?? null, sets,
    };
  },

  async startSession({ routine = null, name = null, fromSession = null } = {}) {
    const existing = this.activeSession(); if (existing) return existing;
    const id = uuid();
    let exercises = [];
    if (routine) {
      exercises = routine.exercises.map(re => { const m = this.exercise(re.exercise_id); return m ? this.makeSessionExercise(m, { ...re, sessionId: id }) : null; }).filter(Boolean);
    } else if (fromSession) {
      exercises = fromSession.exercises.filter(e => e.exercise_id && this.exercise(e.exercise_id)).map(e => {
        const copy = this.makeSessionExercise(this.exercise(e.exercise_id), { target_sets: e.sets.length, rest_seconds: e.rest_seconds, sessionId: id });
        return copy;
      });
    }
    const s = {
      id, user_id: this.user.id, routine_id: routine?.id ?? null, name: name || routine?.name || fromSession?.name || 'Workout',
      status: 'in_progress', started_at: new Date().toISOString(), ended_at: null, duration_seconds: null, notes: '',
      paused_ms: 0, pause_started_at: null, version: 1, serverVersion: null, exercises,
    };
    await this.saveSession(s, { bump: false });
    return s;
  },

  async saveSession(s, { bump = true } = {}) {
    if (bump) s.version = (s.version || 1) + 1;
    await Local.put('sessions', s);
    const i = this.sessions.findIndex(x => x.id === s.id);
    if (i >= 0) this.sessions[i] = s; else this.sessions.unshift(s);
    this.sessions.sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
    await this.enqueue('session', s.id);
    this.emit('sessions');
  },
  async deleteSession(id) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    await Local.del('sessions', id); await this.enqueue('session-del', id); this.emit('sessions');
  },

  // ---------------------------------------------------------- measurements
  async saveMeasurement(m) {
    const row = { id: m.id || uuid(), user_id: this.user.id, measured_at: new Date().toISOString(), ...m };
    await Local.put('measurements', row);
    const i = this.measurements.findIndex(x => x.id === row.id);
    if (i >= 0) this.measurements[i] = row; else this.measurements.push(row);
    this.measurements.sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));
    await this.enqueue('measurement', row.id); this.emit('measurements');
    return row;
  },
  async deleteMeasurement(id) {
    this.measurements = this.measurements.filter(m => m.id !== id);
    await Local.del('measurements', id); await this.enqueue('measurement-del', id); this.emit('measurements');
  },
  weightSeries() { return this.measurements.filter(m => m.measurement_type === 'weight').sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at)); },

  // ----------------------------------------------------------------- helpers
  allWorkingSetsCount() { return this.completed().reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.filter(isWorkingSet).length, 0), 0); },
  recentExercises(limit = 8) {
    const seen = new Set(); const out = [];
    for (const s of this.sessions) for (const e of s.exercises) { if (e.exercise_id && !seen.has(e.exercise_id) && this.exercise(e.exercise_id)) { seen.add(e.exercise_id); out.push(this.exercise(e.exercise_id)); if (out.length >= limit) return out; } }
    return out;
  },
};

/** Elapsed ACTIVE seconds for a session (excludes paused time). Timestamp based, so tab sleep can't drift it. */
export function elapsedSeconds(s, now = Date.now()) {
  if (!s.started_at) return 0;
  const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
  const paused = (s.paused_ms || 0) + (s.pause_started_at && !s.ended_at ? now - new Date(s.pause_started_at).getTime() : 0);
  return Math.max(0, Math.round((end - new Date(s.started_at).getTime() - paused) / 1000));
}
