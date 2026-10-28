// Hash router with animated transitions. Each page gets a scope that is disposed on navigation (no leaked timers/listeners).
import { makeScope, clear } from './utils/dom.js';

const routes = [];
let current = null, token = 0, host = null, onChange = null, guard = null;

export function defineRoute(pattern, loader, meta = {}) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, loader, meta, pattern });
}
export function setGuard(fn) { guard = fn; }
export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) return render();
  if (replace) location.replace(target); else location.hash = path;
}
export function back(fallback = '/home') { if (history.length > 1) history.back(); else navigate(fallback); }
export function currentPath() { return location.hash.replace(/^#/, '') || '/home'; }

function match(path) {
  for (const r of routes) { const m = path.match(r.re); if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; }
  return null;
}

async function render() {
  const my = ++token;
  let path = currentPath().split('?')[0];
  if (guard) { const redirect = guard(path); if (redirect && redirect !== path) { navigate(redirect, { replace: true }); return; } }
  const found = match(path) || match('/home');
  if (!found) return;
  const { route, params } = found;
  if (current) {
    current.scope.dispose();
    const old = host.firstElementChild;
    if (old) { old.classList.add('is-leaving'); await new Promise(r => setTimeout(r, 110)); }
  }
  if (my !== token) return;
  const scope = makeScope();
  let node;
  try { node = await route.loader(params, scope); }
  catch (e) { console.error(e); node = document.createElement('div'); node.className = 'empty'; node.textContent = 'This screen could not load.'; }
  if (my !== token) { scope.dispose(); return; }
  clear(host); host.append(node); host.scrollTop = 0;
  current = { scope, route, params };
  onChange?.(route.meta, path);
}

export function startRouter(hostEl, changeCb) {
  host = hostEl; onChange = changeCb;
  window.addEventListener('hashchange', render);
  return render();
}
export function rerender() { return render(); }
