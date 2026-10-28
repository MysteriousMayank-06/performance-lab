import { kgToDisplay } from '../calculations/units.js';

export function pad(n) { return String(n).padStart(2, '0'); }

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}
export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${Math.max(1, m)} min`;
}
export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}
export function fmtDateLong(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
export function fmtTimeOfDay(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
export function relativeDay(iso) {
  const d = new Date(iso); const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) return `Today, ${fmtTimeOfDay(iso)}`;
  if (days === 1) return `Yesterday, ${fmtTimeOfDay(iso)}`;
  if (days < 7 && days > 0) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return fmtDate(iso);
}
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function localISODate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function startOfWeek(d = new Date(), weekStartsOn = 1) {
  const x = startOfDay(d); const diff = (x.getDay() - weekStartsOn + 7) % 7; x.setDate(x.getDate() - diff); return x;
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export function fmtNumber(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n.toFixed(digits)).toLocaleString(undefined, { maximumFractionDigits: digits });
}
export function fmtWeight(kg, unit) {
  if (kg == null) return '—';
  return `${fmtNumber(kgToDisplay(kg, unit), 1)} ${unit}`;
}
export function titleCase(s) { return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
export function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(rows, columns) {
  const head = columns.join(',');
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(','));
  return [head, ...body].join('\r\n');
}
export function download(filename, text, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
