// Frosted-glass bubble chart (the circles with a white share-arc from the reference design).
// items: [{ key, label, share (0-100), icon }]  — sizes are assigned by RANK into fixed slots so bubbles never overlap.
import { h } from '../utils/dom.js';
import { icon } from './icons.js';

const SLOTS = [ // [left%, top%, size%]
  [52, 27, 44], [2, 1, 35], [6, 66, 31], [64, 0, 26], [0, 37, 23], [68, 78, 22],
];

export function bubbleField(items, { onSelect } = {}) {
  const top = [...items].sort((a, b) => b.share - a.share).slice(0, SLOTS.length);
  const field = h('div', { class: 'bubble-field', role: 'list', 'aria-label': 'Share of training sets by muscle group' });
  top.forEach((it, i) => {
    const [l, t, s] = SLOTS[i];
    const C = 2 * Math.PI * 47;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'ring'); svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(ns, 'circle'); track.setAttribute('cx', 50); track.setAttribute('cy', 50); track.setAttribute('r', 47); track.setAttribute('class', 'track');
    const arc = document.createElementNS(ns, 'circle'); arc.setAttribute('cx', 50); arc.setAttribute('cy', 50); arc.setAttribute('r', 47); arc.setAttribute('class', 'arc');
    arc.setAttribute('stroke-dasharray', `0 ${C}`); arc.style.setProperty('--c', C); arc.dataset.to = String(C * Math.min(1, it.share / 100));
    svg.append(track, arc);
    const b = h('button', {
      class: 'bubble', role: 'listitem', type: 'button',
      'aria-label': `${it.label}: ${it.share.toFixed(1)} percent of sets`,
      style: { left: l + '%', top: t + '%', width: s + '%', animationDelay: `${i * 70}ms, ${i * 400}ms`, '--p': it.share.toFixed(1) },
      onclick: () => onSelect?.(it),
    }, svg, h('div', { class: 'b-in' }, icon(it.icon || 'dumbbell', s > 30 ? 24 : 20), h('div', { class: 'b-label' }, it.label), h('div', { class: 'b-val num' }, `${it.share.toFixed(1)}%`)));
    field.append(b);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => field.querySelectorAll('.arc').forEach(a => { a.style.transition = 'stroke-dasharray 1.1s var(--ease)'; a.setAttribute('stroke-dasharray', `${a.dataset.to} ${a.style.getPropertyValue('--c')}`); })));
  return field;
}
