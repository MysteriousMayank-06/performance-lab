// Outbox-based synchronisation. Safe by construction:
//  - every record has a client-generated UUID => upserts are idempotent (retrying never duplicates)
//  - local data is only marked synced AFTER the server confirms
//  - sessions carry a version; if the server's version moved without us, we flag a CONFLICT instead of overwriting
import { Local } from '../db.js';
import { getClient } from '../supabase-client.js';
import { store } from './store.js';
import { toRemoteSession, fromRemoteSession, toRemoteRoutine, fromRemoteRoutine } from './mappers.js';
import { deviceId } from '../utils/id.js';

const listeners = new Set();
export const syncState = { state: 'synced', pending: 0, failed: 0, conflicts: 0, lastSync: null, running: false, message: '' };
let timer = null;

function publish() {
  syncState.pending = store.outboxKeys.size;
  syncState.conflicts = store.conflictIds.size;
  syncState.state = !navigator.onLine ? 'offline' : syncState.conflicts ? 'conflict' : syncState.failed ? 'failed' : syncState.pending ? 'pending' : 'synced';
  listeners.forEach(fn => fn(syncState));
}
export function onSync(fn) { listeners.add(fn); fn(syncState); return () => listeners.delete(fn); }

const isNetworkError = (e) => !navigator.onLine || e instanceof TypeError || /fetch|network|Failed to/i.test(e?.message || '');
const chunk = (a, n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
async function ok(p) { const r = await p; if (r.error) throw r.error; return r.data; }

const handlers = {
  async profile(sb, item) {
    const p = store.profile;
    await ok(sb.from('profiles').upsert({
      id: store.user.id, display_name: p.display_name || null, birth_year: p.birth_year, height_cm: p.height_cm,
      preferred_weight_unit: p.preferred_weight_unit, preferred_distance_unit: p.preferred_distance_unit, preferred_theme: p.preferred_theme,
      training_experience: p.training_experience, primary_goal: p.primary_goal, week_starts_on: p.week_starts_on, default_rest_seconds: p.default_rest_seconds,
      weekly_schedule: p.weekly_schedule, settings: p.settings, onboarding_completed: p.onboarding_completed,
    }));
  },
  async exercise(sb, item) {
    const e = store.exercise(item.id); if (!e) return;
    await ok(sb.from('exercises').upsert({
      id: e.id, owner_id: store.user.id, name: e.name, aliases: e.aliases || [], primary_muscles: e.primary_muscles || [], secondary_muscles: e.secondary_muscles || [],
      equipment: e.equipment || [], movement_pattern: e.movement_pattern || null, exercise_type: e.exercise_type, tracking_config: e.tracking_config || {},
      instructions: e.instructions || null, common_mistakes: e.common_mistakes || null, is_system: false,
    }));
  },
  async 'exercise-del'(sb, item) { await ok(sb.from('exercises').delete().eq('id', item.id)); },
  async exsetting(sb, item) {
    const s = store.exsettings[item.id]; if (!s) return;
    await ok(sb.from('exercise_settings').upsert({ user_id: store.user.id, exercise_id: s.exercise_id, is_favorite: !!s.is_favorite, progression_enabled: s.progression_enabled !== false, progression_rule: s.progression_rule || 'double', min_reps: s.min_reps ?? null, max_reps: s.max_reps ?? null, increment_kg: s.increment_kg ?? null, default_rest_seconds: s.default_rest_seconds ?? null }, { onConflict: 'user_id,exercise_id' }));
  },
  async exnote(sb, item) {
    const n = store.exnotes[item.id]; if (!n) return;
    await ok(sb.from('exercise_notes').upsert({ id: n.id, user_id: store.user.id, exercise_id: n.exercise_id, note_type: n.note_type || 'setup', content: n.content || '' }));
  },
  async routine(sb, item) {
    const r = store.routines.find(x => x.id === item.id); if (!r) return;
    const { routine, items } = toRemoteRoutine(r, store.user.id);
    await ok(sb.from('routines').upsert(routine));
    const existing = await ok(sb.from('routine_exercises').select('id').eq('routine_id', r.id));
    const keep = new Set(items.map(i => i.id));
    const stale = existing.filter(e => !keep.has(e.id)).map(e => e.id);
    if (stale.length) await ok(sb.from('routine_exercises').delete().in('id', stale));
    // unique(routine_id, position) is deferrable, so re-ordering inside one upsert call is fine
    for (const c of chunk(items)) await ok(sb.from('routine_exercises').upsert(c));
  },
  async 'routine-del'(sb, item) { await ok(sb.from('routines').delete().eq('id', item.id)); },
  async measurement(sb, item) {
    const m = store.measurements.find(x => x.id === item.id); if (!m) return;
    await ok(sb.from('body_measurements').upsert({ id: m.id, user_id: store.user.id, measurement_type: m.measurement_type, custom_label: m.custom_label ?? null, value: m.value, unit: m.unit, measured_at: m.measured_at, notes: m.notes ?? null }));
  },
  async 'measurement-del'(sb, item) { await ok(sb.from('body_measurements').delete().eq('id', item.id)); },
  async 'session-del'(sb, item) { await ok(sb.from('workout_sessions').delete().eq('id', item.id)); },

  async session(sb, item) {
    const s = store.session(item.id); if (!s) return;
    if (store.conflictIds.has(s.id)) return 'skip';
    const remote = (await ok(sb.from('workout_sessions').select('id,version,updated_at').eq('id', s.id).maybeSingle()));
    if (remote && remote.version !== s.version && remote.version !== s.serverVersion) {
      // Server moved without us (e.g. edited on another device). Don't overwrite — ask the user.
      await Local.put('conflicts', { id: s.id, detectedAt: Date.now(), remoteVersion: remote.version, localVersion: s.version, name: s.name });
      store.conflictIds.add(s.id);
      return 'conflict';
    }
    const { session, exercises, sets } = toRemoteSession(s, store.user.id, deviceId());
    await ok(sb.from('workout_sessions').upsert(session));
    const prev = await ok(sb.from('session_exercises').select('id, sets(id)').eq('session_id', s.id));
    for (const c of chunk(exercises)) await ok(sb.from('session_exercises').upsert(c));
    for (const c of chunk(sets)) await ok(sb.from('sets').upsert(c));
    const keepEx = new Set(exercises.map(e => e.id)), keepSets = new Set(sets.map(x => x.id));
    const staleSets = prev.flatMap(e => e.sets || []).map(x => x.id).filter(id => !keepSets.has(id));
    const staleEx = prev.map(e => e.id).filter(id => !keepEx.has(id));
    if (staleSets.length) await ok(sb.from('sets').delete().in('id', staleSets));
    if (staleEx.length) await ok(sb.from('session_exercises').delete().in('id', staleEx));
    s.serverVersion = s.version; await Local.put('sessions', s);
  },
};

const ORDER = ['profile', 'exercise', 'exsetting', 'exnote', 'routine', 'measurement', 'session', 'exercise-del', 'routine-del', 'measurement-del', 'session-del'];

async function push(sb) {
  let items = await Local.all('outbox');
  items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.ts - b.ts);
  syncState.failed = 0;
  for (const item of items) {
    try {
      const r = await handlers[item.kind](sb, item);
      if (r === 'conflict') { await Local.del('outbox', item.key); store.outboxKeys.delete(item.key); continue; }
      // Only drop from the outbox if nothing newer was queued while we were sending.
      const cur = await Local.get('outbox', item.key);
      if (!cur || cur.ts === item.ts) { await Local.del('outbox', item.key); store.outboxKeys.delete(item.key); }
    } catch (e) {
      if (isNetworkError(e)) throw e;
      if (e?.code === 'PGRST301' || e?.status === 401 || /JWT/i.test(e?.message || '')) { const { error } = await sb.auth.refreshSession(); if (error) throw e; continue; }
      syncState.failed++;
      console.warn('[sync] failed', item.key, e?.code, e?.message);
      await Local.put('outbox', { ...item, tries: (item.tries || 0) + 1, error: 'The server rejected this change. It will retry; export your data if it persists.' });
    }
    publish();
  }
}

async function pull(sb) {
  const uid = store.user.id;
  const pend = (k, id) => store.outboxKeys.has(`${k}:${id}`);

  const [prof, exs, routines, sessions, meas, exset, notes] = await Promise.all([
    ok(sb.from('profiles').select('*').eq('id', uid).maybeSingle()),
    ok(sb.from('exercises').select('*')),
    ok(sb.from('routines').select('*, routine_exercises(*)')),
    ok(sb.from('workout_sessions').select('*, session_exercises(*, sets(*))').order('started_at', { ascending: false }).limit(300)),
    ok(sb.from('body_measurements').select('*').order('measured_at', { ascending: false }).limit(2000)),
    ok(sb.from('exercise_settings').select('*')),
    ok(sb.from('exercise_notes').select('*')),
  ]);

  if (prof && !pend('profile', uid)) {
    const p = { ...store.profile, ...Object.fromEntries(Object.entries(prof).filter(([k, v]) => k in store.profile && v != null)) };
    p.settings = { ...store.profile.settings, ...(prof.settings || {}) };
    store.profile = p; await Local.kvSet('profile', p);
  }
  // exercises (system + own custom)
  const mergedEx = new Map(store.exercises.map(e => [e.id, e]));
  for (const e of exs) { const old = mergedEx.get(e.id); mergedEx.set(e.id, { ...old, ...e, slug: old?.slug }); }
  const remoteExIds = new Set(exs.map(e => e.id));
  for (const e of [...mergedEx.values()]) if (!e.is_system && !remoteExIds.has(e.id) && !pend('exercise', e.id)) mergedEx.delete(e.id);
  store.exercises = [...mergedEx.values()];
  await Local.putMany('exercises', store.exercises);

  // routines
  const nextRoutines = routines.filter(r => !pend('routine', r.id) && !pend('routine-del', r.id)).map(fromRemoteRoutine);
  const localOnly = store.routines.filter(r => pend('routine', r.id));
  store.routines = [...nextRoutines, ...localOnly.filter(r => !nextRoutines.some(n => n.id === r.id))];
  await Local.clear('routines'); await Local.putMany('routines', store.routines);

  // sessions: never touch ones with unsynced local edits or open conflicts
  const incoming = sessions.filter(r => !pend('session', r.id) && !pend('session-del', r.id) && !store.conflictIds.has(r.id)).map(fromRemoteSession);
  const keepLocal = store.sessions.filter(s => !incoming.some(i => i.id === s.id));
  // preserve local-only pause state on an in-progress session
  incoming.forEach(i => { const l = store.session(i.id); if (l && (i.status === 'in_progress' || i.status === 'paused')) { i.paused_ms = l.paused_ms; i.pause_started_at = l.pause_started_at; } });
  store.sessions = [...incoming, ...keepLocal].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  await Local.putMany('sessions', incoming);

  // measurements
  const remoteM = meas.filter(m => !pend('measurement', m.id) && !pend('measurement-del', m.id));
  const mLocal = store.measurements.filter(m => pend('measurement', m.id));
  store.measurements = [...remoteM, ...mLocal.filter(m => !remoteM.some(r => r.id === m.id))].sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at));
  await Local.clear('measurements'); await Local.putMany('measurements', store.measurements);

  for (const s of exset) if (!pend('exsetting', s.exercise_id)) store.exsettings[s.exercise_id] = s;
  await Local.putMany('exsettings', Object.values(store.exsettings));
  for (const n of notes) if (!pend('exnote', n.exercise_id)) store.exnotes[n.exercise_id] = n;
  await Local.putMany('exnotes', Object.values(store.exnotes));
  store.emit('pulled');
}

export const sync = {
  async run({ pullAfter = true } = {}) {
    if (syncState.running || !store.user) return;
    if (!navigator.onLine) return publish();
    syncState.running = true; syncState.message = ''; publish();
    try {
      const sb = await getClient();
      await push(sb);
      if (pullAfter) await pull(sb);
      syncState.lastSync = Date.now(); await Local.kvSet('lastSync', syncState.lastSync);
    } catch (e) {
      syncState.message = isNetworkError(e) ? 'Offline — changes are saved on this device.' : 'Sync problem — will retry.';
      if (!isNetworkError(e)) console.warn('[sync]', e?.message);
    } finally { syncState.running = false; publish(); }
  },
  start() {
    const kick = () => sync.run();
    window.addEventListener('online', kick); window.addEventListener('offline', publish);
    window.addEventListener('pl:outbox', () => { publish(); clearTimeout(timer); timer = setTimeout(kick, 1200); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    setInterval(() => { if (store.outboxKeys.size) kick(); }, 30000);
    Local.kvGet('lastSync').then(v => { syncState.lastSync = v; publish(); });
    kick();
  },
  async conflicts() { return Local.all('conflicts'); },
  /** Keep this device's copy: bump past the server version and push. */
  async resolveKeepMine(id) {
    const c = await Local.get('conflicts', id); const s = store.session(id);
    if (s && c) { s.serverVersion = c.remoteVersion; s.version = c.remoteVersion + 1; await Local.put('sessions', s); }
    await Local.del('conflicts', id); store.conflictIds.delete(id);
    if (s) await store.enqueue('session', id); publish(); sync.run();
  },
  /** Use the other device's copy: replace local with the server version. */
  async resolveUseTheirs(id) {
    const sb = await getClient();
    const row = await ok(sb.from('workout_sessions').select('*, session_exercises(*, sets(*))').eq('id', id).single());
    const s = fromRemoteSession(row);
    await Local.put('sessions', s);
    store.sessions = [s, ...store.sessions.filter(x => x.id !== id)];
    await Local.del('conflicts', id); store.conflictIds.delete(id); publish(); store.emit('sessions');
  },
};
