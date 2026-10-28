import test from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, setVolume, sessionStats, isWorkingSet } from '../js/calculations/lifting.js';
import { kgToDisplay, displayToKg, parseNum, storeKg } from '../js/calculations/units.js';
import { calcPlates } from '../js/calculations/plates.js';
import { suggestNext } from '../js/calculations/progression.js';
import { performancesFor, recordsFrom, detectPRs } from '../js/calculations/records.js';
import { fieldsFor, canComplete } from '../js/calculations/fields.js';
import { suggestSubstitutes } from '../js/calculations/substitutes.js';
import { dayStatus } from '../js/calculations/consistency.js';
import { csvEscape, toCSV } from '../js/utils/format.js';

const set = (w, r, o = {}) => ({ id: Math.random().toString(), set_type: 'normal', is_completed: true, weight_kg: w, reps: r, ...o });
const sess = (id, date, sets, type = 'weight_reps', exId = 'bench') => ({ id, status: 'completed', started_at: date, ended_at: date, exercises: [{ id: id + 'e', exercise_id: exId, name: 'Bench', type, status: 'done', sets }] });

test('Epley e1RM, with limits', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.ok(Math.abs(e1rm(100, 10) - 133.333) < 0.01);
  assert.equal(e1rm(100, 13), null); assert.equal(e1rm(0, 5), null); assert.equal(e1rm(null, 5), null);
});
test('volume ignores warm-ups, incomplete sets, missing data', () => {
  assert.equal(setVolume(set(100, 5, { set_type: 'warmup' }), 'weight_reps'), 0);
  assert.equal(setVolume(set(100, 5, { is_completed: false }), 'weight_reps'), 0);
  assert.equal(setVolume(set(100, null), 'weight_reps'), 0);
  assert.equal(setVolume(set(100, 5), 'weight_reps'), 500);
  assert.equal(setVolume(set(null, 10, { added_weight_kg: 10 }), 'bodyweight_reps'), 100);
  assert.equal(setVolume(set(null, 10, { assistance_kg: 20 }), 'assisted'), 0);
  assert.equal(sessionStats(sess('a', '2026-01-01', [set(100, 5), set(100, 5, { set_type: 'warmup' })])).volume, 500);
});
test('unit conversion round-trips and blank is null (never 0)', () => {
  const lb = kgToDisplay(60, 'lb'); assert.ok(Math.abs(displayToKg(lb, 'lb') - 60) < 1e-9);
  assert.equal(parseNum(''), null); assert.equal(parseNum('abc'), null); assert.equal(parseNum('7,5'), 7.5); assert.equal(displayToKg('', 'kg'), null);
  assert.equal(storeKg(45.359237 * 0.99999999), 45.359);
});
test('plate calculator: exact, inexact and errors', () => {
  const r = calcPlates({ target: 100, bar: 20, plates: [25, 20, 10, 5, 2.5, 1.25] });
  assert.ok(r.exact); assert.deepEqual(r.perSide, [{ plate: 25, count: 1 }, { plate: 10, count: 1 }, { plate: 5, count: 1 }]); assert.equal(r.loaded, 100);
  const x = calcPlates({ target: 61, bar: 20, plates: [10, 5] }); assert.equal(x.exact, false); assert.equal(x.loaded, 60); assert.ok(x.note);
  assert.ok(calcPlates({ target: 10, bar: 20, plates: [5] }).error);
});
test('double progression: increase only after 2 sessions at same weight with all sets at max reps', () => {
  const s = [sess('3', '2026-03-03', [set(40, 10), set(40, 10), set(40, 10)]), sess('2', '2026-03-01', [set(40, 10), set(40, 10), set(40, 9)]), sess('1', '2026-02-27', [set(40, 9), set(40, 9), set(40, 8)])];
  const p = performancesFor('bench', s);
  const r = suggestNext(p, 'weight_reps', { minReps: 8, maxReps: 10, targetSets: 3 });
  assert.equal(r.status, 'increase'); assert.equal(r.suggestedWeightKg, 42.5); assert.ok(r.rule && r.evidence.length);
  assert.equal(suggestNext(p.slice(1), 'weight_reps', { maxReps: 10 }).status, 'hold'); // 2 sessions but latest not all at top
  assert.equal(suggestNext(p.slice(0, 1), 'weight_reps').status, 'insufficient');
  assert.equal(suggestNext(p, 'cardio').status, 'none');
});
test('decline is reported without diagnosing', () => {
  const s = [sess('2', '2026-03-03', [set(40, 6), set(40, 6), set(40, 5)]), sess('1', '2026-03-01', [set(40, 10), set(40, 9), set(40, 9)])];
  const r = suggestNext(performancesFor('bench', s), 'weight_reps', { maxReps: 12 });
  assert.equal(r.status, 'decline'); assert.match(r.detail, /can't say which/);
});
test('records & PR detection: baseline is not a PR, duplicates do not repeat', () => {
  const first = sess('1', '2026-01-01', [set(80, 5)]); const second = sess('2', '2026-01-08', [set(85, 5)]);
  assert.equal(detectPRs(first, [first]).length, 0);
  const prs = detectPRs(second, [first, second]).filter(p => p.type === 'max_weight'); assert.equal(prs.length, 1); assert.equal(prs[0].value, 85);
  assert.equal(detectPRs(second, [first, second, second]).filter(p => p.type === 'max_weight').length, 1);
  assert.equal(recordsFrom(performancesFor('bench', [first, second]), 'weight_reps').max_weight.value, 85);
});
test('a blank set can never be completed', () => {
  assert.equal(canComplete({ weight_kg: 50, reps: null }, 'weight_reps'), false); assert.equal(canComplete({ weight_kg: null, reps: 8 }, 'weight_reps'), true);
  assert.equal(canComplete({ duration_seconds: 0 }, 'cardio'), false); assert.equal(canComplete({ duration_seconds: 600 }, 'cardio'), true);
  assert.equal(fieldsFor('weight_reps', 'lb')[0].toDisp(45.359237), 100);
  assert.equal(fieldsFor('cardio', 'kg', 'km')[1].fromDisp(5), 5000);
});
test('substitutes: related only, equipment-aware, with reasons', () => {
  const bench = { id: 'b', movement_pattern: 'horizontal_push', primary_muscles: ['chest'], secondary_muscles: [], exercise_type: 'weight_reps', equipment: ['barbell'] };
  const db = { id: 'd', movement_pattern: 'horizontal_push', primary_muscles: ['chest'], secondary_muscles: [], exercise_type: 'weight_reps', equipment: ['dumbbell'] };
  const squat = { id: 's', movement_pattern: 'squat', primary_muscles: ['quads'], secondary_muscles: [], exercise_type: 'weight_reps', equipment: ['barbell'] };
  const r = suggestSubstitutes(bench, [bench, db, squat], { equipment: ['dumbbell'] });
  assert.equal(r.length, 1); assert.equal(r[0].exercise.id, 'd'); assert.ok(r[0].reasons.includes('same movement pattern'));
});
test('rest days are never missed; days before the plan are never missed', () => {
  const sched = { 1: 'r1', 2: 'rest' }; const now = new Date('2026-03-10T12:00:00');
  assert.equal(dayStatus(new Date('2026-03-03T12:00:00'), sched, [], now).state, 'rest'); // Tuesday
  assert.equal(dayStatus(new Date('2026-03-02T12:00:00'), sched, [], now).state, 'missed'); // Monday
  assert.equal(dayStatus(new Date('2026-03-02T12:00:00'), sched, [], now, new Date('2026-03-05')).state, 'none');
});
test('CSV escaping', () => {
  assert.equal(csvEscape('a,b'), '"a,b"'); assert.equal(csvEscape('say "hi"'), '"say ""hi"""'); assert.equal(csvEscape(null), ''); assert.equal(csvEscape(0), '0');
  assert.equal(toCSV([{ a: 1, b: 'x\ny' }], ['a', 'b']), 'a,b\r\n1,"x\ny"');
});
