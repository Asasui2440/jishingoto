import sharp from "sharp";
import type { LatLng } from "../evac-content";
import { FLOOD_BANDS, FLOOD_SOURCE, FLOOD_TILE_ROOT, type FloodAssessment } from "../flood-hazard";
import { meters } from "./geo-analysis";

const ZOOM=16, SIZE=256, MAX_TILES=80;
type Tile = { pixels: Uint8Array; expires: number };
const cache = new Map<string, Tile>();
export function floodPixel(point: LatLng) {
  const world=2**ZOOM*SIZE, lat=point.lat*Math.PI/180;
  const x=(point.lng+180)/360*world, y=(1-Math.asinh(Math.tan(lat))/Math.PI)/2*world;
  return {x:Math.floor(x/SIZE),y:Math.floor(y/SIZE),px:Math.floor(x)%SIZE,py:Math.floor(y)%SIZE};
}
// null=不明、-1=無着色（未指定・未収録の区別はできない）。
export function floodBand(rgba: Uint8Array): number | null {
  if (rgba[3] === 0) return -1;
  if (rgba[3] !== 255) return null;
  const index=FLOOD_BANDS.findIndex(b=>b.rgb.every((value,i)=>Math.abs(value-rgba[i])<=2));
  return index<0 ? null : index;
}
function samples(path: LatLng[]) {
  const result: {point:LatLng; length:number; from:LatLng; to:LatLng}[]=[];
  for(let i=1;i<path.length;i++) {
    const from=path[i-1],to=path[i],length=meters(from,to), count=Math.ceil(length/5);
    for(let j=0;j<count;j++) { const t=(j+0.5)/count; result.push({point:{lat:from.lat+(to.lat-from.lat)*t,lng:from.lng+(to.lng-from.lng)*t},length:length/count,from,to}); }
  }
  return result;
}

/** 5m間隔で公式ラスターを照合。色なしと取得失敗を分け、失敗をゼロ浸水にしない。 */
export async function assessFloodRoutes(routes: {id:string;path:LatLng[];distanceM?:number}[], signal?:AbortSignal, fetcher:typeof fetch=fetch): Promise<Record<string,FloodAssessment>> {
  const deadline=Date.now()+12000;
  const local=new Map<string,Promise<Tile|null>>();
  const load=(x:number,y:number) => {
    const key=`${x}/${y}`;
    if(local.has(key)) return local.get(key)!;
    if(local.size>=MAX_TILES || Date.now()>=deadline || signal?.aborted) return Promise.resolve(null);
    const promise=(async()=>{
      const stored=fetcher===fetch ? cache.get(key) : undefined;
      if(stored && stored.expires>Date.now()) return stored;
      try {
        const timeout=AbortSignal.timeout(Math.max(1,Math.min(4000,deadline-Date.now())));
        const res=await fetcher(`${FLOOD_TILE_ROOT}/${ZOOM}/${key}.png`,{signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
        if(!res.ok) return null;
        if(Number(res.headers.get("content-length"))>1_000_000) return null;
        const bytes=await res.arrayBuffer();
        if(bytes.byteLength>1_000_000) return null;
        const {data,info}=await sharp(bytes,{limitInputPixels:SIZE*SIZE}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        if(info.width!==SIZE || info.height!==SIZE || info.channels!==4) return null;
        const tile={pixels:data,expires:Date.now()+3600000};
        if(fetcher===fetch) { cache.delete(key); cache.set(key,tile); while(cache.size>128) cache.delete(cache.keys().next().value!); }
        return tile;
      } catch {return null;}
    })();
    local.set(key,promise); return promise;
  };
  const read=async(point:LatLng)=>{const p=floodPixel(point),tile=await load(p.x,p.y);if(!tile)return null;const offset=(p.py*SIZE+p.px)*4;return floodBand(tile.pixels.subarray(offset,offset+4));};
  const sampled=routes.map(route=>{
    const points=samples(route.path), measured=points.reduce((sum,p)=>sum+p.length,0);
    // SDKの全長と形状の実測には差があるため、表示全長に区間の合計を揃える。
    const scale=route.distanceM && measured>0 ? route.distanceM/measured : 1;
    return {route,points:points.map(p=>({...p,length:p.length*scale}))};
  });
  const keys=[...new Map(sampled.flatMap(({points})=>points.map(s=>{const p=floodPixel(s.point);return [`${p.x}/${p.y}`,p] as const;}))).values()];
  for(let i=0;i<keys.length && i<MAX_TILES;i+=6) await Promise.all(keys.slice(i,i+6).map(p=>load(p.x,p.y)));
  const output:Record<string,FloodAssessment>={};
  for(const {route,points} of sampled) {
    const result:FloodAssessment={status:"available",coloredM:0,uncoloredM:0,unknownM:0,weightedM:0,maxDepth:null,suggestedVias:[],checkedAt:new Date().toISOString(),source:FLOOD_SOURCE};
    let highest=-1;
    const colored: {sample:typeof points[number];band:number}[]=[];
    for(const sample of points) {
      const band=await read(sample.point);
      if(band===null) result.unknownM+=sample.length;
      else if(band===-1) result.uncoloredM+=sample.length;
      else { result.coloredM+=sample.length; result.weightedM+=sample.length*FLOOD_BANDS[band].weight; highest=Math.max(highest,band);colored.push({sample,band}); }
    }
    result.status=result.unknownM>0 ? result.coloredM+result.uncoloredM>0 ? "partial" : "unavailable" : "available";
    result.maxDepth=highest<0 ? null : FLOOD_BANDS[highest].label;
    // 着色区間の中心付近から両側の実データを調べ、より浅い/無着色の地点だけを提案する。
    const worst=colored.filter(c=>c.band===highest);
    const pivot=worst[Math.floor(worst.length/2)];
    if(pivot && !signal?.aborted) {
      const {point,from,to}=pivot.sample, scale=111320*Math.cos(point.lat*Math.PI/180);
      const dx=(to.lng-from.lng)*scale,dy=(to.lat-from.lat)*111132,len=Math.hypot(dx,dy)||1;
      for(const offset of [100,250,500,1000]) {
        const candidates=[-1,1].map(side=>({lat:point.lat+dx/len*offset*side/111132,lng:point.lng-dy/len*offset*side/scale}));
        const checked=await Promise.all(candidates.map(async point=>({point,band:await read(point)})));
        for(const item of checked) if(item.band!==null && item.band<pivot.band && result.suggestedVias.every(p=>meters(p,item.point)>80)) result.suggestedVias.push(item.point);
        if(result.suggestedVias.length>=4) break;
      }
    }
    output[route.id]=result;
  }
  return output;
}
