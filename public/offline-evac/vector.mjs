import { project, unproject, MAX_BYTES } from './core.mjs';
export const VECTOR_ZOOM=14;
export const TILEJSON='https://tiles.openfreemap.org/planet/latest';
export function vectorPlan(bbox) {
  const nw=project({lat:bbox.north,lng:bbox.west},VECTOR_ZOOM),se=project({lat:bbox.south,lng:bbox.east},VECTOR_ZOOM),tiles=[];
  for(let x=Math.floor(nw.x/256);x<=Math.floor((se.x-.001)/256);x++)for(let y=Math.floor(nw.y/256);y<=Math.floor((se.y-.001)/256);y++)tiles.push({z:VECTOR_ZOOM,x,y,key:`${VECTOR_ZOOM}/${x}/${y}`});
  if(!tiles.length||tiles.length>64)throw new Error('保存する地域が広すぎます。近い避難先を選んでください。');
  const a=unproject({x:Math.min(...tiles.map(t=>t.x))*256,y:Math.min(...tiles.map(t=>t.y))*256},VECTOR_ZOOM),b=unproject({x:(Math.max(...tiles.map(t=>t.x))+1)*256,y:(Math.max(...tiles.map(t=>t.y))+1)*256},VECTOR_ZOOM);
  const savedBounds={west:a.lng,north:a.lat,east:b.lng,south:b.lat};
  // Keep overview tiles too: zooming out must not turn the saved streets blank.
  for(const z of [12,13]){
    const nw=project({lat:savedBounds.north,lng:savedBounds.west},z),se=project({lat:savedBounds.south,lng:savedBounds.east},z);
    for(let x=Math.floor((nw.x+.001)/256);x<=Math.floor((se.x-.001)/256);x++)for(let y=Math.floor((nw.y+.001)/256);y<=Math.floor((se.y-.001)/256);y++)tiles.push({z,x,y,key:`${z}/${x}/${y}`});
  }
  if(tiles.length>64)throw new Error('保存する地域が広すぎます。近い避難先を選んでください。');
  return {tiles,bbox:savedBounds};
}
// A vector tile contains length-delimited protobuf layers. Reject truncated/HTML responses.
export function validVectorTile(data) {
  const bytes=new Uint8Array(data);let i=0,layers=0;
  function read(){let n=0,m=1;for(let j=0;j<5&&i<bytes.length;j++){const b=bytes[i++];n+=(b&127)*m;if(!(b&128))return n;m*=128;}throw new Error();}
  try{while(i<bytes.length){const tag=read();if(tag!==26)return false;const length=read();if(!length||i+length>bytes.length)return false;i+=length;layers++;}return layers>0;}
  catch{return false;}
}
export async function downloadVector(bbox,progress=()=>{},fetcher=fetch) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{
    const metadata=await fetcher(TILEJSON,{signal:controller.signal});if(!metadata.ok)throw new Error('地図の配信情報を取得できませんでした。');
    const json=await metadata.json(),template=json.tiles?.[0];
    if(typeof template!=='string'||!template.startsWith('https://tiles.openfreemap.org/planet/'))throw new Error('地図の配信先を確認できませんでした。');
    const plan=vectorPlan(bbox),tiles=new Array(plan.tiles.length);let next=0,done=0,bytes=0;
    await Promise.all(Array.from({length:Math.min(4,tiles.length)},async()=>{
      while(next<tiles.length){const i=next++,t=plan.tiles[i],url=template.replace('{z}',String(t.z)).replace('{x}',String(t.x)).replace('{y}',String(t.y));
        const response=await fetcher(url,{signal:controller.signal});if(!response.ok)throw new Error('地図を取得できませんでした。もう一度お試しください。');
        const data=await response.arrayBuffer();bytes+=data.byteLength;
        if(bytes>MAX_BYTES)throw new Error('地図が16MBを超えました。近い避難先を選んでください。');
        if(!validVectorTile(data))throw new Error('地図データが不完全です。もう一度お試しください。');
        tiles[i]={...t,blob:new Blob([data],{type:'application/x-protobuf'})};progress(++done,tiles.length);
      }
    }));
    return {version:1,bbox:plan.bbox,tiles,source:'OpenFreeMap / OpenMapTiles / OpenStreetMap',downloadedAt:Date.now()};
  }catch(e){controller.abort();throw e;}finally{clearTimeout(timer);}
}
