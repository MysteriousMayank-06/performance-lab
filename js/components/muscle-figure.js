// Simple, original front/back body diagram (SVG). Primary muscles solid, secondary muscles tinted.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// Each region: [muscle, shape, attrs]
const FRONT = [
  ['traps', 'path', { d: 'M42 25 L50 22 L58 25 L56 33 L44 33 Z' }],
  ['shoulders', 'ellipse', { cx: 31, cy: 40, rx: 8, ry: 8 }], ['shoulders', 'ellipse', { cx: 69, cy: 40, rx: 8, ry: 8 }],
  ['chest', 'rect', { x: 38, y: 36, width: 11.5, height: 17, rx: 5 }], ['chest', 'rect', { x: 50.5, y: 36, width: 11.5, height: 17, rx: 5 }],
  ['biceps', 'rect', { x: 20, y: 48, width: 9, height: 22, rx: 4.5 }], ['biceps', 'rect', { x: 71, y: 48, width: 9, height: 22, rx: 4.5 }],
  ['forearms', 'rect', { x: 17, y: 72, width: 8.5, height: 28, rx: 4 }], ['forearms', 'rect', { x: 74.5, y: 72, width: 8.5, height: 28, rx: 4 }],
  ['abs', 'rect', { x: 43, y: 55, width: 14, height: 32, rx: 5 }],
  ['obliques', 'rect', { x: 36.5, y: 56, width: 5.5, height: 28, rx: 2.7 }], ['obliques', 'rect', { x: 58, y: 56, width: 5.5, height: 28, rx: 2.7 }],
  ['quads', 'rect', { x: 36, y: 94, width: 13, height: 46, rx: 6 }], ['quads', 'rect', { x: 51, y: 94, width: 13, height: 46, rx: 6 }],
  ['calves', 'rect', { x: 37.5, y: 146, width: 9.5, height: 40, rx: 4.5 }], ['calves', 'rect', { x: 53, y: 146, width: 9.5, height: 40, rx: 4.5 }],
];
const BACK = [
  ['traps', 'path', { d: 'M40 26 L50 22 L60 26 L55 46 L45 46 Z' }],
  ['shoulders', 'ellipse', { cx: 31, cy: 40, rx: 8, ry: 8 }], ['shoulders', 'ellipse', { cx: 69, cy: 40, rx: 8, ry: 8 }],
  ['upper_back', 'rect', { x: 38, y: 47, width: 24, height: 11, rx: 4 }],
  ['lats', 'path', { d: 'M36 54 L44 60 L44 82 L38 78 Z' }], ['lats', 'path', { d: 'M64 54 L56 60 L56 82 L62 78 Z' }],
  ['triceps', 'rect', { x: 20, y: 48, width: 9, height: 22, rx: 4.5 }], ['triceps', 'rect', { x: 71, y: 48, width: 9, height: 22, rx: 4.5 }],
  ['forearms', 'rect', { x: 17, y: 72, width: 8.5, height: 28, rx: 4 }], ['forearms', 'rect', { x: 74.5, y: 72, width: 8.5, height: 28, rx: 4 }],
  ['lower_back', 'rect', { x: 43, y: 74, width: 14, height: 17, rx: 5 }],
  ['glutes', 'ellipse', { cx: 43.5, cy: 101, rx: 8.5, ry: 9 }], ['glutes', 'ellipse', { cx: 56.5, cy: 101, rx: 8.5, ry: 9 }],
  ['hamstrings', 'rect', { x: 36, y: 113, width: 13, height: 32, rx: 6 }], ['hamstrings', 'rect', { x: 51, y: 113, width: 13, height: 32, rx: 6 }],
  ['calves', 'rect', { x: 37.5, y: 148, width: 9.5, height: 38, rx: 4.5 }], ['calves', 'rect', { x: 53, y: 148, width: 9.5, height: 38, rx: 4.5 }],
];

function figure(regions, label, primary, secondary) {
  const svg = el('svg', { viewBox: '0 0 100 200', role: 'img', 'aria-label': label });
  svg.append(el('circle', { cx: 50, cy: 12, r: 9, class: 'outline' }));
  svg.append(el('path', { d: 'M40 26 Q30 30 28 40 L17 98 L26 100 L36 56 L36 90 L34 140 L37 190 L47 190 L50 130 L53 190 L63 190 L66 140 L64 90 L64 56 L74 100 L83 98 L72 40 Q70 30 60 26', class: 'outline' }));
  for (const [muscle, shape, attrs] of regions) {
    const cls = primary.includes(muscle) ? 'm primary' : secondary.includes(muscle) ? 'm secondary' : 'm';
    svg.append(el(shape, { ...attrs, class: cls, 'data-muscle': muscle }));
  }
  return svg;
}

export function muscleFigure(primary = [], secondary = []) {
  const wrap = document.createElement('div');
  wrap.className = 'muscle-fig';
  const names = [...primary, ...secondary].join(', ').replace(/_/g, ' ') || 'none';
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', `Muscles worked: ${names}`);
  wrap.append(figure(FRONT, 'Front view', primary, secondary), figure(BACK, 'Back view', primary, secondary));
  return wrap;
}
