// Minimal promise wrapper over IndexedDB. One database PER USER so accounts never mix on a shared device.
const STORES = {
  kv: { keyPath: 'key' },
  exercises: { keyPath: 'id' },
  routines: { keyPath: 'id' },
  sessions: { keyPath: 'id' },
  measurements: { keyPath: 'id' },
  exsettings: { keyPath: 'exercise_id' },
  exnotes: { keyPath: 'exercise_id' },
  outbox: { keyPath: 'key' },
  conflicts: { keyPath: 'id' },
};
const VERSION = 1;
let db = null, name = null;

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const Local = {
  async init(userId) {
    if (db && name === 'pl-' + userId) return;
    this.close();
    name = 'pl-' + userId;
    db = await new Promise((res, rej) => {
      const r = indexedDB.open(name, VERSION);
      r.onupgradeneeded = () => { for (const [s, o] of Object.entries(STORES)) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, o); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('Database upgrade blocked by another tab.'));
    });
    db.onversionchange = () => { db.close(); db = null; };
  },
  close() { if (db) db.close(); db = null; name = null; },
  _s(store, mode = 'readonly') { return db.transaction(store, mode).objectStore(store); },
  get(store, key) { return wrap(this._s(store).get(key)); },
  all(store) { return wrap(this._s(store).getAll()); },
  put(store, value) { return wrap(this._s(store, 'readwrite').put(value)); },
  async putMany(store, values) {
    await new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite'); const s = tx.objectStore(store);
      values.forEach(v => s.put(v)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  del(store, key) { return wrap(this._s(store, 'readwrite').delete(key)); },
  clear(store) { return wrap(this._s(store, 'readwrite').clear()); },
  async kvGet(key, fallback = null) { const r = await this.get('kv', key); return r ? r.value : fallback; },
  kvSet(key, value) { return this.put('kv', { key, value }); },
  async destroy(userId) {
    if (name === 'pl-' + userId) this.close();
    await new Promise((res) => { const r = indexedDB.deleteDatabase('pl-' + userId); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  },
  async estimate() { try { return await navigator.storage.estimate(); } catch { return null; } },
};
