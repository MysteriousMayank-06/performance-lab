// Transparent exercise-substitution scoring. Pure function: no network, no AI.
// Priority order (from the product spec): 1) movement pattern 2) target muscles 3) equipment 4) difficulty/type.
export function suggestSubstitutes(target, all, { equipment = [], limit = 5 } = {}) {
  const have = new Set((equipment || []).map(e => e.toLowerCase()));
  const out = [];
  for (const ex of all) {
    if (ex.id === target.id) continue;
    let score = 0; const reasons = [];
    if (target.movement_pattern && ex.movement_pattern === target.movement_pattern) { score += 40; reasons.push('same movement pattern'); }
    const shared = (ex.primary_muscles || []).filter(m => (target.primary_muscles || []).includes(m));
    if (shared.length) { score += 25 * shared.length; reasons.push(`trains ${shared.join(', ').replace(/_/g, ' ')}`); }
    else if ((ex.secondary_muscles || []).some(m => (target.primary_muscles || []).includes(m))) { score += 6; reasons.push('works the target muscle as a helper'); }
    if (!score) continue; // never suggest something unrelated
    if (ex.exercise_type === target.exercise_type) { score += 8; reasons.push('same tracking style'); }
    const eq = (ex.equipment || []).filter(e => e !== 'bodyweight');
    if (have.size && eq.length) {
      if (eq.every(e => have.has(e))) { score += 15; reasons.push('uses equipment you have'); }
      else { score -= 20; reasons.push('needs equipment you did not list'); }
    }
    out.push({ exercise: ex, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
