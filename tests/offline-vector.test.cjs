/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const vector=import('../public/offline-evac/vector.mjs');
const bbox={north:35.728,south:35.708,west:139.721,east:139.741};
const fixture=fs.readFileSync(require('node:path').join(__dirname,'fixtures/bunkyo-map.pbf'));
const metadata=()=>new Response(JSON.stringify({tiles:['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf']}));
test('保存用ベクトル地図が指定範囲を覆い、実データのPBFを検証する',async()=>{
  const {vectorPlan,validVectorTile}=await vector;const plan=vectorPlan(bbox);assert.equal(plan.tiles.filter(t=>t.z===14).length,4);assert.deepEqual([...new Set(plan.tiles.map(t=>t.z))].sort(),[12,13,14]);assert(plan.bbox.west<=bbox.west&&plan.bbox.east>=bbox.east&&plan.bbox.north>=bbox.north&&plan.bbox.south<=bbox.south);assert(validVectorTile(fixture));assert(!validVectorTile(fixture.subarray(0,40)));assert(!validVectorTile(Buffer.from('<html>error</html>')));
});
test('ベクトル地図の全データを取得してから返し、同時接続は4以下',async()=>{
 const {downloadVector}=await vector;let active=0,max=0,done=0;const pack=await downloadVector(bbox,n=>done=n,async url=>{if(url.endsWith('/latest'))return metadata();active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return new Response(fixture);});assert(pack.tiles.every(t=>t.blob.size===fixture.length));assert.equal(done,pack.tiles.length);assert(max<=4);
});
test('ベクトル地図の取得失敗・壊れた応答を保存可能として返さない',async()=>{
 const {downloadVector}=await vector;
 for(const response of [()=>new Response('',{status:503}),()=>new Response('<html>'),()=>new Response(fixture.subarray(0,80))])await assert.rejects(()=>downloadVector(bbox,()=>{},async url=>url.endsWith('/latest')?metadata():response()));
});
