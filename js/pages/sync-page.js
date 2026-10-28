import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { store } from '../services/store.js';
import { sync, syncState, onSync } from '../services/sync.js';
import { Local } from '../db.js';
import { back } from '../router.js';
import { toast } from '../components/ui.js';
import { exportAllJSON } from '../services/export.js';
import { relativeDay } from '../utils/format.js';

const LABEL = { synced: 'All changes saved & synced', pending: 'Changes waiting to sync', offline: 'Offline — saved on this device', failed: 'Some changes failed', conflict: 'Conflict needs your attention' };

export async function render(params, scope) {
  const host = h('div', { class: 'stack' });
  const stateCard = h('div', { class: 'glass state-card' });
  async function draw() {
    clear(host);
    const outbox = await Local.all('outbox'), conflicts = await sync.conflicts(), est = await Local.estimate();
    const failed = outbox.filter(o => o.error);
    host.append(
      h('div', { class: 'grid-2' }, stat('Waiting to sync', String(outbox.length)), stat('Failed', String(failed.length))),
      h('div', { class: 'prev-line' }, syncState.lastSync ? `Last successful sync: ${relativeDay(new Date(syncState.lastSync).toISOString())}` : 'No successful sync yet on this device.'),
      h('button', { class: 'btn btn-ink btn-block', onclick: async (e) => { const b = e.currentTarget; b.setAttribute('aria-busy', 'true'); await sync.run(); b.removeAttribute('aria-busy'); toast(syncState.state === 'synced' ? 'Everything is synced' : syncState.message || 'Sync attempted'); draw(); } }, icon('refresh', 18), 'Sync now / retry'));
    if (conflicts.length) host.append(h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Conflicts')), h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', lineHeight: 1.5 } }, 'This workout was changed on another device while you also edited it here. Nothing was overwritten — choose which version to keep.'),
      ...conflicts.map(c => h('div', { class: 'card stack' }, h('b', null, c.name || 'Workout'), h('div', { class: 'row' },
        h('button', { class: 'btn btn-ink btn-sm', onclick: async () => { await sync.resolveKeepMine(c.id); toast('Kept this device’s version'); draw(); } }, 'Keep mine'),
        h('button', { class: 'btn btn-soft btn-sm', onclick: async () => { try { await sync.resolveUseTheirs(c.id); toast('Used the other version'); } catch { toast('Couldn’t reach the server', { error: true }); } draw(); } }, 'Use the other'))))));
    if (failed.length) host.append(h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Failed changes')), h('div', { class: 'list' }, failed.map(f => h('div', { class: 'list-row compact' }, h('span', { class: 'grow' }, h('div', { class: 't' }, f.kind), h('div', { class: 's' }, `${f.tries} attempts — ${f.error}`)))))));
    host.append(h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'This device')),
      h('div', { class: 'prev-line' }, est ? `Storage used: ${(est.usage / 1048576).toFixed(1)} MB of about ${(est.quota / 1048576).toFixed(0)} MB available` : 'Storage estimate not available in this browser.'),
      h('div', { class: 'prev-line' }, `${store.sessions.length} workouts · ${store.routines.length} routines · ${store.measurements.length} measurements stored locally`),
      h('button', { class: 'btn btn-soft btn-block', onclick: () => { exportAllJSON(); toast('Backup downloaded'); } }, icon('download', 18), 'Download full backup')),
      h('div', { class: 'stack' }, h('div', { class: 'sheet-head' }, h('h2', null, 'Recovery')), h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', lineHeight: 1.6 } }, 'Every set is saved to this device first, then synced. If sync keeps failing, your data is safe locally — download a backup above. On a new device, sign in and your history is pulled from your account. See the README “Backup & restore” section for restoring from the JSON file.')));
    const s = syncState; stateCard.className = 'glass state-card ' + s.state; clear(stateCard); stateCard.append(h('span', { class: 'sync-dot ' + s.state }), h('span', null, LABEL[s.state] + (s.running ? ' (syncing…)' : '')));
  }
  let t; scope.add(onSync(() => { clearTimeout(t); t = setTimeout(draw, 150); })); scope.add(() => clearTimeout(t));
  await draw();
  return h('div', { class: 'view page-inner' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn glass is-pressable', 'aria-label': 'Back', onclick: () => back('/profile') }, icon('arrow-left', 22)), h('div', { class: 'title' }, 'Data & sync'), h('span', { style: { width: '48px' } })),
    h('div', { class: 'hero hero-compact' }, stateCard), h('div', { class: 'sheet' }, host));
}
const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
