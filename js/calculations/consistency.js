import { startOfWeek, startOfDay, localISODate } from '../utils/format.js';

/** Completed workouts per week for the last n weeks (oldest -> newest). */
export function weeklyCounts(sessions, n = 8, weekStartsOn = 1, now = new Date()) {
  const start = startOfWeek(now, weekStartsOn);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = new Date(start); from.setDate(from.getDate() - i * 7);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const count = sessions.filter(s => s.status === 'completed' && new Date(s.started_at) >= from && new Date(s.started_at) < to).length;
    weeks.push({ from, count });
  }
  return weeks;
}

/**
 * Day status for the calendar. A rest day is NOT a missed day; only a planned workout
 * that wasn't done in the past is "missed".
 */
export function dayStatus(date, schedule, sessions, now = new Date(), since = null) {
  const key = localISODate(date);
  const done = sessions.filter(s => s.status === 'completed' && localISODate(new Date(s.started_at)) === key);
  // Days before the plan existed are never "missed".
  const plan = since && startOfDay(date) < startOfDay(since) ? null : (schedule?.[date.getDay()] ?? null); // routineId | 'rest' | null
  if (done.length) return { state: 'done', sessions: done, plan };
  if (plan === 'rest') return { state: 'rest', plan };
  if (plan && startOfDay(date) < startOfDay(now)) return { state: 'missed', plan };
  if (plan) return { state: 'planned', plan };
  return { state: 'none', plan: null };
}
