import type { LatLng, RouteAssessment } from "../evac-content";
import {
  GeoError,
  meters,
  routeRegion,
  terrainExposure,
} from "./geo-analysis";

type Candidate = {
  id: string;
  path: LatLng[];
  distanceM: number;
  durationS: number;
};

export type RouteAssessmentRequest = { routes: Candidate[] };
export type RouteAssessmentResponse = {
  version: "training-google-v1";
  assessments: Record<string, RouteAssessment>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function parseRouteAssessmentRequest(value: unknown): RouteAssessmentRequest {
  if (!isObject(value) || !Array.isArray(value.routes) || value.routes.length < 1 || value.routes.length > 4)
    throw new GeoError("invalid_request", "比較する経路を1〜4本指定してください。", 400);

  const ids = new Set<string>();
  const routes = value.routes.map((raw): Candidate => {
    if (
      !isObject(raw) ||
      typeof raw.id !== "string" ||
      raw.id.length < 1 ||
      raw.id.length > 100 ||
      ids.has(raw.id) ||
      !Array.isArray(raw.path) ||
      raw.path.length < 2 ||
      raw.path.length > 2000 ||
      typeof raw.distanceM !== "number" ||
      !Number.isFinite(raw.distanceM) ||
      raw.distanceM <= 0 ||
      raw.distanceM > 20000 ||
      typeof raw.durationS !== "number" ||
      !Number.isFinite(raw.durationS) ||
      raw.durationS <= 0 ||
      raw.durationS > 86400
    )
      throw new GeoError("invalid_request", "経路の形式または長さを確認してください。", 400);
    ids.add(raw.id);
    const path = raw.path.map((point): LatLng => {
      if (
        !isObject(point) ||
        typeof point.lat !== "number" ||
        !Number.isFinite(point.lat) ||
        Math.abs(point.lat) > 85 ||
        typeof point.lng !== "number" ||
        !Number.isFinite(point.lng) ||
        Math.abs(point.lng) > 180
      )
        throw new GeoError("invalid_request", "経路の座標が正しくありません。", 400);
      return { lat: point.lat, lng: point.lng };
    });
    const measured = path.slice(1).reduce((sum, point, i) => sum + meters(path[i], point), 0);
    if (measured < 1 || measured > 20000)
      throw new GeoError("route_too_long", "解析できる経路は20km以内です。", 400);
    return { id: raw.id, path, distanceM: raw.distanceM, durationS: raw.durationS };
  });
  return { routes };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const efficiencyPoints = (value: number, baseline: number) =>
  10 * clamp(2 - value / Math.max(0.001, baseline));
const rounded = (value: number) => Math.round(value / 10) * 10;

/**
 * training-v1 の「到達30・地理20・距離10・時間10・未収録項目は半点」
 * を、Google候補経路へ適用する。道路幅・建物・現況は未収録なので15/30点を
 * 暫定付与する。指数は候補比較専用で、安全度や生存率ではない。
 */
export function assessRouteCandidates(request: RouteAssessmentRequest): RouteAssessmentResponse {
  const baselineDistance = Math.min(...request.routes.map((route) => route.distanceM));
  const baselineDuration = Math.min(...request.routes.map((route) => route.durationS));
  const calculated: {
    route: Candidate;
    comparisonScore: number | null;
    assessment: RouteAssessment;
  }[] = request.routes.map((route) => {
    try {
      const region = routeRegion(route.path);
      const terrain = terrainExposure(region, route.path);
      const terrainPoints = 20 * (1 - clamp(terrain.anyAttentionM / Math.max(1, route.distanceM)));
      const comparisonScore = Math.round(
        30 +
          15 +
          terrainPoints +
          efficiencyPoints(route.distanceM, baselineDistance) +
          efficiencyPoints(route.durationS, baselineDuration),
      );
      return {
        route,
        comparisonScore,
        assessment: {
          version: "training-google-v1" as const,
          coverage: "full" as const,
          comparisonScore,
          rank: null,
          provisional: true,
          terrain,
          notes: [
            `収録[しゅうろく]した地形[ちけい]から注意[ちゅうい]を考[かんが]える区間[くかん]は約[やく]${rounded(terrain.anyAttentionM)}m`,
            terrain.slopeM > 0
              ? `斜面[しゃめん]に関係[かんけい]する地形[ちけい]の近[ちか]くは約[やく]${rounded(terrain.slopeM)}m`
              : "斜面[しゃめん]に関係[かんけい]する地形[ちけい]の近接区間[きんせつくかん]は今回[こんかい]の収録[しゅうろく]データでは0m",
            "道路幅[どうろはば]・建物[たてもの]・現在[げんざい]の通行状況[つうこうじょうきょう]は未評価[みひょうか]",
            "地形[ちけい]データ：国土地理院[こくどちりいん]「地形分類[ちけいぶんるい]」",
          ],
          source: { name: "国土地理院「地形分類」", url: "https://www.gsi.go.jp/bousaichiri/lfc_index.html" },
        } satisfies RouteAssessment,
      };
    } catch (error) {
      if (!(error instanceof GeoError) || error.code !== "outside_coverage") throw error;
      return {
        route,
        comparisonScore: null,
        assessment: {
          version: "training-google-v1" as const,
          coverage: "outside" as const,
          comparisonScore: null,
          rank: null,
          provisional: true,
          terrain: null,
          notes: [
            "この経路[けいろ]は収録済[しゅうろくず]み地形[ちけい]データの範囲外[はんいがい]です",
            "Googleの距離[きょり]・時間[じかん]だけを比較[ひかく]できます",
          ],
          source: null,
        } satisfies RouteAssessment,
      };
    }
  });

  const ranked = calculated
    .filter((item): item is typeof item & { comparisonScore: number } => item.comparisonScore !== null)
    .sort((a, b) => b.comparisonScore - a.comparisonScore || a.route.distanceM - b.route.distanceM);
  ranked.forEach((item, index) => {
    item.assessment.rank = index + 1;
    if (index === 0 && ranked.length > 1)
      item.assessment.notes.unshift(
        "収録地形[しゅうろくちけい]・距離[きょり]・時間[じかん]の練習用比較[れんしゅうようひかく]で候補内[こうほない]1位[い]（安全性[あんぜんせい]の判定[はんてい]ではありません）",
      );
  });

  return {
    version: "training-google-v1",
    assessments: Object.fromEntries(calculated.map((item) => [item.route.id, item.assessment])),
  };
}
