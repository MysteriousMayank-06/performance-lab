// App-shell cache so the UI loads offline. Workout DATA lives in IndexedDB (see js/db.js), not here.
// Deliberately never caches Supabase API/Storage responses, so one user's private data can't leak to another on a shared device.
const VERSION = 'pl-shell-v2';
const SHELL = ["./", "index.html", "manifest.json", "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png", "css/base.css", "css/components.css", "css/layout.css", "css/pages.css", "css/screens.css", "css/tokens.css", "js/app.js", "js/auth.js", "js/calculations/consistency.js", "js/calculations/fields.js", "js/calculations/lifting.js", "js/calculations/plates.js", "js/calculations/progression.js", "js/calculations/records.js", "js/calculations/substitutes.js", "js/calculations/units.js", "js/components/bubbles.js", "js/components/chart.js", "js/components/exercise-picker.js", "js/components/icons.js", "js/components/muscle-figure.js", "js/components/perf.js", "js/components/set-sheet.js", "js/components/ui.js", "js/config.js", "js/data/exercises.generated.js", "js/data/vocab.js", "js/db.js", "js/pages/auth.js", "js/pages/exercise-detail.js", "js/pages/exercises.js", "js/pages/history.js", "js/pages/home.js", "js/pages/onboarding.js", "js/pages/plan.js", "js/pages/plates.js", "js/pages/profile.js", "js/pages/progress.js", "js/pages/routine-builder.js", "js/pages/session-detail.js", "js/pages/sync-page.js", "js/pages/workout-active.js", "js/pages/workout-start.js", "js/router.js", "js/services/actions.js", "js/services/export.js", "js/services/mappers.js", "js/services/store.js", "js/services/sync.js", "js/services/timer.js", "js/supabase-client.js", "js/utils/dom.js", "js/utils/format.js", "js/utils/id.js"];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/\.supabase\.(co|in|net)$/.test(url.hostname)) return;                 // never touch API / storage
  const sameOrigin = url.origin === location.origin;
  const supabaseLib = url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/');
  if (!sameOrigin && !supabaseLib) return;
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('index.html'))); return; }
  // stale-while-revalidate for static assets
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
