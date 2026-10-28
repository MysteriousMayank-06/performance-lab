// Transparent double-progression rules. No AI, no hidden scoring.
import { isWorkingSet, setLoadKg } from './lifting.js';

export const DEFAULTS = { minReps: 8, maxReps: 12, incrementKg: 2.5, targetSets: 3, rpeCap: null };

function summarize(perf, type) {
  const loads = perf.sets.map(s => setLoadKg(s, type)).filter(v => v != null);
  const weight = loads.length ? Math.max(...loads) : null;
  const atWeight = perf.sets.filter(s => setLoadKg(s, type) === weight);
  return { weight, reps: atWeight.map(s => s.reps || 0), date: perf.date, setsLogged: perf.sets.length, rpes: perf.sets.map(s => s.rpe).filter(v => v != null) };
}

/**
 * @param perfs newest-first performances from performancesFor()
 * @returns {status, headline, detail, evidence[], rule, suggestedWeightKg?}
 */
export function suggestNext(perfs, type, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const rule = `Double progression: add weight once every working set reaches ${c.maxReps} reps at the same weight, in at least 2 sessions at that weight.`;
  if (type !== 'weight_reps' && type !== 'bodyweight_reps') {
    return { status: 'none', headline: 'No weight suggestion for this exercise type', detail: 'Suggestions are only made for loaded strength exercises.', evidence: [], rule };
  }
  if (perfs.length < 2) {
    return { status: 'insufficient', headline: 'Not enough history yet', detail: `Log this exercise in at least 2 sessions and I can suggest a next target. You have ${perfs.length}.`, evidence: [], rule };
  }
  const [last, prev] = perfs.slice(0, 2).map(p => summarize(p, type));
  const evidence = [last, prev].map(x => ({ date: x.date, weight: x.weight, reps: x.reps }));
  const sameWeight = last.weight != null && last.weight === prev.weight;
  const allAtTop = last.reps.length >= c.targetSets && last.reps.every(r => r >= c.maxReps);
  const rpeTooHigh = c.rpeCap != null && last.rpes.length && Math.max(...last.rpes) > c.rpeCap;

  if (sameWeight && allAtTop && !rpeTooHigh) {
    return {
      status: 'increase', suggestedWeightKg: last.weight + c.incrementKg,
      headline: 'Consider a small weight increase',
      detail: `Your last two sessions were at the same weight and the latest had all ${last.reps.length} sets at ${c.maxReps}+ reps. If technique stayed solid, try +${c.incrementKg} kg and aim for ${c.minReps} reps.`,
      evidence, rule,
    };
  }
  if (allAtTop && rpeTooHigh) {
    return { status: 'hold', headline: 'Hold the weight for now', detail: `All sets hit ${c.maxReps}+ reps, but your logged effort was above your RPE cap (${c.rpeCap}). Repeat once more before increasing.`, evidence, rule };
  }
  if (sameWeight && last.reps.length && prev.reps.length) {
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const drop = avg(prev.reps) - avg(last.reps);
    if (drop >= 2) {
      return {
        status: 'decline', headline: 'Reps dipped compared with last time',
        detail: `Average reps per set went from ${avg(prev.reps).toFixed(1)} to ${avg(last.reps).toFixed(1)} at the same weight. Sleep, fatigue, rest times, or technique can all play a part — the data alone can't say which.`,
        evidence, rule,
      };
    }
  }
  if (sameWeight) {
    const lowest = Math.min(...last.reps);
    return { status: 'hold', headline: 'Keep building reps', detail: `Same weight as last time. Work towards ${c.maxReps} reps on every set (your lowest set last time was ${lowest}).`, evidence, rule };
  }
  return { status: 'hold', headline: 'Weight changed recently', detail: 'The last two sessions used different weights, so there is no like-for-like comparison yet.', evidence, rule };
}
