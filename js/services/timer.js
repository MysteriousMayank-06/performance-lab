// Rest timer. Timestamp-based (endsAt) so it stays accurate even if the tab is throttled or the phone sleeps.
// Browsers may delay sounds/notifications while a page is in the background; the displayed time is always right on return.
import { store } from './store.js';

const KEY = 'pl_rest';
const subs = new Set();
let state = null, tick = null, ctx = null;

try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); if (state && state.endsAt < Date.now() - 60000) state = null; } catch { state = null; }

const persist = () => { try { state ? localStorage.setItem(KEY, JSON.stringify(state)) : localStorage.removeItem(KEY); } catch { /* ignore */ } };
const emit = () => subs.forEach(fn => fn(restTimer.snapshot()));

function beep() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i === 2 ? 1175 : 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* audio not available */ }
}

function loop() {
  clearInterval(tick);
  if (!state) return;
  tick = setInterval(() => {
    if (!state) return clearInterval(tick);
    if (Date.now() >= state.endsAt) finish(); else emit();
  }, 250);
}

function finish() {
  const s = store.profile.settings;
  if (s.sound !== false) beep();
  if (s.vibrate !== false && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Rest over', { body: 'Time for your next set.', tag: 'rest', silent: false }); } catch { /* ignore */ }
  }
  state = { ...state, done: true, endsAt: Date.now() }; persist(); clearInterval(tick); emit();
  setTimeout(() => { if (state?.done) { state = null; persist(); emit(); } }, 4000);
}

export const restTimer = {
  start(seconds) { if (!seconds || seconds < 1) return; state = { total: seconds, endsAt: Date.now() + seconds * 1000, done: false }; persist(); loop(); emit(); },
  add(seconds) { if (!state || state.done) return; state.endsAt += seconds * 1000; state.total += seconds; persist(); emit(); },
  skip() { state = null; persist(); clearInterval(tick); emit(); },
  snapshot() { return state ? { active: true, done: !!state.done, remaining: Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)), total: state.total } : { active: false, remaining: 0, total: 0 }; },
  subscribe(fn) { subs.add(fn); fn(restTimer.snapshot()); return () => subs.delete(fn); },
  resume() { if (state && !state.done) loop(); },
};
restTimer.resume();
