/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/place-selection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const {selectUIPlace,validUIOrigin,canSaveHome,PLACES_CACHE_MS}=mod.exports;
const place={id:'test-building',location:{lat:()=>35.66556,lng:()=>139.73946},displayName:'返された名称を保存しない',formattedAddress:'返された住所を保存しない'};
test('UI Kitの選択座標と取得時刻を使い、Googleの名称・住所を保存しない',()=>{
 const time=Date.now()-1000,selection=selectUIPlace(place,' アークヒルズサウスタワー ',time);
 assert.deepEqual(selection.position,{lat:35.66556,lng:139.73946});assert.equal(selection.label,'アークヒルズサウスタワー');assert.equal(selection.origin.expiresAt,time+30*86400000);assert.equal(selection.origin.acquiredAt,time);assert.equal(selection.origin.placeId,'test-building');assert(!JSON.stringify(selection).includes('返された'));
});
test('座標欠落・国内範囲外・期限切れの候補は出発地点にしない',()=>{
 for(const value of [{id:'x'}, {...place,location:{lat:()=>NaN,lng:()=>139}}, {...place,location:{lat:()=>50,lng:()=>139}}])assert.throws(()=>selectUIPlace(value,'test',Date.now()));
 assert.throws(()=>selectUIPlace(place,'test',Date.now()-PLACES_CACHE_MS));
});
test('30日期限境界と再保存の扱い、旧検索・地図タップは新規保存を拒否する',async()=>{
 const {saveOrigin,expiredRoute}=await import('../public/offline-evac/expiry.mjs');
 const fetched=10000,origin={kind:'places-ui-kit',placeId:'test',acquiredAt:fetched,expiresAt:fetched+PLACES_CACHE_MS};
 assert(validUIOrigin(origin,origin.expiresAt-1));assert(!validUIOrigin(origin,origin.expiresAt));
 assert(canSaveHome(origin,false,origin.expiresAt-1));assert(!canSaveHome(null));assert(!canSaveHome({kind:'google-map'}));assert(canSaveHome({kind:'device'}));
 assert.deepEqual(saveOrigin(origin,false,fetched+100),origin);assert.deepEqual(saveOrigin(origin,false,fetched+200),origin);
 assert.throws(()=>saveOrigin({...origin,expiresAt:origin.expiresAt+1},false,fetched+100));
 assert.throws(()=>saveOrigin(origin,false,origin.expiresAt));
 assert(expiredRoute({homeOrigin:origin},origin.expiresAt));assert(!expiredRoute({homeOrigin:{kind:'device'}},origin.expiresAt));
});
