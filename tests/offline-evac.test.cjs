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
