import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { back } from '../router.js';
import { calcPlates, DEFAULT_PLATES_KG, DEFAULT_PLATES_LB } from '../calculations/plates.js';
import { parseNum } from '../calculations/units.js';

export async function render() {
  const unit = store.unit, defaults = unit === 'lb' ? DEFAULT_PLATES_LB : DEFAULT_PLATES_KG;
  const saved = store.profile.settings.plates?.unit === unit ? store.profile.settings.plates : null;
  const st = { target: '', bar: String(saved?.bar ?? (unit === 'lb' ? 45 : 20)), plates: new Set(saved?.plates || defaults) };
  const all = unit === 'lb' ? [55, 45, 35, 25, 10, 5, 2.5, 1.25] : [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
  const out = h('div', { class: 'stack', 'aria-live': 'polite' });
  const target = h('input', { class: 'input', inputmode: 'decimal', placeholder: `Total weight (${unit})`, 'aria-label': 'Target total weight', autofocus: true });
  const bar = h('input', { class: 'input', inputmode: 'decimal', value: st.bar, 'aria-label': 'Bar weight' });
  const chips = h('div', { class: 'chip-row wrap' });
  const persist = () => store.updateProfile({ settings: { plates: { unit, bar: parseNum(bar.value) ?? 20, plates: [...st.plates] } } });
  function drawChips() { clear(chips); all.forEach(p => chips.append(h('button', { type: 'button', class: 'chip' + (st.plates.has(p) ? ' is-on' : ''), 'aria-pressed': String(st.plates.has(p)), onclick: () => { st.plates.has(p) ? st.plates.delete(p) : st.plates.add(p); drawChips(); calc(); persist(); } }, `${p} ${unit}`))); }
  function calc() {
    clear(out);
    const r = calcPlates({ target: parseNum(target.value), bar: parseNum(bar.value), plates: [...st.plates] });
    if (!target.value) { out.append(h('p', { class: 'muted' }, 'Enter the total weight on the bar (including the bar). Plates are loaded equally on both sides.')); return; }
    if (r.error) { out.append(h('div', { class: 'rec-card decline' }, r.error)); return; }
    const bars = r.perSide.flatMap(p => Array.from({ length: p.count }, () => p.plate));
    const max = Math.max(...all);
    out.append(h('div', { class: 'plate-viz', role: 'img', 'aria-label': `Each side: ${r.perSide.map(p => `${p.count} × ${p.plate}`).join(', ') || 'no plates'}` },
      h('div', { class: 'bar-end' }), ...bars.map((p, i) => h('div', { class: 'plate-bar', style: { height: `${30 + (p / max) * 70}%`, animationDelay: `${i * 60}ms` } }, h('span', null, String(p)))), h('div', { class: 'bar-tip' })));
    out.append(h('div', { class: 'list' }, r.perSide.length ? r.perSide.map(p => h('div', { class: 'list-row compact' }, h('span', { class: 'grow t' }, `${p.plate} ${unit}`), h('span', { class: 'end' }, `× ${p.count} per side`))) : h('div', { class: 'list-row compact' }, h('span', { class: 'grow t' }, 'Just the bar'))));
    out.append(h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Total loaded'), h('span', { class: 'v' }, `${+r.loaded.toFixed(2)}`, h('small', null, unit))));
    if (!r.exact) out.append(h('div', { class: 'rec-card decline' }, h('b', null, 'Not exactly reachable'), h('span', { class: 'why' }, r.note)));
  }
  target.addEventListener('input', calc); bar.addEventListener('input', () => { calc(); persist(); });
  drawChips(); calc();
  return h('div', { class: 'view page-inner' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: () => back('/profile') }, icon('arrow-left', 22)), h('div', { class: 'title' }, 'Plate calculator'), h('span', { style: { width: '48px' } })),
    h('div', { class: 'hero hero-compact' }, h('div', { class: 'eyebrow' }, 'Per side'), h('div', { class: 'big' }, 'Load the bar')),
    h('div', { class: 'sheet' }, h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', null, 'Target'), target), h('div', { class: 'field' }, h('label', null, `Bar (${unit})`), bar)), h('div', { class: 'field' }, h('label', null, 'Plates you have'), chips), out));
}
