// Storage convention: weights in kg, distances in metres. Convert only for display/input.
export const KG_PER_LB = 0.45359237;
export const M_PER_KM = 1000;
export const M_PER_MI = 1609.344;
export const CM_PER_IN = 2.54;

export function kgToDisplay(kg, unit) { return kg == null ? null : unit === 'lb' ? kg / KG_PER_LB : kg; }
export function displayToKg(v, unit) { return v == null || v === '' || Number.isNaN(+v) ? null : unit === 'lb' ? +v * KG_PER_LB : +v; }
export function metersToDisplay(m, unit) { return m == null ? null : unit === 'mi' ? m / M_PER_MI : m / M_PER_KM; }
export function displayToMeters(v, unit) { return v == null || v === '' || Number.isNaN(+v) ? null : unit === 'mi' ? +v * M_PER_MI : +v * M_PER_KM; }
export function round(n, d = 1) { const f = 10 ** d; return Math.round(n * f) / f; }
/** Round a kg value to 3 decimals so lb->kg->lb round trips stay stable. */
export function storeKg(kg) { return kg == null ? null : Math.round(kg * 1000) / 1000; }
/** Parse a text input to a finite number, or null for blank/invalid (never 0 by accident). */
export function parseNum(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
