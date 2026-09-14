import { gunzipSync, inflateRawSync } from "node:zlib";
import catalogData from "@/data/urban-landuse/catalog.json";
import bundledData from "@/data/urban-landuse/bundled.json";
import type { LatLng } from "../evac-content";
export type Area = "residential" | "industrial" | "highrise" | "commercial";
export const LANDUSE_SOURCE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-b-u-v3_1.html";
const catalog: Record<string, {year: string; datum: string}> = catalogData;
const bundled: Record<string, string> = bundledData;
const cache = new Map<string, Uint8Array>();
const pending = new Map<string, Promise<Uint8Array | null>>();
export function meshCell(p: LatLng) {
  const r = Math.floor(p.lat * 1200), c = Math.floor((p.lng - 100) * 800);
  return { primary: `${Math.floor(r / 800)}${Math.floor(c / 800)}`, row: ((r % 800) + 800) % 800, col: ((c % 800) + 800) % 800 };
}
/** Read only the bounded DBF member, not an archive's paths or other files. */
export function decodeLanduseZip(zip: Buffer, primary: string): Uint8Array {
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) throw new Error("zip directory");
  let offset = zip.readUInt32LE(end + 16);
  const entries = zip.readUInt16LE(end + 10);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("zip entry");
    const method = zip.readUInt16LE(offset + 10), packed = zip.readUInt32LE(offset + 20), size = zip.readUInt32LE(offset + 24);
    const n = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const name = zip.toString("utf8", offset + 46, offset + 46 + n);
    if (name.toLowerCase().endsWith(".dbf")) {
      if (size > 32_000_000 || packed > 25_000_000) throw new Error("dbf size");
      const local = zip.readUInt32LE(offset + 42);
      if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("zip local");
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const bytes = zip.subarray(start, start + packed);
      const dbf = method === 0 ? bytes : method === 8 ? inflateRawSync(bytes, { maxOutputLength: 32_000_000 }) : null;
      if (!dbf || dbf.length !== size) throw new Error("dbf encoding");
      const count = dbf.readUInt32LE(4), header = dbf.readUInt16LE(8), rowSize = dbf.readUInt16LE(10);
      if (rowSize !== 23 || header !== 129 || header + count * rowSize > dbf.length) throw new Error("dbf schema");
      const names = [32,64,96].map(at => new TextDecoder("shift_jis").decode(dbf.subarray(at,at+11)).replace(/\0.*$/, ""));
      const modern = ["L03b_u_001","L03b_u_002","L03b_u_003"], legacy = ["メッシュ","土地利用種","撮影年月日"];
      if (!names.every((name,i) => name === modern[i]) && !names.every((name,i) => name === legacy[i])) throw new Error("dbf fields");
      if (![32,64,96].every((at,i) => dbf[at+11] === 67 && dbf[at+16] === [10,4,8][i])) throw new Error("dbf field types");
      const grid = new Uint8Array(640000);
      for (let row = 0; row < count; row++) {
        const at = header + row * rowSize;
        if (dbf[at] === 42) continue;
        const mesh = dbf.toString("ascii", at + 1, at + 11), code = dbf.toString("ascii", at + 11, at + 15);
        if (!/^\d{10}$/.test(mesh) || !mesh.startsWith(primary)) continue;
        const r = +mesh[4] * 100 + +mesh[6] * 10 + +mesh[8], c = +mesh[5] * 100 + +mesh[7] * 10 + +mesh[9];
        if (r < 800 && c < 800) grid[r * 800 + c] = ({"0701":1,"0702":2,"0703":3,"0704":4} as Record<string, number>)[code] ?? 5;
      }
      return grid;
    }
    offset += 46 + n + extra + comment;
  }
  throw new Error("no dbf");
}
async function getGrid(primary: string): Promise<Uint8Array | null> {
  if (cache.has(primary)) return cache.get(primary)!;
  if (!catalog[primary]) return null;
  if (pending.has(primary)) return pending.get(primary)!;
  const task = (async () => {
    try {
      let grid: Uint8Array;
      if (bundled[primary]) grid = gunzipSync(Buffer.from(bundled[primary], "base64"), {maxOutputLength: 640000});
      else {
        const {year, datum} = catalog[primary];
        const response = await fetch(`https://nlftp.mlit.go.jp/ksj/gml/data/L03-b-u/L03-b-u-${year}/L03-b-u-${year}_${primary}-${datum}_GML.zip`, {signal: AbortSignal.timeout(12000)});
        if (!response.ok || !response.body) return null;
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
        while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 25_000_000) { await reader.cancel(); return null; } chunks.push(value); }
        grid = decodeLanduseZip(Buffer.concat(chunks), primary);
      }
      if (grid.length !== 640000) return null;
      if (cache.size >= 12) cache.delete(cache.keys().next().value!);
      cache.set(primary, grid); return grid;
    } catch { return null; }
  })();
  pending.set(primary, task);
  try { return await task; } finally { pending.delete(primary); }
}
export async function classifyLanduse(points: LatLng[]) {
  const keys = [...new Set(points.map(p => meshCell(p).primary))].slice(0, 4);
  const grids = new Map(await Promise.all(keys.map(async key => [key, await getGrid(key)] as const)));
  return points.map(p => {
    const {primary, row, col} = meshCell(p), grid = grids.get(primary);
    const areas: Area[] = [], counts = [0,0,0,0,0,0];
    if (grid) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (row+dr >= 0 && row+dr < 800 && col+dc >= 0 && col+dc < 800) counts[grid[(row+dr)*800+col+dc]]++;
    }
    if (counts[3]+counts[4] >= 3) areas.push("residential");
    if (counts[2] >= 2 || grid?.[row*800+col] === 2) areas.push("industrial");
    if (counts[1] >= 2 || grid?.[row*800+col] === 1) areas.push("highrise");
    return {areas, year: catalog[primary] ? `20${catalog[primary].year}` : null, available: !!grid && counts.slice(1).some(Boolean)};
  });
}
