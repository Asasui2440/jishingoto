import type { LatLng, RouteOption } from "./evac-content";

export const FLOOD_TILE_ROOT = "https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data";
export const FLOOD_SOURCE = "https://disaportaldata.gsi.go.jp/hazardmap/copyright/opendata.html";
// 配信元の shinsui_legend3.png（2024年8月統一凡例）。上限の異なる区分を混同しない。
export const FLOOD_BANDS = [
  { rgb: [255,255,179], label: "0.3m未満", weight: 1 },
  { rgb: [247,245,169], label: "0.5m未満", weight: 2 },
  { rgb: [248,225,166], label: "0.5〜1m", weight: 3 },
  { rgb: [255,216,192], label: "0.5〜3m", weight: 4 },
  { rgb: [255,183,183], label: "3〜5m", weight: 5 },
  { rgb: [255,145,145], label: "5〜10m", weight: 6 },
  { rgb: [242,133,201], label: "10〜20m", weight: 7 },
  { rgb: [220,122,220], label: "20m以上", weight: 8 },
] as const;
export type FloodAssessment = {
  status: "available" | "partial" | "unavailable";
  coloredM: number;
  uncoloredM: number;
  unknownM: number;
  weightedM: number;
  maxDepth: string | null;
  suggestedVias: LatLng[];
  checkedAt: string;
  source: string;
};

/** 未取得区間がある候補は優先推薦せず、同条件では深さ区分の重み×区間長、着色長、距離の順に比較。 */
export function compareFloodRoutes(a: RouteOption, b: RouteOption) {
  const x=a.assessment?.flood, y=b.assessment?.flood;
  const available=(f: FloodAssessment | undefined)=>f?.status === "available" ? 0 : 1;
  return available(x)-available(y) || (available(x) ? a.distanceM-b.distanceM :
    x!.weightedM-y!.weightedM || x!.coloredM-y!.coloredM || a.distanceM-b.distanceM);
}
