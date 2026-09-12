"use client";

/**
 * フェーズ2の取得境界。フェーズ1のfixture/liveと同様、モードを明示する。
 * mock: サンプル避難場所・合成ルート。外部サービスを呼ばない。
 * api: GSI/Placesの候補と、Maps JS Routes Libraryの徒歩ルート。
 * API失敗時はエラーを返し、モックへ自動で置き換えない。
 */

import {
  DEFAULT_TIMER_SECONDS,
  DEMO_SHELTERS,
  HAZARD_EVENTS,
  type HazardEvent,
  type LatLng,
  type RouteAssessment,
  type RouteOption,
  type Shelter,
} from "./evac-content";
import { hasMapsKey, loadMaps } from "./gmaps";
import { requestWalkingRoutes, type WalkingRoute } from "./google-routes";
import type { EvacMode } from "./evac-mode";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 座標のちいさな計算                                                    */
/* ------------------------------------------------------------------ */

/** ざっくりした距離（m）。東京付近の緯度で十分な精度。 */
export function distanceM(a: LatLng, b: LatLng) {
  const latM = 111_132;
  const lngM = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lat - b.lat) * latM, (a.lng - b.lng) * lngM);
}

export function pathLengthM(path: LatLng[]) {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += distanceM(path[i - 1], path[i]);
  return sum;
}

/** 経路上を 0–1 の割合で進んだ地点 */
export function pointAt(path: LatLng[], t: number): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (path.length === 1) return path[0];
  const target = pathLengthM(path) * Math.min(1, Math.max(0, t));
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = distanceM(path[i - 1], path[i]);
    if (acc + seg >= target) {
      const k = seg === 0 ? 0 : (target - acc) / seg;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * k,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * k,
      };
    }
    acc += seg;
  }
  return path[path.length - 1];
}

/** その地点で進んでいる向き（度。北が 0） */
export function headingAt(path: LatLng[], t: number) {
  const a = pointAt(path, Math.max(0, t - 0.02));
  const b = pointAt(path, Math.min(1, t + 0.02));
  const dLng = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const dLat = b.lat - a.lat;
  const deg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/* ------------------------------------------------------------------ */
/* 避難場所                                                             */
/* ------------------------------------------------------------------ */

/**
 * 「近く」とみなす上限（m）。
 * 地理院タイルの検索範囲にもこの上限を使う。
 * これより遠い候補は、指定した地点の「近く」ではないので出さない。
 */
const NEARBY_RADIUS_M = 3000;

/** API版は公的データ→Places候補の順に取得し、固定データには置き換えない。 */
export async function fetchShelters(near: LatLng, mode: EvacMode): Promise<Shelter[]> {
  const nearby = (list: Shelter[]) =>
    [...list]
      .filter((s) => distanceM(near, s.position) <= NEARBY_RADIUS_M)
      .sort((a, b) => distanceM(near, a.position) - distanceM(near, b.position))
      .slice(0, 5);

  if (mode === "mock") return nearby(DEMO_SHELTERS).map((s) => ({ ...s, source: "練習用サンプル（現在の指定状況は未確認）" }));
  if (!hasMapsKey()) throw new Error("地図のAPIキーが未設定です。入口で設定を確認してください。");

  try {
    const official = nearby(await fetchGsiShelters(near));
    if (official.length > 0) return official;
  } catch {
    // 公的データを取れなければ次の手段へ
  }

  try {
    return nearby(await fetchPlaceShelters(near));
  } catch {
    throw new Error("避難場所を取得できませんでした。接続とGoogle APIの設定を確認して再試行してください。");
  }
}

/* --- 1. 国土地理院の指定緊急避難場所データ --------------------------- */

/**
 * 地理院の指定緊急避難場所タイルの仕様（実際に叩いて確かめた値）:
 *   - 配信されているズームは **10 だけ**。他のズームは 404 を返す。
 *   - 層が災害種別ごとに分かれていて、`skhb04` が **地震**。
 *     （01 洪水 / 02 崖崩れ・土石流・地滑り / 03 高潮 / 04 地震 /
 *       05 津波 / 06 大規模な火事 / 07 内水氾濫 / 08 火山現象）
 *   - properties は `name` / `address` / `remarks` / `disaster1..8`。
 *
 * @see https://www.gsi.go.jp/bousaichiri/hinanbasho.html
 */
const GSI_ZOOM = 10;
const GSI_EARTHQUAKE_LAYER = "skhb04";

/** 緯度経度 → タイル座標（小数のまま。境界までの近さを測るのに使う） */
function tileFloat(p: LatLng, z: number) {
  const n = 2 ** z;
  const latRad = (p.lat * Math.PI) / 180;
  return {
    x: ((p.lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/**
 * 探す範囲を覆うタイルを列挙する。
 *
 * z10 のタイルは 1 枚で 30km 近くを覆い、数百 KB ある。
 * 3×3 で 9 枚取ると数 MB になってしまうので、
 * 基本は中心の 1 枚だけにして、指定地点がタイルの境界に近いときだけ隣を足す。
 */
function tilesAround(near: LatLng, z: number, radiusM: number) {
  const { x, y } = tileFloat(near, z);
  // タイル1枚ぶんの幅（m）。この緯度での実距離。
  const tileM = (40_075_017 * Math.cos((near.lat * Math.PI) / 180)) / 2 ** z;
  const margin = radiusM / tileM;

  const spread = (v: number) => {
    const base = Math.floor(v);
    const out = [base];
    if (v - base < margin) out.push(base - 1);
    if (base + 1 - v < margin) out.push(base + 1);
    return out;
  };

  return spread(x).flatMap((tx) => spread(y).map((ty) => ({ x: tx, y: ty })));
}

type GsiFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
};

/**
 * 地理院タイルの GeoJSON（地震の指定緊急避難場所）から、周囲の候補を集める。
 *
 * 取得できない環境（CORS・オフラインなど）では例外にして、呼び出し側が次の手段に移る。
 */
async function fetchGsiShelters(near: LatLng): Promise<Shelter[]> {
  const tiles = tilesAround(near, GSI_ZOOM, NEARBY_RADIUS_M);

  const results = await Promise.all(
    tiles.map(async (t) => {
      const res = await fetch(
        `https://maps.gsi.go.jp/xyz/${GSI_EARTHQUAKE_LAYER}/${GSI_ZOOM}/${t.x}/${t.y}.geojson`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return [] as GsiFeature[];
      const json = (await res.json()) as { features?: GsiFeature[] };
      return json.features ?? [];
    }),
  );

  const pick = (props: Record<string, string | number | undefined>, keys: string[]) => {
    for (const k of keys) {
      const v = props[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const seen = new Set<string>();

  return results.flat().flatMap((f): Shelter[] => {
    const c = f.geometry?.coordinates;
    const props = f.properties ?? {};
    if (!c || c.length < 2) return [];
    const name = pick(props, ["name", "名称", "施設・場所名"]);
    if (!name) return [];
    const id = `gsi-${c[0].toFixed(5)}-${c[1].toFixed(5)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        name,
        kind: "指定緊急避難場所",
        address: pick(props, ["address", "住所", "所在地"]),
        position: { lat: c[1], lng: c[0] },
        source: "国土地理院「指定緊急避難場所データ」（地震）",
        note: "対応[たいおう]する災害[さいがい]の種別[しゅべつ]は、自治体[じちたい]の一覧[いちらん]でも確[たし]かめてください。",
      },
    ];
  });
}

/* --- 2. Google Places（避難場所になりやすい施設の候補） ---------------- */

async function fetchPlaceShelters(near: LatLng): Promise<Shelter[]> {
  const maps = await loadMaps();
  const { Place, SearchNearbyRankPreference } = (await maps.importLibrary(
    "places",
  )) as google.maps.PlacesLibrary;

  const { places } = await Place.searchNearby({
    fields: ["displayName", "location", "formattedAddress", "primaryTypeDisplayName"],
    locationRestriction: { center: near, radius: 1500 },
    includedPrimaryTypes: ["park", "primary_school", "school", "community_center"],
    maxResultCount: 8,
    rankPreference: SearchNearbyRankPreference.DISTANCE,
    language: "ja",
    region: "JP",
  });

  return places.flatMap((p): Shelter[] => {
    const loc = p.location;
    if (!loc) return [];
    return [
      {
        id: `place-${p.id}`,
        name: p.displayName ?? "名称不明",
        kind: p.primaryTypeDisplayName ?? "施設",
        address: p.formattedAddress ?? "",
        position: { lat: loc.lat(), lng: loc.lng() },
        source: "Google マップの施設情報（避難場所の候補）",
        note: "自治体[じちたい]が指定[してい]した避難場所[ひなんばしょ]とは限[かぎ]りません。実際[じっさい]の指定[してい]は自治体[じちたい]の一覧[いちらん]で確[たし]かめてください。",
      },
    ];
  });
}

/* --- 住所から地点を探す ------------------------------------------------ */

/**
 * 打ち間違いなどで該当が無いと、Geocoder は `country: "JP"` の制限に引きずられて
 * 「日本」（国の中心＝長野県の山中）を `partial_match` 付きで返してくる。
 * これは「見つからなかった」と同じ意味なので採用しない。
 */
const FALLBACK_TYPES = ["country"];

/**
 * 実在するが「家の近く」を指すには大きすぎる結果。
 * 都道府県の代表点は、歩いて行ける避難場所を探す起点には使えない。
 */
const TOO_COARSE_TYPES = ["administrative_area_level_1"];

/**
 * 表示用に住所を整える。
 * `formatted_address` は「日本、〒112-0012 東京都文京区…」の形で返ってくるが、
 * 国名と郵便番号は画面では読みづらいだけなので落とす。
 */
function tidyAddress(formatted: string) {
  return formatted
    .replace(/^日本[、,]\s*/, "")
    .replace(/^〒\d{3}-\d{4}\s*/, "")
    .trim();
}

/**
 * 住所検索の結果。
 * 「見つからない」と「大きすぎて使えない」は、画面での案内が変わるので分けている。
 */
export type GeocodeResult =
  | { ok: true; position: LatLng; label: string }
  | { ok: false; reason: "notfound" | "too-coarse" };

/** 住所や地名から緯度経度を引く（自宅付近の指定に使う） */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  if (!hasMapsKey()) return { ok: false, reason: "notfound" };
  const maps = await loadMaps();
  const geocoder = new maps.Geocoder();
  const { results } = await geocoder.geocode({
    address: query,
    region: "JP",
    componentRestrictions: { country: "JP" },
  });

  const first = results.find(
    (r) => !r.types.some((t) => FALLBACK_TYPES.includes(t) || TOO_COARSE_TYPES.includes(t)),
  );

  if (!first) {
    // 使える結果が無い。都道府県をそのまま入れたのなら「もっとくわしく」、
    // 国に落ちた（＝打ち間違い）なら「見つからなかった」と伝える。
    const coarse = results.some(
      (r) => !r.partial_match && r.types.some((t) => TOO_COARSE_TYPES.includes(t)),
    );
    return { ok: false, reason: coarse ? "too-coarse" : "notfound" };
  }

  return {
    ok: true,
    position: { lat: first.geometry.location.lat(), lng: first.geometry.location.lng() },
    label: tidyAddress(first.formatted_address),
  };
}

/* ------------------------------------------------------------------ */
/* 経路                                                                 */
/* ------------------------------------------------------------------ */

/** 徒歩の速さ（m/s）。時間の表示に使う（約 4.3 km/h） */
const WALK_SPEED = 1.2;

/**
 * 候補経路を返す。実APIから1本だけ取得できた場合もそのまま採用する。
 *
 * 1本目 = 距離と時間を優先した経路、2本目 = 迂回しやすさを優先した経路。
 * **どちらが安全かは断定しない**。画面には距離・時間・イベント数と、
 * 経路データから言える事実（曲がる回数など）だけを出す。
 */
export async function fetchRoutes(home: LatLng, shelter: Shelter, mode: EvacMode): Promise<RouteOption[]> {
  if (mode === "mock") return demoRoutes(home, shelter);
  if (!hasMapsKey()) throw new Error("地図のAPIキーが未設定です。入口で設定を確認してください。");
  const routes = await fetchRoutesFromGoogle(home, shelter);
  if (!routes.length) throw new Error("この場所への徒歩ルートが見つかりませんでした。場所を選び直してください。");
  return routes;
}

/**
 * 迂回ルートを引くための経由点。
 *
 * 家と避難場所を結ぶ直線の中点から、直線に垂直な向きへずらした地点を返す。
 * この点を経由地にして Routes API を叩くと、**実際の道に沿った**別ルートが返る。
 * 距離が短いと Routes API は代替ルートを返してくれないので、その埋め合わせに使う。
 */
function detourVia(home: LatLng, to: LatLng): LatLng {
  const latM = 111_132;
  const lngM = 111_320 * Math.cos((home.lat * Math.PI) / 180);
  // 家 → 避難場所のベクトル（東・北方向のメートル）
  const east = (to.lng - home.lng) * lngM;
  const north = (to.lat - home.lat) * latM;
  const len = Math.hypot(east, north) || 1;
  // ずらす量。近すぎても遠すぎても遠回りしすぎるので幅を決める。
  const off = Math.min(500, Math.max(150, len * 0.4));
  // 垂直方向は (-north, east)
  return {
    lat: (home.lat + to.lat) / 2 + ((east / len) * off) / latM,
    lng: (home.lng + to.lng) / 2 + ((-north / len) * off) / lngM,
  };
}

async function fetchRoutesFromGoogle(home: LatLng, shelter: Shelter): Promise<RouteOption[]> {
  const found = await requestWalkingRoutes(home, shelter.position);
  const sorted = [...found].sort((a, b) => a.distanceM - b.distanceM);
  if (!sorted.length) return [];
  const fingerprint = (route: WalkingRoute) => JSON.stringify(route.path);
  const primaryPath = fingerprint(sorted[0]);
  let alternative = sorted.findLast((route) => fingerprint(route) !== primaryPath);
  if (!alternative) {
    try {
      const extra = await requestWalkingRoutes(home, shelter.position, detourVia(home, shelter.position));
      alternative = extra.find((route) => fingerprint(route) !== primaryPath);
    } catch {
      // 代替ルートがなくても、取得できた実経路1本で進める。
    }
  }
  // 経由地点付きのルートが短くなるケースも含め、表示する候補を距離順にする。
  const candidates = alternative ? [sorted[0], alternative].sort((a, b) => a.distanceM - b.distanceM) : [sorted[0]];
  const options = candidates.map((route, i): RouteOption => {
    const kind = i === 0 ? "short" : "safe";
    const eventCount = i === 0 ? 3 : 2;
    return {
      id: `${kind}-${Math.round(route.distanceM)}-${i}`,
      kind,
      label: i === 0 ? "距離[きょり]が短[みじか]いルート" : "もうひとつのルート",
      notes: routeNotes(kind, route.distanceM, route.segments, eventCount),
      distanceM: route.distanceM,
      durationS: route.durationS,
      path: route.path,
      eventCount,
    };
  });
  return assessRouteOptions(options);
}

type AssessmentResponse = {
  version?: unknown;
  assessments?: Record<string, RouteAssessment>;
};

/**
 * Googleが返した候補座標を自前サーバーへ送り、収録済み地形と照合する。
 * Google経路の取得自体は成功しているため、比較APIだけが失敗したときは
 * 経路を捨てず、未評価であることをカードへ明示する。
 */
async function assessRouteOptions(routes: RouteOption[]): Promise<RouteOption[]> {
  try {
    const response = await fetch("/api/evac/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        routes: routes.map(({ id, path, distanceM, durationS }) => ({
          id,
          path,
          distanceM,
          durationS,
        })),
      }),
    });
    if (!response.ok) throw new Error(`route-assessment-${response.status}`);
    const payload = (await response.json()) as AssessmentResponse;
    if (payload.version !== "training-google-v1" || !payload.assessments)
      throw new Error("invalid-route-assessment");
    return routes.map((route) => {
      const assessment = payload.assessments?.[route.id];
      if (!assessment) throw new Error("missing-route-assessment");
      return {
        ...route,
        assessment,
        notes: [...route.notes, ...assessment.notes],
      };
    });
  } catch {
    return routes.map((route) => ({
      ...route,
      notes: [
        ...route.notes,
        "地形[ちけい]データとの比較[ひかく]は取得[しゅとく]できませんでした。距離[きょり]・時間[じかん]だけを確認[かくにん]してください",
      ],
    }));
  }
}

/**
 * 経路の説明文。
 * 「安全です」とは書かず、経路データから言えることだけを並べる（仕様 5・11）。
 */
function routeNotes(
  kind: RouteOption["kind"],
  _meters: number,
  turns: number,
  eventCount: number,
): string[] {
  const notes = [
    kind === "short" ? "候補[こうほ]の中[なか]で距離[きょり]が短[みじか]い" : "別[べつ]の道順[みちじゅん]を比較[ひかく]できる",
    `経路[けいろ]の区間[くかん]は ${turns} 区間[くかん]`,
    `練習用[れんしゅうよう]の判断[はんだん]ポイントは ${eventCount} 件[けん]`,
  ];
  return notes;
}

/** モック版専用。碁盤の目に沿った2本を作る。 */
function demoRoutes(home: LatLng, shelter: Shelter): RouteOption[] {
  const to = shelter.position;
  const mid1 = { lat: home.lat, lng: home.lng + (to.lng - home.lng) * 0.62 };
  const mid2 = { lat: to.lat, lng: mid1.lng };

  // 最短：ほぼ L 字
  const shortPath = [home, mid1, mid2, to];

  // 迂回しやすいルート：いったん北へ振ってから東へ
  const north = { lat: home.lat + 0.0016, lng: home.lng };
  const northEast = { lat: north.lat, lng: to.lng + 0.0008 };
  const safePath = [home, north, northEast, { lat: to.lat, lng: northEast.lng }, to];

  const build = (
    path: LatLng[],
    kind: RouteOption["kind"],
    eventCount: number,
  ): RouteOption => {
    const meters = pathLengthM(path);
    return {
      id: `demo-${kind}`,
      kind,
      label: kind === "short" ? "距離[きょり]が短[みじか]いルート" : "もうひとつのルート",
      notes: routeNotes(kind, meters, path.length - 1, eventCount),
      distanceM: meters,
      durationS: Math.round(meters / WALK_SPEED),
      path,
      eventCount,
      demo: true,
    };
  };

  return [build(shortPath, "short", 3), build(safePath, "safe", 2)];
}

/** 現在地から引き直す。模式図の経路では、同じ地点から練習用の迂回路を作る。 */
export async function fetchDetourFrom(
  from: LatLng,
  shelter: Shelter,
  mode: EvacMode,
): Promise<RouteOption | null> {
  if (mode === "mock") {
    const route = demoRoutes(from, shelter)[1];
    return { ...route, id: `demo-detour-${from.lat}-${from.lng}`, label: "迂回[うかい]した道[みち]" };
  }
  if (!hasMapsKey()) return null;
  try {
    const [found] = await requestWalkingRoutes(
      from,
      shelter.position,
      detourVia(from, shelter.position),
    );
    if (!found) return null;
    const path = found.path;

    const connectionM = distanceM(from, path[0]);
    // 大きく離れた道路へ補正された場合は、移動を捏造せず再選択を案内する。
    if (connectionM > 50) return null;
    const connectedPath = connectionM < 0.01 ? path : [from, ...path];
    const meters = found.distanceM + connectionM;
    const seconds = found.durationS + connectionM / WALK_SPEED;
    const turns = found.segments;

    const option: RouteOption = {
      id: `detour-${Math.round(meters)}-${Math.round(from.lat * 1e5)}`,
      kind: "safe",
      label: "迂回[うかい]した道[みち]",
      notes: routeNotes("safe", meters, turns, 2),
      distanceM: meters,
      durationS: seconds,
      path: connectedPath,
      eventCount: 2,
    };
    return (await assessRouteOptions([option]))[0] ?? option;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 判断地点                                                             */
/* ------------------------------------------------------------------ */

export type DecisionPoint = {
  id: string;
  /** 経路上の位置（0–1） */
  t: number;
  position: LatLng;
  /** そこで進んでいる向き（地図上のコマに使う） */
  heading: number;
  event: HazardEvent;
  /** 残り距離・残り時間（この地点に着いた時点） */
  remainingM: number;
  remainingS: number;
};

/**
 * 経路上の判断地点を返す。
 *
 * geo-aiは別途取り込んだ地形データをAIで分析する。sampleは固定の練習用配置。
 * Googleの地図画像やStreet ViewはAIへ送らない。
 */
export async function fetchDecisionPoints(route: RouteOption, options?: { source: "geo-ai" | "sample"; signal?: AbortSignal; excludedEventIds?: string[]; maxPoints?: number }): Promise<DecisionPoint[]> {
  if (options?.source === "geo-ai") {
    const response = await fetch("/api/evac/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
      body: JSON.stringify({ route: { id: route.id, path: route.path, durationS: route.durationS }, excludedEventIds: options.excludedEventIds ?? [] }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "地理データのAI解析に接続できませんでした。");
    if (result.source !== "geo-ai" || !Array.isArray(result.points)) throw new Error("地理データの解析結果を読み取れませんでした。");
    return result.points.slice(0, options.maxPoints ?? 3) as DecisionPoint[];
  }
  await wait(200);
  // 最短ルートは3件、もう一方は2件（仕様 4：1体験につき2〜3件）
  const plan =
    route.kind === "short"
      ? [
          { t: 0.28, eventId: "wall" },
          { t: 0.55, eventId: "fall" },
          { t: 0.78, eventId: "closed" },
        ]
      : [
          { t: 0.35, eventId: "fall" },
          { t: 0.7, eventId: "closed" },
        ];

  const total = pathLengthM(route.path);

  return plan.flatMap(({ t, eventId }, i) => {
    const event = HAZARD_EVENTS.find((e) => e.id === eventId);
    if (!event) return [];
    return [
      {
        id: `${route.id}:${eventId}:${i}`,
        t,
        position: pointAt(route.path, t),
        heading: headingAt(route.path, t),
        event,
        remainingM: Math.round(total * (1 - t)),
        remainingS: Math.round((total * (1 - t)) / WALK_SPEED),
      },
    ];
  });
}

/* ------------------------------------------------------------------ */
/* 制限時間                                                             */
/* ------------------------------------------------------------------ */

export const TIMER_PRESETS = [
  { seconds: DEFAULT_TIMER_SECONDS, label: "10秒[びょう]" },
  { seconds: 20, label: "20秒[びょう]（延長[えんちょう]）" },
  { seconds: 0, label: "なし（時間[じかん]を気[き]にせず考[かんが]える）" },
];

/* ------------------------------------------------------------------ */
/* 経路を歩く                                                            */
/* ------------------------------------------------------------------ */

export type WalkStep = {
  id: string;
  /** 経路上の位置（0–1） */
  t: number;
  position: LatLng;
  /** 進行方向（度）。北が0 */
  heading: number;
  remainingM: number;
  remainingS: number;
  /** ひとつ前の地点からの想定移動時間。迂回後の集計にも使う。 */
  travelSeconds: number;
  /** この地点で起きる判断イベント（無ければ、ただ進むだけの地点） */
  event?: HazardEvent;
  pointId?: string;
};

/** 地図上で進む1区間の目安（m）。 */
const STEP_M = 45;

/** 曲がり角も必ず含める。通った道が建物を横切る直線にならないようにする。 */
export function buildWalkSteps(route: RouteOption, points: DecisionPoint[]): WalkStep[] {
  const total = pathLengthM(route.path);
  const count = Math.min(24, Math.max(5, Math.round(total / STEP_M)));
  const positions = new Map<number, LatLng>();
  let traversed = 0;
  route.path.forEach((position, i) => {
    if (i > 0) traversed += distanceM(route.path[i - 1], position);
    positions.set(total > 0 ? traversed / total : 0, position);
  });
  const ts = new Set<number>(positions.keys());
  for (let i = 0; i <= count; i++) ts.add(i / count);
  for (const p of points) ts.add(p.t);
  const sorted = [...ts].sort((a, b) => a - b);
  return sorted.map((t, i): WalkStep => {
    const point = points.find((p) => p.t === t);
    return {
      id: `${route.id}:${t}`,
      t,
      position: point?.position ?? positions.get(t) ?? pointAt(route.path, t),
      heading: point?.heading ?? headingAt(route.path, t),
      remainingM: Math.round(total * (1 - t)),
      remainingS: Math.round(route.durationS * (1 - t)),
      travelSeconds: (t - (sorted[i - 1] ?? 0)) * route.durationS,
      event: point?.event,
      pointId: point?.id,
    };
  });
}
