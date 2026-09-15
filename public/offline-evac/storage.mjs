import { MAX_ROUTES, validPoint } from './core.mjs';
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
// Result timestamps are record IDs, not the identity of a saved journey.
export function routeKey(route) {
  if(!validPoint(route.start)||!validPoint(route.shelter))return `id:${route.id}`;
  const point=p=>`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  return [route.purpose||'evacuation',route.scenario||(route.kind?.includes('洪水')?'flood':'earthquake'),!!route.demo,point(route.start),point(route.shelter)].join('|');
}
export function sameRoute(a,b){return routeKey(a)===routeKey(b);}
function aliases(records,id){return [...new Set(records.flatMap(r=>[r.id,...(r.aliases||[])]))].filter(value=>value!==id);}
function consolidate(records,store){
  const groups=new Map();
  for(const record of [...records].sort((a,b)=>b.savedAt-a.savedAt)){
    const key=routeKey(record),group=groups.get(key)||[];group.push(record);groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    const newest=group[0];
    if(group.length===1)return newest;
    const merged={...newest,aliases:aliases(group,newest.id)};
    for(const old of group.slice(1))store.delete(old.id);
    store.put(merged);return merged;
  });
}
export async function allRoutes() {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('routes','readwrite'),store=tx.objectStore('routes'),req=store.getAll();let result=[];
    req.onsuccess=()=>{try{result=consolidate(req.result,store);}catch{tx.abort();}};
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error('保存した経路を読み込めませんでした。'));};
  });
}
export async function putRoute(route) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('routes','readwrite'),store=tx.objectStore('routes');let limit=false;
    const req=store.getAll();
    req.onsuccess=()=>{
      try {
      const records=consolidate(req.result,store),matches=records.filter(r=>r.id===route.id||sameRoute(r,route));
      if(records.length-matches.length>=MAX_ROUTES){limit=true;tx.abort();return;}
      // Replacements and cleanup commit together; quota failure keeps the old maps.
      for(const old of matches)if(old.id!==route.id)store.delete(old.id);
      store.put({...route,aliases:aliases([...matches,route],route.id)});
      }catch{tx.abort();}
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error(limit?'保存は5件までです。不要な経路を削除してください。':'端末に保存できませんでした。空き容量を確認してください。以前の保存は残っています。'));};
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
