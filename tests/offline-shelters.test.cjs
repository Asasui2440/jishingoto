/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');
const modulePromise=import('../public/offline-evac/shelters.mjs');
const bbox={south:35.708,north:35.728,west:139.721,east:139.741};
const feature=(name,lng,lat,flags={disaster4:1})=>({geometry:{type:'Point',coordinates:[lng,lat]},properties:{name,...flags}});
test('保存範囲・災害種別で絞り込み、重複と不正な位置を除外する',async()=>{
 const {parseShelters}=await modulePromise;const a=feature('地震の公園',139.73,35.72);const features=[a,a,feature('洪水のみ',139.731,35.721,{disaster1:1}),feature('範囲外',140,36),feature('不正','bad',35.72)];
 assert.deepEqual(parseShelters(features,bbox,'earthquake').map(s=>s.name),['地震の公園']);assert.deepEqual(parseShelters(features,bbox,'flood').map(s=>s.name),['洪水のみ']);assert.throws(()=>parseShelters(features,bbox,'tsunami'));
});
test('保存データだけで現在地から並べ替え、元の避難先も残す',async()=>{
 const {nearbyShelters}=await modulePromise;const record={id:'old',name:'元の公園',shelter:{lat:35.725,lng:139.735},mapPack:{version:1},graph:{bbox},shelters:[{id:'near',name:'近い公園',position:{lat:35.721,lng:139.731}}]};
 assert.deepEqual(nearbyShelters(record,{lat:35.72,lng:139.73}).map(s=>s.name),['近い公園','元の公園']);assert.equal(nearbyShelters({...record,shelters:undefined},{lat:35.72,lng:139.73}).length,1);
});
test('境界をまたぐ地域の全タイルを取得し、取得失敗や不正JSONを空の成功にしない',async()=>{
 const {shelterTiles,fetchShelters}=await modulePromise;const {unproject}=await import('../public/offline-evac/core.mjs');const p=unproject({x:909*256,y:403*256},10);const edge={north:p.lat+.001,south:p.lat-.001,west:p.lng-.001,east:p.lng+.001};assert.equal(shelterTiles(edge).length,4);
 let count=0;const result=await fetchShelters(bbox,'earthquake',async()=>{count++;return new Response(JSON.stringify({features:[feature('公園',139.73,35.72)]}));});assert.equal(count,shelterTiles(bbox).length);assert.equal(result.shelters.length,1);assert(result.sheltersSavedAt);
 for(const response of [()=>new Response('',{status:503}),()=>new Response('{}'),()=>new Response('bad')])await assert.rejects(()=>fetchShelters(bbox,'earthquake',async()=>response()));
});
test('別の保存マップも統合し、20件を超えて表示し、重複・別災害・練習データを混ぜない',async()=>{
 const {nearbyShelters}=await modulePromise;
 const current={id:'a',name:'元の公園',shelter:{lat:35.725,lng:139.735},mapPack:{version:1},graph:{bbox},scenario:'earthquake'};
 const many=Array.from({length:25},(_,i)=>({name:`公園${i}`,position:{lat:35.72+i*.0001,lng:139.731}}));
 const other={...current,id:'b',shelters:many};
 const result=nearbyShelters(current,{lat:35.72,lng:139.73},[current,other,{...other,id:'flood',scenario:'flood',shelters:[{name:'洪水専用',position:many[0].position}]},{...other,id:'demo',demo:true,shelters:[{name:'練習',position:many[0].position}]}]);
 assert.equal(result.length,26);assert.equal(result.filter(s=>s.name==='元の公園').length,1);assert(result.every(s=>s.mapIds.includes('a')&&s.mapIds.includes('b')));
});
test('現在地を覆う別地域の地図を選べる。離れた避難先は残して未保存経路を識別する',async()=>{
 const {nearbyShelters}=await modulePromise;
 const a={id:'a',name:'近い公園',shelter:{lat:35.72,lng:139.73},mapPack:{version:1},graph:{bbox}};
 const b={id:'b',name:'別地域の公園',shelter:{lat:36.02,lng:140.03},mapPack:{version:1},graph:{bbox:{south:36,north:36.04,west:140,east:140.05}}};
 const list=nearbyShelters(a,{lat:36.021,lng:140.03},[a,b]);assert.equal(list[0].name,'別地域の公園');assert.deepEqual(list[0].mapIds,['b']);assert.deepEqual(list[1].mapIds,[]);
});

test('旧形式で道路地図を持たない保存は候補に残して経路表示には使わない',async()=>{
 const {nearbyShelters}=await modulePromise;const old={id:'old',name:'旧保存',shelter:{lat:35.72,lng:139.73},graph:{bbox}};assert.deepEqual(nearbyShelters(old,{lat:35.721,lng:139.73})[0].mapIds,[]);
});
