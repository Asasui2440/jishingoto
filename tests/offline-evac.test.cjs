/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');
const core=import('../public/offline-evac/core.mjs');
const a={lat:35.718,lng:139.731},b={lat:35.723,lng:139.736};
test('地図投影の往復・道路の取得範囲が経路と周囲を含む',async()=>{
  const {project,unproject,tilePlan}=await core;const p=unproject(project(a));assert(Math.abs(p.lat-a.lat)<1e-8);assert(Math.abs(p.lng-a.lng)<1e-8);
  const plan=tilePlan([a,b]);assert(plan.length>=9&&plan.length<=64);
  for(const point of [a,b]){const p=project(point);assert(plan.some(t=>t.x===Math.floor(p.x/256)&&t.y===Math.floor(p.y/256)));}
});
test('無効な位置や広すぎる地域では道路を一括取得しない',async()=>{
  const {tilePlan,validPoint}=await core;assert.throws(()=>tilePlan([a,{lat:NaN,lng:139}]));assert.throws(()=>tilePlan([a,{lat:45,lng:140}]));assert(!validPoint({lat:0,lng:0}));
});
test('保存マップの重複は出発地点・避難先・災害種別で判定する',async()=>{
 const {sameRoute}=await import('../public/offline-evac/storage.mjs');const r={id:'a',start:a,shelter:b,scenario:'earthquake',demo:false};
 assert(sameRoute(r,{...r,id:'b',name:'名称変更',savedAt:999}));
 assert(!sameRoute(r,{...r,start:{...a,lat:a.lat+.001}}));assert(!sameRoute(r,{...r,scenario:'flood'}));assert(!sameRoute(r,{...r,demo:true}));
 assert(!sameRoute({id:'old'},{id:'other'}));
});
