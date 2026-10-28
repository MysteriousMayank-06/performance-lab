// Tiny safe DOM helpers. Text is always inserted as text nodes (never as HTML).
const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly', 'indeterminate']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROP_KEYS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function debounce(fn, ms = 200) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** Collect cleanup functions so pages never leak timers/listeners. */
export function makeScope() {
  const fns = [];
  return {
    add(fn) { fns.push(fn); return fn; },
    interval(fn, ms) { const id = setInterval(fn, ms); fns.push(() => clearInterval(id)); return id; },
    listen(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); fns.push(() => target.removeEventListener(ev, fn, opts)); },
    dispose() { while (fns.length) { try { fns.pop()(); } catch { /* ignore */ } } },
  };
}
