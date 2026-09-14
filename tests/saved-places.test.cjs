/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/lib/saved-places.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function api(storage){const loaded={exports:{}};new Function('module','exports','localStorage',code)(loaded,loaded.exports,storage);return loaded.exports;}
test('自宅・会社・学校を個別に保存し、他の登録を保持する。保存失敗や不正座標を成功にしない',()=>{
 let raw=null;const storage={getItem:()=>raw,setItem:(_key,value)=>{raw=value;}},places=api(storage);
 const home={position:{lat:35.72,lng:139.73},label:'自宅付近',savedAt:1};places.savePlace('home',home);places.savePlace('work',{...home,label:'会社',savedAt:2});assert.deepEqual(Object.keys(places.readPlaces()),['home','work']);assert.deepEqual(places.readPlaces().home,home);
 assert.throws(()=>places.savePlace('school',{...home,position:{lat:NaN,lng:139}}));assert.equal(places.readPlaces().school,undefined);
 storage.setItem=()=>{throw new DOMException('full','QuotaExceededError');};assert.throws(()=>places.savePlace('home',{...home,label:'更新'}));assert.equal(places.readPlaces().home.label,'自宅付近');
});
test('保存マップも同じ自宅登録を読み、更新後の自宅と古い経路を区別する',async()=>{
 const {registeredPlaces,changedHome}=await import('../public/offline-evac/places.mjs');const previous=global.localStorage;
 try{const home={position:{lat:35.72,lng:139.73},label:'自宅',savedAt:1};global.localStorage={getItem:()=>JSON.stringify({home})};assert.deepEqual(registeredPlaces().home,home);assert(!changedHome({purpose:'home',shelter:home.position},home));assert(changedHome({purpose:'home',shelter:{lat:35.71,lng:139.73}},home));assert(!changedHome({purpose:'evacuation'},home));global.localStorage={getItem:()=>'{broken'};assert.deepEqual(registeredPlaces(),{});}finally{global.localStorage=previous;}
});
test('帰宅コースは登録済みの会社・学校と自宅を使い、未登録や変更済みの地点を拒否する',()=>{
 const base={position:{lat:35.721,lng:139.732},label:'自宅',savedAt:1},places={home:base,work:{...base,position:{lat:35.718,lng:139.731}},school:{...base,position:{lat:35.719,lng:139.73}}};
 const stored=api({getItem:()=>JSON.stringify(places)});
 for(const from of ['work','school']){const c=stored.homeCourse(from);assert.deepEqual(c.start,places[from].position);assert.equal(c.shelter.name,'自宅');assert.equal(c.shelter.purpose,'home');assert.equal(stored.resolveHomeCourse(c.shelter,c.start).commuteFrom,from);assert.throws(()=>stored.resolveHomeCourse(c.shelter,c.start,{...places,home:{...base,position:{lat:35.725,lng:139.732}}}),/変わっています/);}
 assert.throws(()=>stored.homeCourse('work',{home:base}),/会社と自宅/);
});
