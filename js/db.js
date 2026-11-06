'use strict';

// Armazenamento local em IndexedDB: quiz atual ("kv") e banco de perguntas ("bank").
// O IndexedDB aguenta ficheiros de áudio/vídeo, ao contrário do localStorage.

const DB_NAME = 'quizcreator';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('bank')) db.createObjectStore('bank', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const kvGet = key => tx('kv', 'readonly', s => s.get(key));
const kvSet = (key, value) => tx('kv', 'readwrite', s => { s.put(value, key); });
const bankGetAll = () => tx('bank', 'readonly', s => s.getAll());
const bankPutMany = entries => tx('bank', 'readwrite', s => { entries.forEach(e => s.put(e)); });
const bankDeleteOne = id => tx('bank', 'readwrite', s => { s.delete(id); });
