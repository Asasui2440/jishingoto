import { distance, validPoint, unproject } from './core.mjs';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';
export const MAX_GRAPH_NODES = 80000;
const allowed = new Set(['residential','living_street','service','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','pedestrian','footway','path','steps']);
const footAllowed = new Set(['yes','designated','permissive']);
const restricted = new Set(['no','private','destination','customers','permit','delivery','agricultural','forestry']);

export function walkable(tags={}) {
  if (['motorway','motorway_link','construction','proposed'].includes(tags.highway) || tags.motorroad==='yes' || tags.construction || tags['access:conditional'] || tags['foot:conditional'] || tags.opening_hours) return false;
  if (tags.foot && !footAllowed.has(tags.foot)) return false;
  if (restricted.has(tags.access) && !footAllowed.has(tags.foot)) return false;
  return allowed.has(tags.highway) || (['cycleway','trunk','trunk_link','track'].includes(tags.highway) && footAllowed.has(tags.foot));
}
export function inside(p,b) {return validPoint(p) && p.lat>=b.south && p.lat<=b.north && p.lng>=b.west && p.lng<=b.east;}
export function downloadBounds(tiles) {
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x))+1;
  const minY=Math.min(...tiles.map(t=>t.y)),maxY=Math.max(...tiles.map(t=>t.y))+1;
  const nw=unproject({x:minX*256,y:minY*256}),se=unproject({x:maxX*256,y:maxY*256});
  return {south:se.lat,west:nw.lng,north:nw.lat,east:se.lng};
}
function blocked(tags={}) {
  if (tags['access:conditional']||tags['foot:conditional']||tags.opening_hours) return true;
  if(tags.foot && !footAllowed.has(tags.foot))return true;
  if(restricted.has(tags.access)&&!footAllowed.has(tags.foot))return true;
  return tags.barrier && !['bollard','cycle_barrier','entrance','kerb'].includes(tags.barrier) && !footAllowed.has(tags.foot);
}
export function buildGraph(data,bbox) {
  if(data.remark || !Array.isArray(data.elements) || data.elements.length>150000)throw new Error('道路データが不完全、または多すぎます。短い範囲で再試行してください。');
  const osmNodes=new Map(data.elements.filter(e=>e.type==='node').map(n=>[n.id,{...n,lng:n.lon}]));
  const nodes=[],edges=[],index=new Map();
  function add(id,p) {
    if(index.has(id))return index.get(id);
    if(nodes.length>=MAX_GRAPH_NODES)throw new Error('道路データが多すぎます。近い避難場所に分けてください。');
    const i=nodes.length;index.set(id,i);nodes.push({lat:p.lat,lng:p.lng});return i;
  }
  for(const way of data.elements) {
    if(way.type!=='way'||!walkable(way.tags)||!Array.isArray(way.nodes))continue;
    const direction=way.tags['oneway:foot'];
    if(direction && !['yes','1','true','-1','no','0','false'].includes(direction))continue;
    for(let i=1;i<way.nodes.length;i++){
      const a=osmNodes.get(way.nodes[i-1]),b=osmNodes.get(way.nodes[i]);
      if(!a||!b||!inside(a,bbox)||!inside(b,bbox)||blocked(a.tags)||blocked(b.tags))continue;
      const len=distance(a,b);if(len<.01||len>2000)continue;
      // Interpolated points stay on the OSM way geometry; they do not connect crossing ways.
      const count=Math.ceil(len/25),chain=[add(a.id,a)];
      for(let j=1;j<count;j++)chain.push(add(`${way.id}/${i}/${j}`,{lat:a.lat+(b.lat-a.lat)*j/count,lng:a.lng+(b.lng-a.lng)*j/count}));
      chain.push(add(b.id,b));
      for(let j=1;j<chain.length;j++){
        const cost=distance(nodes[chain[j-1]],nodes[chain[j]]),name=String(way.tags.name??(way.tags.highway==='steps'?'階段':'名称のない道')).slice(0,100);
        if(direction!=='-1')edges.push([chain[j-1],chain[j],cost,name]);
        if(!['yes','1','true'].includes(direction))edges.push([chain[j],chain[j-1],cost,name]);
      }
    }
  }
  if(!edges.length)throw new Error('保存範囲に徒歩で使える道路データが見つかりません。');
  return {version:1,bbox,nodes,edges,downloadedAt:Date.now(),dataTimestamp:data.osm3s?.timestamp_osm_base??null,attribution:'© OpenStreetMap contributors (ODbL)'};
}
export async function fetchGraph(tiles,fetcher=fetch) {
  const bbox=downloadBounds(tiles);
  const query=`[out:json][timeout:25][maxsize:67108864];way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});(._;>;);out body;`;
  const response=await fetcher(OVERPASS,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(response.status===429?'道路の配信先が混み合っています。しばらく待って再試行してください。':'道路データを取得できませんでした。通信を確認して再試行してください。');
  // Bound the downloaded response before parsing. No partial graph is treated as complete.
  if(!response.body)throw new Error('道路データの応答が空です。');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12*1024*1024)throw new Error('道路データが12MBを超えました。範囲を小さくしてください。');parts.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return buildGraph(JSON.parse(new TextDecoder().decode(bytes)),bbox);
}
class Heap {
  values=[];
  push(value){const a=this.values;let i=a.length;a.push(value);while(i){const parent=(i-1)>>1;if(a[parent][0]<=value[0])break;a[i]=a[parent];i=parent;}a[i]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1][0]<a[child][0])child++;if(a[child][0]>=last[0])break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
export function findRoute(graph,start,destination) {
  if(!graph || graph.version!==1 || !Array.isArray(graph.nodes)||!Array.isArray(graph.edges))throw new Error('この保存には道路データがありません。オンラインで保存し直してください。');
  if(!inside(start,graph.bbox)||!inside(destination,graph.bbox))throw new Error('出発地点または避難場所が保存範囲外です。オンラインで周辺の地図を保存してください。');
  const adjacent=Array.from({length:graph.nodes.length},()=>[]),used=new Set();
  for(const [from,to,cost,name] of graph.edges){if(!adjacent[from]||!adjacent[to]||!Number.isFinite(cost)||cost<=0)continue;adjacent[from].push({to,cost,name});used.add(from);used.add(to);}
  function nearest(p){let id=-1,gap=Infinity;for(const i of used){const d=distance(p,graph.nodes[i]);if(d<gap){id=i;gap=d;}}if(gap>80)throw new Error('地点から80m以内に徒歩の道路が見つかりません。近くの別の避難先を選んでください。');return {id,gap};}
  const from=nearest(start),to=nearest(destination);
  if(from.id===to.id)throw new Error('出発地点と避難場所が同じ道路位置です。少し離れた地点を選んでください。');
  const costs=new Float64Array(graph.nodes.length).fill(Infinity),previous=new Int32Array(graph.nodes.length).fill(-1),names=[];
  const heap=new Heap();costs[from.id]=0;heap.push([0,from.id]);
  while(heap.values.length){const [cost,id]=heap.pop();if(cost>costs[id])continue;if(id===to.id)break;for(const edge of adjacent[id]){const n=cost+edge.cost;if(n<costs[edge.to]){costs[edge.to]=n;previous[edge.to]=id;names[edge.to]=edge.name;heap.push([n,edge.to]);}}}
  if(!Number.isFinite(costs[to.id]))throw new Error('保存範囲内の道路がつながっていないため、経路を見つけられません。範囲や出入口を見直してください。');
  const ids=[];for(let n=to.id;n!==-1;n=previous[n])ids.push(n);ids.reverse();
  const path=ids.map(i=>graph.nodes[i]),steps=[];
  for(let i=1;i<ids.length;i++) {const name=names[ids[i]],meters=distance(path[i-1],path[i]);const last=steps.at(-1);if(last?.name===name)last.meters+=meters;else steps.push({name,meters});}
  return {path,meters:costs[to.id],startGap:from.gap,destinationGap:to.gap,steps};
}
