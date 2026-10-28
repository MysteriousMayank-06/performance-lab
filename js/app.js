import { isConfigured } from './config.js';
import { auth } from './auth.js';
import { store } from './services/store.js';
import { sync, onSync, syncState } from './services/sync.js';
import { restTimer } from './services/timer.js';
import { defineRoute, startRouter, navigate, setGuard, currentPath } from './router.js';
import { h, clear, $ } from './utils/dom.js';
import { icon } from './components/icons.js';
import { fmtClock } from './utils/format.js';
import { toast } from './components/ui.js';
import { Local } from './db.js';

const page = $('#page');
const nav = $('#nav');
const statusChip = $('#status');

const TABS = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/plan', label: 'Plan', icon: 'calendar' },
  { path: '/workout', label: 'Workout', icon: 'dumbbell' },
  { path: '/progress', label: 'Progress', icon: 'chart' },
  { path: '/profile', label: 'Profile', icon: 'user' },
];

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('pl_theme', t); } catch { /* ignore */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#0a2a8f' : '#0a2370');
}
applyTheme(localStorage.getItem('pl_theme') || 'light');

function buildNav() {
  clear(nav);
  nav.append(h('span', { class: 'nav-pill', id: 'nav-pill' }));
  TABS.forEach(t => nav.append(h('a', { class: 'nav-item', href: '#' + t.path, 'aria-label': t.label, title: t.label, dataset: { path: t.path } }, icon(t.icon, 24))));
}
function markNav(path, meta) {
  nav.hidden = !!meta.noNav || !store.user;
  nav.classList.toggle('is-hidden', !!meta.fullscreen);
  const idx = TABS.findIndex(t => path === t.path || (meta.tab && meta.tab === t.path));
  nav.querySelectorAll('.nav-item').forEach((a, i) => { if (i === idx) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  nav.style.setProperty('--i', Math.max(0, idx));
  $('#nav-pill').style.opacity = idx < 0 ? 0 : 1;
}

// ------------------------------------------------------------------ routes (lazy-loaded modules)
const lazy = (mod, fn = 'render') => async (params, scope) => (await import(mod))[fn](params, scope);
defineRoute('/home', lazy('./pages/home.js'), { tab: '/home' });
defineRoute('/plan', lazy('./pages/plan.js'), { tab: '/plan' });
defineRoute('/routine/:id', lazy('./pages/routine-builder.js'), { tab: '/plan', fullscreen: true });
defineRoute('/workout', lazy('./pages/workout-start.js'), { tab: '/workout' });
defineRoute('/workout/active', lazy('./pages/workout-active.js'), { tab: '/workout', fullscreen: true });
defineRoute('/session/:id', lazy('./pages/session-detail.js'), { tab: '/progress', fullscreen: true });
defineRoute('/progress', lazy('./pages/progress.js'), { tab: '/progress' });
defineRoute('/exercises', lazy('./pages/exercises.js'), { tab: '/plan' });
defineRoute('/exercise/:id', lazy('./pages/exercise-detail.js'), { tab: '/plan', fullscreen: true });
defineRoute('/history', lazy('./pages/history.js'), { tab: '/progress' });
defineRoute('/profile', lazy('./pages/profile.js'), { tab: '/profile' });
defineRoute('/sync', lazy('./pages/sync-page.js'), { tab: '/profile' });
defineRoute('/tools/plates', lazy('./pages/plates.js'), { tab: '/profile', fullscreen: true });
defineRoute('/onboarding', lazy('./pages/onboarding.js'), { noNav: true, fullscreen: true });

setGuard((path) => {
  if (!store.user) return path;
  if (!store.profile.onboarding_completed && path !== '/onboarding') return '/onboarding';
  if (path === '/') return '/home';
  return null;
});

// ------------------------------------------------------------------ status chip + rest dock
function wireStatus() {
  let hideT;
  let prev = null;
  onSync((s) => {
    const msg = s.state === 'offline' ? 'Offline — saving on this device'
      : s.state === 'conflict' ? 'Sync conflict needs attention'
      : s.state === 'failed' ? 'Some changes failed to sync'
      : s.running && s.pending ? 'Syncing…' : null;
    clear(statusChip);
    if (msg) {
      statusChip.append(h('span', { class: 'dot' }), msg);
      statusChip.classList.add('show'); statusChip.classList.toggle('online', s.state === 'synced');
      statusChip.onclick = () => navigate('/sync'); statusChip.style.cursor = 'pointer';
      clearTimeout(hideT);
      if (s.state === 'pending') hideT = setTimeout(() => statusChip.classList.remove('show'), 2500);
    } else {
      if (prev === 'offline') { statusChip.append(h('span', { class: 'dot' }), 'Back online'); statusChip.classList.add('show', 'online'); hideT = setTimeout(() => statusChip.classList.remove('show'), 2000); }
      else statusChip.classList.remove('show');
    }
    prev = s.state;
  });
}

let dock = null;
function wireRestDock() {
  restTimer.subscribe((t) => {
    if (!t.active) { dock?.remove(); dock = null; return; }
    if (!dock) {
      dock = h('div', { class: 'rest-dock glass', role: 'timer', 'aria-label': 'Rest timer' },
        icon('timer', 26), h('div', { class: 'time', id: 'rest-time' }),
        h('button', { class: 'btn btn-glass btn-sm', onclick: () => restTimer.add(15), 'aria-label': 'Add 15 seconds' }, '+15s'),
        h('button', { class: 'btn btn-light btn-sm', onclick: () => restTimer.skip() }, 'Skip'));
      document.body.append(dock);
    }
    dock.querySelector('#rest-time').textContent = t.done ? 'Rest over — go!' : fmtClock(t.remaining);
    dock.classList.toggle('pr-flash', t.done);
  });
}

// ------------------------------------------------------------------ reminders (only while the app is open)
function wireReminders() {
  const check = () => {
    const r = store.profile.settings.reminders;
    if (!r?.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date(), key = 'pl_rem_' + now.toDateString();
    const [hh, mm] = (r.time || '18:00').split(':').map(Number);
    if (now.getHours() !== hh || now.getMinutes() < mm || now.getMinutes() > mm + 5 || localStorage.getItem(key)) return;
    const plan = store.profile.weekly_schedule?.[now.getDay()];
    if (!plan || plan === 'rest' || store.completed().some(s => new Date(s.started_at).toDateString() === now.toDateString())) return;
    localStorage.setItem(key, '1');
    try { new Notification('Workout planned today', { body: store.routines.find(x => x.id === plan)?.name || 'Your session is ready when you are.', tag: 'plan' }); } catch { /* ignore */ }
  };
  setInterval(check, 60000);
}

// ------------------------------------------------------------------ boot
async function showAuth(mode) {
  store.user = null; nav.hidden = true;
  const { renderAuth } = await import('./pages/auth.js');
  clear(page); page.append(renderAuth({ mode, onDone: bootUser }));
}

async function bootUser(session) {
  const user = session.user;
  await store.init(user);
  applyTheme(store.profile.preferred_theme);
  buildNav(); wireStatus(); wireRestDock(); wireReminders();
  store.on((what) => { if (what === 'profile') applyTheme(store.profile.preferred_theme); });
  if (!store.profile.onboarding_completed && navigator.onLine) {
    // A returning user on a new device: pull first so we don't re-run onboarding unnecessarily.
    await Promise.race([sync.run(), new Promise(r => setTimeout(r, 4000))]);
  }
  sync.start();
  if (!location.hash || location.hash === '#/' ) location.hash = '/home';
  await startRouter(page, (meta, path) => markNav(path, meta));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  window.addEventListener('pagehide', () => window.dispatchEvent(new Event('pl:flush')));
}

async function main() {
  if (!isConfigured()) { const { renderSetup } = await import('./pages/auth.js'); clear(page); page.append(renderSetup(() => location.reload())); return; }
  const session = await auth.session();
  const unsub = await auth.onChange(async (evt, s) => {
    if (evt === 'SIGNED_OUT') { Local.close(); location.hash = ''; location.reload(); }
    if (evt === 'PASSWORD_RECOVERY') showAuth('new-password');
  }).catch(() => null);
  if (session) await bootUser(session); else await showAuth('signin');
}
main().catch(e => { console.error(e); clear(page); page.append(h('div', { class: 'auth-wrap' }, h('div', { class: 'glass auth-card' }, h('h2', null, 'Can\'t start the app'), h('p', { class: 'muted' }, 'Check your connection and reload. If this keeps happening, see the README troubleshooting section.')))); });
