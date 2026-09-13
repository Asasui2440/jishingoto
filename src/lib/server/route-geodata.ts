import { createHash } from "node:crypto";
import catalog from "@/data/evac-geo/classifications.json";
import type { LatLng } from "../evac-content";
import { GeoError, geometryDistance, routeRegion, sampleRoute, type Region } from "./geo-analysis";

const definitions: Record<string, (typeof catalog.definitions)[keyof typeof catalog.definitions]> = catalog.definitions;
type Tile = { x: number; y: number };
type CachedTile = { features: Region["features"]; version: string; downloadedAt: string; expires: number };
const cache = new Map<string, CachedTile>();
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const unavailable = () => new GeoError("geodata_unavailable", "経路周辺の地形データを取得できませんでした。再試行してください。", 502);

function tilePoint(p: LatLng) {
  const sin = Math.sin(p.lat * Math.PI / 180);
  return { x: (p.lng + 180) / 360 * 16384, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 16384 };
}

/** 20m間隔の経路点の周囲80m。頂点だけでなく長い直線とタイル境界も取得する。 */
export function routeTiles(path: LatLng[]): Tile[] {
  const tiles = new Map<string, Tile>();
  for (const { position: p } of sampleRoute(path)) {
    const lat = 80 / 111132, lng = 80 / (111320 * Math.cos(p.lat * Math.PI / 180));
    const a = tilePoint({ lat: p.lat + lat, lng: p.lng - lng });
    const b = tilePoint({ lat: p.lat - lat, lng: p.lng + lng });
    for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++)
      for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) {
        if (x < 0 || x >= 16384 || y < 0 || y >= 16384) continue;
        tiles.set(`${x}/${y}`, { x, y });
        if (tiles.size > 64) throw new GeoError("geodata_too_large", "地形データの取得範囲が広すぎます。短い経路を選んでください。", 422);
      }
  }
  return [...tiles.values()];
}

export function parseTerrainTile(raw: unknown, tile: Tile): Region["features"] {
  if (!raw || typeof raw !== "object" || !("type" in raw) || raw.type !== "FeatureCollection" || !("features" in raw) || !Array.isArray(raw.features)) throw unavailable();
  return raw.features.flatMap((f) => {
    const code = String(f?.properties?.code ?? "");
    const definition = definitions[code];
    // 未知の分類は推測しない。下流の被覆確認で欠落として扱う。
    if (!definition) return [];
    const geometry = f.geometry;
    if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw unavailable();
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    if (!polygons.length) throw unavailable();
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length) throw unavailable();
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4) throw unavailable();
        for (const p of ring) {
          if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85) throw unavailable();
          bbox[0] = Math.min(bbox[0], p[0]); bbox[1] = Math.min(bbox[1], p[1]);
          bbox[2] = Math.max(bbox[2], p[0]); bbox[3] = Math.max(bbox[3], p[1]);
        }
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw unavailable();
      }
    }
    return [{ id: `gsi-${tile.x}-${tile.y}-${code}-${hash(JSON.stringify(geometry))}`, code, ...definition, bbox, geometry }];
  });
}

async function readTile(tile: Tile, fetcher: typeof fetch, signal: AbortSignal): Promise<CachedTile> {
  const key = `${tile.x}/${tile.y}`;
  const saved = cache.get(key);
  if (fetcher === fetch && saved && saved.expires > Date.now()) return saved;
  const response = await fetcher(`https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification1/14/${key}.geojson`, { signal, cache: "no-store" });
  if (response.status !== 404 && !response.ok) throw unavailable();
  // 404は提供データなし。ネットワークエラーや壊れたデータとは区別する。
  let text = "";
  if (response.status !== 404) {
    const reader = response.body?.getReader();
    if (!reader) throw unavailable();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 8_000_000) { await reader.cancel(); throw unavailable(); }
      chunks.push(chunk.value);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  const result = {
    features: response.status === 404 ? [] : parseTerrainTile(JSON.parse(text), tile),
    version: hash(text), downloadedAt: new Date().toISOString(), expires: Date.now() + 3600_000,
  };
  if (fetcher === fetch) {
    cache.delete(key);
    cache.set(key, result);
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return result;
}

export async function loadRouteRegion(path: LatLng[], signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Region> {
  if (signal?.aborted) throw new GeoError("cancelled", "解析を中止しました。", 499);
  try { return routeRegion(path); } catch (error) {
    if (!(error instanceof GeoError) || error.code !== "outside_coverage") throw error;
  }
  const tiles = routeTiles(path);
  const controller = new AbortController();
  const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(12000), ...(signal ? [signal] : [])]);
  const loaded: CachedTile[] = [];
  try {
    for (let i = 0; i < tiles.length; i += 4) {
      combined.throwIfAborted();
      loaded.push(...await Promise.all(tiles.slice(i, i + 4).map((tile) => readTile(tile, fetcher, combined))));
    }
  } catch {
    controller.abort();
    if (signal?.aborted) throw new GeoError("cancelled", "解析を中止しました。", 499);
    throw unavailable();
  }
  const features = loaded.flatMap((tile) => tile.features);
  // タイル取得成功だけでは地形の収録範囲内とは限らない。
  if (sampleRoute(path).some(({ position: p }) => !features.some((f) =>
    p.lng >= f.bbox[0] - 0.00002 && p.lng <= f.bbox[2] + 0.00002 &&
    p.lat >= f.bbox[1] - 0.00002 && p.lat <= f.bbox[3] + 0.00002 && geometryDistance(p, f.geometry) <= 1)))
    throw new GeoError("outside_coverage", "この経路には国土地理院の地形データがない区間があります。「固定の練習問題」に切り替えるか、別の経路を選んでください。", 422);
  return {
    id: `gsi-route-${hash(tiles.map((t) => `${t.x}/${t.y}`).sort().join(","))}`,
    name: "経路周辺", center: path[0],
    bounds: [Math.min(...path.map((p) => p.lng)), Math.min(...path.map((p) => p.lat)), Math.max(...path.map((p) => p.lng)), Math.max(...path.map((p) => p.lat))],
    version: hash(loaded.map((t) => t.version).join(":") + JSON.stringify(catalog)),
    downloadedAt: loaded.map((t) => t.downloadedAt).sort()[0], featureCount: features.length, features,
  };
}
