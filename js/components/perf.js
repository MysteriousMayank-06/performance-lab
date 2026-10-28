// Human-readable summaries of past performances ("40 kg × 10, 10, 9").
import { kgToDisplay, metersToDisplay, round } from '../calculations/units.js';
import { fmtDate } from '../utils/format.js';

const w = (kg, unit) => `${round(kgToDisplay(kg, unit), 2)}`;

/** sets: working sets of one performance. */
export function fmtSets(sets, type, unit = 'kg', dUnit = 'km') {
  if (!sets?.length) return '—';
  if (type === 'cardio') return sets.map(s => [s.duration_seconds ? `${round(s.duration_seconds / 60, 1)} min` : null, s.distance_meters ? `${round(metersToDisplay(s.distance_meters, dUnit), 2)} ${dUnit}` : null].filter(Boolean).join(' · ')).join(' + ');
  if (type === 'isometric' || type === 'mobility') return sets.map(s => `${s.duration_seconds || '?'}s`).join(', ');
  const key = type === 'bodyweight_reps' ? 'added_weight_kg' : type === 'assisted' ? 'assistance_kg' : 'weight_kg';
  const sign = type === 'bodyweight_reps' ? '+' : type === 'assisted' ? '−' : '';
  const groups = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.load === (s[key] ?? null)) last.reps.push(s.reps ?? '?'); else groups.push({ load: s[key] ?? null, reps: [s.reps ?? '?'] });
  }
  return groups.map(g => g.load ? `${sign}${w(g.load, unit)} ${unit} × ${g.reps.join(', ')}` : `${g.reps.join(', ')} reps`).join(' · ');
}
export function fmtPerf(perf, type, unit, dUnit) { return perf ? `${fmtSets(perf.sets, type, unit, dUnit)}` : ''; }
export function perfDate(perf) { return perf ? fmtDate(perf.date) : ''; }
