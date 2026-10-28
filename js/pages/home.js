import { h } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store, elapsedSeconds } from '../services/store.js';
import { navigate } from '../router.js';
import { greeting, fmtDateLong, fmtClock, fmtDuration, fmtNumber, relativeDay, startOfWeek, startOfDay } from '../utils/format.js';
import { kgToDisplay } from '../calculations/units.js';
import { sessionStats } from '../calculations/lifting.js';
import { detectPRs } from '../calculations/records.js';
import { dayStatus, weeklyCounts } from '../calculations/consistency.js';
import { onSync, syncState } from '../services/sync.js';
import { startRoutine, repeatSession } from '../services/actions.js';
import { WEEKDAYS } from '../data/vocab.js';

function weekWindow(offsetWeeks = 0) {
  const from = startOfWeek(new Date(), store.profile.week_starts_on); from.setDate(from.getDate() - offsetWeeks * 7);
  const to = new Date(from); to.setDate(to.getDate() + 7); return [from, to];
}
function volumeIn(from, to) {
  return store.completed().filter(s => { const d = new Date(s.started_at); return d >= from && d < to; }).reduce((v, s) => v + sessionStats(s).volume, 0);
}

export async function render(params, scope) {
  const p = store.profile, unit = store.unit;
  const name = p.display_name || 'there';
  const done = store.completed();
  const active = store.activeSession();
  const [f0, t0] = weekWindow(0), [f1, t1] = weekWindow(1);
  const volNow = volumeIn(f0, t0), volPrev = volumeIn(f1, t1);
  const weekCount = done.filter(s => new Date(s.started_at) >= f0 && new Date(s.started_at) < t0).length;

  // ---- hero
  const volDisp = kgToDisplay(volNow, unit);
  const whole = Math.floor(volDisp).toLocaleString();
  let pillText = 'Ready when you are', pillIcon = 'bolt';
  if (volNow > 0 && volPrev > 0) { const d = ((volNow - volPrev) / volPrev) * 100; pillIcon = d >= 0 ? 'arrow-up-right' : 'arrow-down-right'; pillText = `${Math.abs(d).toFixed(1)}% ${d >= 0 ? 'more' : 'less'} than last week`; }
  else if (volNow > 0) pillText = `${weekCount} workout${weekCount === 1 ? '' : 's'} this week`;
  else if (volPrev > 0) pillText = 'No lifting logged yet this week';

  const bell = h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Sync status and notifications', onclick: () => navigate('/sync') }, icon('bell', 22), h('span', { class: 'badge-dot', hidden: true }));
  scope.add(onSync((s) => { const dot = bell.querySelector('.badge-dot'); dot.hidden = s.state === 'synced'; dot.style.background = s.state === 'synced' ? '' : s.state === 'offline' || s.state === 'pending' ? 'var(--warning)' : 'var(--danger)'; }));
  const avatar = h('button', { class: 'avatar glass is-pressable', 'aria-label': 'Open profile', onclick: () => navigate('/profile') }, (name[0] || 'P').toUpperCase());

  // ---- today's plan
  const sched = p.weekly_schedule || {};
  const plan = sched[new Date().getDay()];
  const todaysRoutine = plan && plan !== 'rest' ? store.routines.find(r => r.id === plan && !r.archived_at) : null;
  const isRest = plan === 'rest';
  const clock = h('span', { class: 'num' });
  const card = h('div', { class: 'deck' }, h('div', { class: 'glass today-card' },
    h('div', { class: 'label' }, active ? 'In progress' : isRest ? 'Planned rest day' : todaysRoutine ? "Today's workout" : 'Today'),
    h('div', { class: 'name' }, active ? active.name : todaysRoutine ? todaysRoutine.name : isRest ? 'Rest & recover' : 'Train your way'),
    h('div', { class: 'meta' },
      active ? [h('span', null, icon('timer', 14), ' ', clock), h('span', null, `${active.exercises.length} exercises`)]
        : todaysRoutine ? [h('span', null, `${todaysRoutine.exercises.length} exercises`), h('span', null, `${todaysRoutine.exercises.reduce((n, e) => n + (e.target_sets || 3), 0)} sets`)]
        : isRest ? h('span', null, 'Rest days never count as missed.') : h('span', null, 'No plan for today — pick a routine or start empty.'))));
  if (active) { const upd = () => { clock.textContent = fmtClock(elapsedSeconds(active)); }; upd(); scope.interval(upd, 1000); }

  const primary = h('button', { class: 'btn action-pill is-pressable', onclick: () => active ? navigate('/workout/active') : todaysRoutine ? startRoutine(todaysRoutine) : navigate('/workout') },
    icon(active ? 'play' : 'arrow-up-right', 18), active ? 'Resume' : todaysRoutine ? 'Start' : 'Train');
  const last = done[0];
  const middle = h('button', { class: 'icon-btn action-pill', 'aria-label': last ? `Repeat ${last.name}` : 'Search exercises', title: last ? 'Repeat last workout' : 'Exercise library', onclick: () => last && !active ? repeatSession(last) : navigate('/exercises') }, icon(last && !active ? 'repeat' : 'swap', 22));
  const secondary = h('button', { class: 'btn action-pill', onclick: () => navigate('/plan') }, icon('arrow-down-right', 18), 'Routines');

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'between-row' }, avatar, h('div', { class: 'greet' }, h('div', { class: 'g1' }, `${greeting()}, ${name}`), h('div', { class: 'g2' }, fmtDateLong())), bell),
    h('div', { class: 'eyebrow' }, 'Lifted this week'),
    h('div', { class: 'big num' }, whole, h('span', { class: 'cents' }, ` ${unit}`)),
    h('div', { class: 'pill-note' }, icon(pillIcon, 14), pillText),
    card, h('div', { class: 'action-row' }, primary, middle, secondary));

  // ---- sheet
  const sheetKids = [];
  if (!done.length && !active) {
    sheetKids.push(h('div', { class: 'sheet-head' }, h('h2', null, 'Start your first workout')),
      h('div', { class: 'stack' },
        h('p', { class: 'muted', style: { lineHeight: 1.5 } }, 'Everything you log stays private to your account and keeps working offline. Your history, records and trends will appear here as you train.'),
        h('div', { class: 'list' },
          h('button', { class: 'list-row', onclick: () => navigate('/workout') }, h('span', { class: 'ico' }, icon('play', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Start an empty workout'), h('div', { class: 's' }, 'Add exercises as you go')), icon('chevron-right', 18)),
          h('button', { class: 'list-row', onclick: () => navigate('/routine/new') }, h('span', { class: 'ico' }, icon('edit', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Build a routine'), h('div', { class: 's' }, 'Plan your split')), icon('chevron-right', 18)),
          h('button', { class: 'list-row', onclick: () => navigate('/exercises') }, h('span', { class: 'ico' }, icon('search', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, 'Browse exercises'), h('div', { class: 's' }, `${store.exercises.length} exercises with instructions`)), icon('chevron-right', 18)))));
  } else {
    // week strip
    const start = startOfWeek(new Date(), p.week_starts_on);
    const wk = h('div', { class: 'week-dots', role: 'list', 'aria-label': 'This week' }, Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const st = dayStatus(d, sched, store.sessions, new Date(), p.settings.schedule_since ? new Date(p.settings.schedule_since) : null);
      const isToday = startOfDay(d).getTime() === startOfDay(new Date()).getTime();
      const lbl = { done: 'workout done', rest: 'rest day', missed: 'planned workout not done', planned: 'workout planned', none: 'no plan' }[st.state];
      return h('div', { class: `d ${st.state}${isToday ? ' today' : ''}`, role: 'listitem', 'aria-label': `${WEEKDAYS[d.getDay()]} ${d.getDate()}: ${lbl}` }, h('span', null, WEEKDAYS[d.getDay()][0]), h('span', { class: 'c' }, st.state === 'done' ? icon('check', 18) : String(d.getDate())));
    }));
    const wc = weeklyCounts(store.sessions, 4, p.week_starts_on);
    const avg4 = wc.reduce((a, w) => a + w.count, 0) / 4;
    const lastW = store.weightSeries().slice(-1)[0];
    sheetKids.push(
      h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'This week'), h('a', { class: 'link', href: '#/plan' }, 'Calendar')), wk,
        h('div', { class: 'grid-3' },
          h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Workouts'), h('span', { class: 'v' }, String(weekCount))),
          h('div', { class: 'stat' }, h('span', { class: 'k' }, '4-wk average'), h('span', { class: 'v' }, fmtNumber(avg4, 1), h('small', null, '/wk'))),
          h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Body weight'), h('span', { class: 'v' }, lastW ? fmtNumber(kgToDisplay(lastW.value, unit), 1) : '—', lastW ? h('small', null, unit) : null)))));
    // recent workouts
    const recent = done.slice(0, 4);
    sheetKids.push(h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Recent workouts'), h('a', { class: 'link', href: '#/history' }, 'View All')),
      recent.length ? h('div', { class: 'list' }, recent.map(s => { const st = sessionStats(s); return h('button', { class: 'list-row', onclick: () => navigate('/session/' + s.id) },
        h('span', { class: 'ico' }, icon('dumbbell', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, s.name), h('div', { class: 's' }, relativeDay(s.ended_at || s.started_at))),
        h('span', { class: 'end' }, st.volume ? `${fmtNumber(kgToDisplay(st.volume, unit), 0)} ${unit}` : fmtDuration(s.duration_seconds))); }))
        : h('p', { class: 'muted' }, 'Finish a workout and it will show up here.')));
    // PRs from the 8 most recent completed sessions
    const prs = [];
    for (const s of done.slice(0, 8)) {
      const prior = done.filter(x => new Date(x.started_at) < new Date(s.started_at));
      for (const pr of detectPRs(s, prior)) prs.push({ ...pr, date: s.ended_at || s.started_at });
      if (prs.length >= 3) break;
    }
    if (prs.length) sheetKids.push(h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Recent records')),
      h('div', { class: 'list' }, prs.slice(0, 3).map(pr => h('button', { class: 'list-row', onclick: () => navigate('/exercise/' + pr.exerciseId) },
        h('span', { class: 'ico pr' }, icon('trophy', 22)), h('span', { class: 'grow' }, h('div', { class: 't' }, pr.name), h('div', { class: 's' }, `${pr.label}${pr.estimated ? ' (estimate)' : ''} · ${relativeDay(pr.date).split(',')[0]}`)),
        h('span', { class: 'end' }, pr.unit === 'kg' ? `${fmtNumber(kgToDisplay(pr.value, unit), 1)} ${unit}` : `${Math.round(pr.value)} ${pr.unit}`))))));
    // quick access
    sheetKids.push(h('div', { class: 'grid-2' },
      h('button', { class: 'card is-pressable tile', onclick: () => navigate('/exercises') }, icon('search', 22), h('h3', null, 'Exercises'), h('span', { class: 'sub' }, 'Search & filter')),
      h('button', { class: 'card is-pressable tile', onclick: () => navigate('/progress') }, icon('chart', 22), h('h3', null, 'Progress'), h('span', { class: 'sub' }, 'Charts & records'))));
  }

  return h('div', { class: 'view page-inner' }, hero, h('div', { class: 'sheet' }, ...sheetKids));
}
