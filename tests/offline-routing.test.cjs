/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');
// The external fixture uses OSM's lon key; lng is only the UI point passed to findRoute.
const routing=import('../public/offline-evac/routing.mjs');
const bbox={south:35.70,north:35.74,west:139.70,east:139.75};
const node=(id,lat,lng,tags)=>({type:'node',id,lat,lon:lng,lng,tags});
const way=(id,nodes,tags={})=>({type:'way',id,nodes,tags:{highway:'residential',...tags}});
const a=node(1,35.718,139.730),b=node(2,35.719,139.730),c=node(3,35.719,139.732),d=node(4,35.718,139.732);
test('徒歩経路は道路の曲がり角を通り・私有地の近道を使わない',async()=>{
  const {buildGraph,findRoute}=await routing;const elements=[a,b,c,d,way(10,[1,2,3,4]),way(11,[1,4],{access:'private'})].map(point=>{const osm={...point};delete osm.lng;return osm;});const graph=buildGraph({elements},bbox);
  const route=findRoute(graph,a,d);assert(route.path.some(p=>p.lat===b.lat&&p.lng===b.lng));assert(route.path.some(p=>p.lng===c.lng&&p.lat===c.lat));assert(route.meters>350);
  const changed=findRoute(graph,b,d);assert(changed.meters<route.meters);assert(changed.path[0].lat===b.lat);
});
test('接続しない立体交差をつながず、経路なし・範囲外・遠い点を明示',async()=>{
  const {buildGraph,findRoute}=await routing;
  const a2=node(5,35.717,139.731),b2=node(6,35.720,139.731);
  const graph=buildGraph({elements:[a,b,c,d,a2,b2,way(10,[1,4]),way(11,[5,6])]},bbox);
  assert.throws(()=>findRoute(graph,a,b2),/つながっていない/);
  assert.throws(()=>findRoute(graph,{lat:36,lng:140},d),/保存範囲外/);
  assert.throws(()=>findRoute(graph,{lat:35.735,lng:139.74},d),/80m/);
  assert.throws(()=>findRoute(null,a,d),/道路データがありません/);
});
test('車の一方通行と歩行者の一方通行を区別する',async()=>{
  const {buildGraph,findRoute}=await routing;
  const car=buildGraph({elements:[a,b,way(1,[1,2],{oneway:'yes'})]},bbox);assert(findRoute(car,b,a).meters>0);
  const foot=buildGraph({elements:[a,b,way(1,[1,2],{'oneway:foot':'yes'})]},bbox);assert.throws(()=>findRoute(foot,b,a),/つながっていない/);
  const reverse=buildGraph({elements:[a,b,way(1,[1,2],{'oneway:foot':'-1'})]},bbox);assert(findRoute(reverse,b,a).meters>0);
});
test('徒歩禁止・未開通・条件付き道路、閉じたゲートを除外する',async()=>{
  const {buildGraph,walkable}=await routing;
  for(const tags of [{highway:'motorway',foot:'yes'},{highway:'path',foot:'no'},{highway:'residential',access:'private'},{highway:'path','foot:conditional':'yes @ (Mo-Fr)'},{highway:'construction'}])assert(!walkable(tags));
  assert(walkable({highway:'footway',access:'private',foot:'yes'}));
  assert.throws(()=>buildGraph({elements:[a,{...b,tags:{barrier:'gate'}},c,way(1,[1,2,3])]},bbox),/道路データが見つかりません/);
  assert.throws(()=>buildGraph({elements:[a,b,way(1,[1,2])],remark:'runtime error'},bbox),/不完全/);
});
test('保存地図の範囲外の道路をグラフに含めない',async()=>{
  const {buildGraph,inside}=await routing;
  const graph=buildGraph({elements:[a,b,node(9,36,140),way(1,[1,2,9])]},bbox);assert(graph.nodes.every(n=>inside(n,bbox)));
});
