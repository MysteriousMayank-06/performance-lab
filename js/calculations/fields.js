// Which input columns an exercise type uses, and how to convert between stored (kg / m / s) and displayed values.
import { kgToDisplay, displayToKg, metersToDisplay, displayToMeters, round, storeKg } from './units.js';

export function fieldsFor(type, wUnit = 'kg', dUnit = 'km') {
  const wt = (key, label) => ({ key, label, mode: 'decimal', toDisp: v => v == null ? '' : round(kgToDisplay(v, wUnit), 2), fromDisp: v => storeKg(displayToKg(v, wUnit)) });
  const reps = { key: 'reps', label: 'REPS', mode: 'numeric', toDisp: v => v ?? '', fromDisp: v => v == null ? null : Math.max(0, Math.round(v)), required: true };
  switch (type) {
    case 'bodyweight_reps': return [wt('added_weight_kg', '+' + wUnit.toUpperCase()), reps];
    case 'assisted': return [wt('assistance_kg', '−' + wUnit.toUpperCase()), reps];
    case 'cardio': return [
      { key: 'duration_seconds', label: 'MIN', mode: 'decimal', required: true, toDisp: v => v == null ? '' : round(v / 60, 2), fromDisp: v => v == null ? null : Math.round(v * 60) },
      { key: 'distance_meters', label: dUnit.toUpperCase(), mode: 'decimal', toDisp: v => v == null ? '' : round(metersToDisplay(v, dUnit), 3), fromDisp: v => displayToMeters(v, dUnit) },
    ];
    case 'isometric':
    case 'mobility': return [{ key: 'duration_seconds', label: 'SEC', mode: 'numeric', required: true, toDisp: v => v ?? '', fromDisp: v => v == null ? null : Math.round(v) }];
    default: return [wt('weight_kg', wUnit.toUpperCase()), reps]; // weight_reps
  }
}

/** A set can only be completed if its "required" field(s) hold a real value (blank is never treated as 0). */
export function canComplete(set, type) {
  return fieldsFor(type).filter(f => f.required).every(f => set[f.key] != null && set[f.key] > 0);
}
