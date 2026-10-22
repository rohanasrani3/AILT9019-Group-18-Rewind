// Local course storage (IndexedDB). Everything Rewind indexes stays on this device.
// Stores: meta (small listing record), courses (captions, windows, boundaries), vectors (Float32 buffer).
// Deleting a course removes all three in one transaction.
import { toStored, fromStored } from '../core/serialize.js';
import { coverage } from '../core/search.js';

const DB_NAME = 'rewind';
const STORES = ['meta', 'courses', 'vectors'];

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export function openDB(idb = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const r = idb.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'courseId' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function createStore(idb) {
  const dbp = openDB(idb);

  return {
    async save(index) {
      const db = await dbp;
      const { json, vectors } = toStored(index);
      const meta = { courseId: json.courseId, title: json.title, source: json.source, origin: json.origin ?? null, builtAt: json.builtAt, model: json.model ?? null, coverage: coverage(index), windows: json.windows.length };
      const tx = db.transaction(STORES, 'readwrite');
      tx.objectStore('meta').put(meta);
      tx.objectStore('courses').put(json);
      if (vectors) tx.objectStore('vectors').put({ courseId: json.courseId, buffer: vectors });
      else tx.objectStore('vectors').delete(json.courseId);
      await done(tx);
      return meta;
    },

    async list() {
      const db = await dbp;
      const all = await req(db.transaction('meta').objectStore('meta').getAll());
      return all.sort((a, b) => String(b.builtAt).localeCompare(String(a.builtAt)));
    },

    async load(courseId) {
      const db = await dbp;
      const tx = db.transaction(['courses', 'vectors']);
      const [json, vec] = await Promise.all([req(tx.objectStore('courses').get(courseId)), req(tx.objectStore('vectors').get(courseId))]);
      if (!json) return null;
      return fromStored(json, vec?.buffer ?? null);
    },

    async remove(courseId) {
      const db = await dbp;
      const tx = db.transaction(STORES, 'readwrite');
      for (const s of STORES) tx.objectStore(s).delete(courseId);
      await done(tx);
    },

    async clearAll() {
      const db = await dbp;
      const tx = db.transaction(STORES, 'readwrite');
      for (const s of STORES) tx.objectStore(s).clear();
      await done(tx);
    },

    // Used by tests and the Setup tab to show that nothing is left behind.
    async counts() {
      const db = await dbp;
      const tx = db.transaction(STORES);
      const out = {};
      for (const s of STORES) out[s] = await req(tx.objectStore(s).count());
      return out;
    },
  };
}
