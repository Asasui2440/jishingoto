// Pure geometry and validation shared by the offline screen and tests.
export const ZOOM = 15;
export const MAX_TILES = 64;
export const MAX_BYTES = 16 * 1024 * 1024;
export const MAX_ROUTES = 5;
export function validPoint(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 20 && p.lat <= 46 && p.lng >= 122 && p.lng <= 154;
}
export function project(p, z = ZOOM) {
  const size = 256 * 2 ** z, r = p.lat * Math.PI / 180;
  return { x: (p.lng + 180) / 360 * size, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * size };
}
export function unproject(p, z = ZOOM) {
  const size = 256 * 2 ** z;
  return { lng: p.x / size * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * p.y / size))) * 180 / Math.PI };
}
export function distance(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat*r) * Math.cos(b.lat*r) * Math.sin((b.lng-a.lng)*r/2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function routeDistance(path) { return path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0); }
export function bounds(path) {
  const pixels = path.map(p => project(p));
  return { minX: Math.min(...pixels.map(p => p.x)), maxX: Math.max(...pixels.map(p => p.x)), minY: Math.min(...pixels.map(p => p.y)), maxY: Math.max(...pixels.map(p => p.y)) };
}
export function tilePlan(path) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 300 || !path.every(validPoint)) throw new Error('国内の出発地点と避難場所を指定してください。');
  const b = bounds(path), tiles = [];
  // Include a one-tile margin so the road surroundings remain visible offline.
  const x0 = Math.floor(b.minX/256)-1, x1 = Math.floor(b.maxX/256)+1;
  const y0 = Math.floor(b.minY/256)-1, y1 = Math.floor(b.maxY/256)+1;
  if ((x1-x0+1)*(y1-y0+1) > MAX_TILES) throw new Error('保存範囲が広すぎます。近くの避難場所への経路に分けてください（地図64枚まで）。');
  for (let x=x0;x<=x1;x++) for (let y=y0;y<=y1;y++) tiles.push({ x,y,key:`${ZOOM}/${x}/${y}` });
  return tiles;
}
