import { project, distance } from './core.mjs';
import { inside } from './routing.mjs';
const SCENARIOS={earthquake:{layer:'skhb04',flag:'disaster4',label:'地震'},flood:{layer:'skhb01',flag:'disaster1',label:'洪水'}};
export function shelterTiles(bbox) {
  const nw=project({lat:bbox.north,lng:bbox.west},10),se=project({lat:bbox.south,lng:bbox.east},10),tiles=[];
  for(let x=Math.floor(nw.x/256);x<=Math.floor(se.x/256);x++)for(let y=Math.floor(nw.y/256);y<=Math.floor(se.y/256);y++)tiles.push({x,y});
  if(!tiles.length||tiles.length>4)throw new Error('周辺の避難先を保存する範囲が広すぎます。');
  return tiles;
}
export function parseShelters(features,bbox,scenario) {
  const spec=SCENARIOS[scenario];if(!spec)throw new Error('対応する災害を選んで保存し直してください。');
  const seen=new Set();
  return features.flatMap(f=>{
    const c=f.geometry?.coordinates,p=f.properties??{};
    if(f.geometry?.type!=='Point'||!Array.isArray(c))return [];
    const position={lat:c[1],lng:c[0]},name=String(p.name??p['名称']??'').trim();
    if(!inside(position,bbox)||!name||String(p[spec.flag])!=='1')return [];
    const id=`gsi-${position.lng.toFixed(5)}-${position.lat.toFixed(5)}`;
    if(seen.has(id))return [];seen.add(id);
    return [{id,name:name.slice(0,160),position,kind:`指定緊急避難場所（${spec.label}）`,address:String(p.address??p['住所']??'').slice(0,300),source:'国土地理院「指定緊急避難場所データ」',scenario}];
  });
}
export async function fetchShelters(bbox,scenario,fetcher=fetch) {
  const spec=SCENARIOS[scenario];if(!spec)throw new Error('対応する災害を選んで保存し直してください。');
  const results=await Promise.all(shelterTiles(bbox).map(async t=>{
    const response=await fetcher(`https://maps.gsi.go.jp/xyz/${spec.layer}/10/${t.x}/${t.y}.geojson`,{signal:AbortSignal.timeout(15000)});
    if(response.status===404)return [];
    if(!response.ok||!response.body)throw new Error('周辺の避難先を取得できませんでした。通信を確認して再試行してください。');
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4*1024*1024)throw new Error('周辺の避難先データが大きすぎます。');chunks.push(value);}}
    catch(e){await reader.cancel().catch(()=>{});throw e;}
    const json=JSON.parse(await new Blob(chunks).text());
    if(!Array.isArray(json.features)||json.features.length>30000)throw new Error('周辺の避難先データを確認できませんでした。');
    return json.features;
  }));
  return {shelters:parseShelters(results.flat(),bbox,scenario),sheltersSavedAt:Date.now(),scenario};
}
const savedScenario=record=>record.scenario??(record.kind?.includes('洪水')?'flood':'earthquake');
export function nearbyShelters(record,position,records=[record]) {
  const compatible=[record,...records.filter(r=>r.id!==record.id)].filter(r=>r.graph&&savedScenario(r)===savedScenario(record)&&!!r.demo===!!record.demo);
  const unique=new Map();
  for(const saved of compatible){
    const list=[...(saved.shelters??[]),...(saved.purpose==='home'?[]:[{id:saved.id,name:saved.name,position:saved.shelter,kind:saved.kind,source:saved.source}])];
    for(const shelter of list){
      if(!inside(shelter.position,saved.graph.bbox))continue;
      const key=`${shelter.position.lng.toFixed(5)},${shelter.position.lat.toFixed(5)}/${shelter.name}`;
      if(!unique.has(key))unique.set(key,shelter);
    }
  }
  return [...unique.values()].map(s=>({...s,meters:distance(position,s.position),mapIds:compatible.filter(r=>r.mapPack&&inside(position,r.graph.bbox)&&inside(s.position,r.graph.bbox)).map(r=>r.id)})).sort((a,b)=>a.meters-b.meters);
}
