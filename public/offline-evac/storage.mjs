import { MAX_ROUTES } from './core.mjs';
const DB = 'jishingoto-offline-evac-v1';
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('routes', {keyPath:'id'});
    req.onerror = () => reject(new Error('端末の保存領域を開けません。ブラウザの保存設定を確認してください。'));
    req.onblocked = () => reject(new Error('別のタブを閉じて、もう一度開いてください。'));
    req.onsuccess = () => resolve(req.result);
  });
}
export async function allRoutes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes');
    const req = tx.objectStore('routes').getAll();
    tx.oncomplete = () => { db.close(); resolve(req.result.sort((a,b) => b.savedAt-a.savedAt)); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('保存した経路を読み込めませんでした。')); };
  });
}
export async function putRoute(route) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes', 'readwrite'), store = tx.objectStore('routes');
    let limit = false;
    const count = store.count();
    count.onsuccess = () => {
      const existing = store.get(route.id);
      existing.onsuccess = () => {
        if (count.result >= MAX_ROUTES && !existing.result) { limit = true; tx.abort(); }
        else { try { store.put(route); } catch { tx.abort(); } }
      };
    };
    // Metadata and every tile are one record in one atomic transaction.
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error(limit ? '保存は5件までです。不要な経路を削除してください。' : '端末に保存できませんでした。空き容量を確認してください。以前の保存は残っています。')); };
  });
}
export async function deleteRoute(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('routes','readwrite');
    tx.objectStore('routes').delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('削除できませんでした。もう一度お試しください。')); };
  });
}
