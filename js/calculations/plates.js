// Plate calculator. Weights in kg (the UI converts). Plates are loaded equally on both sides.
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

function greedy(perSide, plates) {
  const sorted = [...plates].sort((a, b) => b - a);
  const used = []; let left = perSide;
  for (const p of sorted) {
    let n = 0;
    while (left + 1e-9 >= p) { left -= p; n++; }
    if (n) used.push({ plate: p, count: n });
  }
  return { used, left: Math.round(left * 1000) / 1000 };
}

export function calcPlates({ target, bar, plates }) {
  if (!(target > 0) || !(bar >= 0) || !plates?.length) return { error: 'Enter a target weight, bar weight and at least one plate size.' };
  if (target < bar) return { error: 'Target is lighter than the bar.' };
  const perSide = (target - bar) / 2;
  const g = greedy(perSide, plates);
  const loaded = bar + 2 * (perSide - g.left);
  const smallest = Math.min(...plates);
  const result = { target, bar, perSide: g.used, exact: g.left < 1e-6, loaded, shortBy: target - loaded };
  if (!result.exact) {
    result.nextUp = bar + 2 * (perSide - g.left + smallest);
    result.note = `Can't hit ${target} exactly with these plates. Nearest loadable: ${loaded} below or ${result.nextUp} above.`;
  }
  return result;
}
