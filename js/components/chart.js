import { h } from '../utils/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); kids.forEach(k => el.append(k)); return el; };

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n; const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}

/**
 * Line chart from REAL points only. points: [{x:Date|number, y:number, tip:string}]
 * Renders an honest empty state when there is not enough data.
 */
export function lineChart(points, { height = 200, fmtY = v => v, fmtX = x => new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), color = 'var(--brand)', minPoints = 2 } = {}) {
  const wrap = h('div', { class: 'chart', style: { position: 'relative' } });
  if (!points || points.length < minPoints) {
    wrap.append(h('div', { class: 'empty', style: { padding: '24px 8px' } }, h('p', null, points?.length === 1 ? 'One data point so far — log again to see a trend.' : 'No data in this range yet.')));
    return wrap;
  }
  const W = 340, H = height, m = { l: 36, r: 10, t: 12, b: 22 };
  const xs = points.map(p => +p.x), ys = points.map(p => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys));
  const X = v => m.l + (xmax === xmin ? (W - m.l - m.r) / 2 : ((v - xmin) / (xmax - xmin)) * (W - m.l - m.r));
  const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Line chart with ${points.length} points, from ${fmtY(ys[0])} to ${fmtY(ys[ys.length - 1])}` });
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  const defs = s('defs', {}, s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0%', 'stop-color': color }), s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 })));
  const grid = s('g', { class: 'grid axis' });
  ticks.forEach(t => { grid.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) })); const tx = s('text', { x: m.l - 6, y: Y(t) + 3, 'text-anchor': 'end' }); tx.textContent = fmtY(t); grid.append(tx); });
  [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i).forEach(i => { const tx = s('text', { x: X(xs[i]), y: H - 5, 'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle' }); tx.textContent = fmtX(xs[i]); grid.append(tx); });
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(+p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = s('path', { class: 'area', d: `${d}L${X(xs[xs.length - 1])},${H - m.b}L${X(xs[0])},${H - m.b}Z`, fill: `url(#${gid})`, style: 'fill:url(#' + gid + ')' });
  const len = Math.ceil(points.reduce((a, p, i) => i ? a + Math.hypot(X(+p.x) - X(+points[i - 1].x), Y(p.y) - Y(points[i - 1].y)) : 0, 0)) + 10;
  const line = s('path', { class: 'line', d, style: `--len:${len};stroke:${color}` });
  svg.append(defs, grid, area, line);
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const dots = points.map((p, i) => { const c = s('circle', { class: 'pt', cx: X(+p.x), cy: Y(p.y), r: points.length > 40 ? 0 : 3.5, style: `stroke:${color}` }); svg.append(c); return c; });
  const show = (evt) => {
    const r = svg.getBoundingClientRect(); const px = ((evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left) / r.width * W;
    let best = 0; xs.forEach((x, i) => { if (Math.abs(X(x) - px) < Math.abs(X(xs[best]) - px)) best = i; });
    tip.hidden = false; tip.textContent = points[best].tip || `${fmtY(points[best].y)} · ${fmtX(xs[best])}`;
    tip.style.left = (X(xs[best]) / W * 100) + '%'; tip.style.top = (Y(points[best].y) / H * 100) + '%';
    dots.forEach((c, i) => c.setAttribute('r', i === best ? 5.5 : points.length > 40 ? 0 : 3.5));
  };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  wrap.append(svg, tip);
  return wrap;
}

/** Simple bar chart: bars [{label, value}] */
export function barChart(bars, { height = 140, color = 'var(--brand)', fmt = v => v } = {}) {
  const W = 340, H = height, pad = 22, gap = 8;
  const max = Math.max(1, ...bars.map(b => b.value));
  const bw = (W - gap * (bars.length - 1)) / bars.length;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Bar chart: ' + bars.map(b => `${b.label} ${fmt(b.value)}`).join(', ') });
  bars.forEach((b, i) => {
    const bh = Math.max(b.value ? 4 : 2, (b.value / max) * (H - pad - 16)); const x = i * (bw + gap);
    const r = s('rect', { x, y: H - pad - bh, width: bw, height: bh, rx: 6, fill: b.value ? color : 'var(--sheet-surface-2)', style: `transform-origin:${x + bw / 2}px ${H - pad}px;animation:bar-up .6s ${i * 40}ms var(--ease) both` });
    const v = s('text', { x: x + bw / 2, y: H - pad - bh - 4, 'text-anchor': 'middle', style: 'font-size:10px;font-weight:600', fill: 'var(--text-muted)' }); v.textContent = b.value ? fmt(b.value) : '';
    const l = s('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', style: 'font-size:10px', fill: 'var(--text-faint)' }); l.textContent = b.label;
    svg.append(r, v, l);
  });
  return h('div', { class: 'chart' }, svg);
}
