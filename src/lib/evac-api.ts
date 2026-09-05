"use client";

/**
 * フェーズ2のバックエンド境界。
 *
 * フェーズ1の `api.ts` と同じで、シグネチャを変えずに中身だけ差し替えられるようにしてある。
 *   - `fetchShelters()`   … 自治体オープンデータ（指定緊急避難場所・指定避難所）
 *   - `fetchRoutes()`     … 徒歩の候補経路。いまは Maps JS の DirectionsService。
 *                            サーバー側で Routes API を叩く形にも差し替えられる。
 *   - `fetchDecisionPoints()` … 経路上の判断地点。ルールエンジンが決める。
 *
 * Maps が読み込めないとき（キーなし・オフライン）は、
 * 同じ形のデモデータを返して UI をそのまま動かす（仕様 13）。
 */

import {
  DEFAULT_TIMER_SECONDS,
  DEMO_SHELTERS,
  HAZARD_EVENTS,
  type HazardEvent,
  type LatLng,
  type RouteOption,
  type Shelter,
} from "./evac-content";
import { hasMapsKey, loadMaps } from "./gmaps";

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
 * 指定した地点の近くの避難場所を返す。
 *
 * 探しにいく順番:
 *   1. 国土地理院「指定緊急避難場所」データ（公的データ。地震に対応する skhb01）
 *   2. Google Places（公園・学校・公民館など、避難場所になりやすい施設の候補）
 *   3. デモデータ（どちらも使えないとき）
 *
 * 2 は「自治体が指定した避難場所」ではないので、画面では候補として出し、
 * 自治体の一覧で確認するよう促す（`Shelter.source` をそのまま表示している）。
 */
export async function fetchShelters(near: LatLng): Promise<Shelter[]> {
  const sort = (list: Shelter[]) =>
    [...list]
      .sort((a, b) => distanceM(near, a.position) - distanceM(near, b.position))
      .slice(0, 5);

  try {
    const official = await fetchGsiShelters(near);
    if (official.length > 0) return sort(official);
  } catch {
    // 公的データを取れなければ次の手段へ
  }

  if (hasMapsKey()) {
    try {
      const places = await fetchPlaceShelters(near);
      if (places.length > 0) return sort(places);
    } catch {
      // Places も使えなければデモデータへ
    }
  }

  await wait(200);
  return sort(DEMO_SHELTERS);
}

/* --- 1. 国土地理院の指定緊急避難場所データ --------------------------- */

/** 緯度経度 → タイル座標 */
function tileOf(p: LatLng, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((p.lng + 180) / 360) * n);
  const latRad = (p.lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

type GsiFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
};

/**
 * 地理院タイルの GeoJSON（skhb01 = 地震）から、周囲の指定緊急避難場所を集める。
 * 中心のタイルとその周り 8 枚を見る。
 *
 * 取得できない環境（CORS・オフラインなど）では例外にして、呼び出し側が次の手段に移る。
 */
async function fetchGsiShelters(near: LatLng): Promise<Shelter[]> {
  const z = 14;
  const { x, y } = tileOf(near, z);
  const tiles: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) tiles.push({ x: x + dx, y: y + dy });
  }

  const results = await Promise.all(
    tiles.map(async (t) => {
      const res = await fetch(`https://maps.gsi.go.jp/xyz/skhb01/${z}/${t.x}/${t.y}.geojson`);
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

  return results.flat().flatMap((f, i): Shelter[] => {
    const c = f.geometry?.coordinates;
    const props = f.properties ?? {};
    if (!c || c.length < 2) return [];
    const name = pick(props, ["名称", "施設・場所名", "name"]);
    if (!name) return [];
    return [
      {
        id: `gsi-${i}-${c[0].toFixed(5)}-${c[1].toFixed(5)}`,
        name,
        kind: "指定緊急避難場所",
        address: pick(props, ["住所", "所在地", "address"]),
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

/** 住所や地名から緯度経度を引く（自宅付近の指定に使う） */
export async function geocodeAddress(
  query: string,
): Promise<{ position: LatLng; label: string } | null> {
  if (!hasMapsKey()) return null;
  const maps = await loadMaps();
  const geocoder = new maps.Geocoder();
  const { results } = await geocoder.geocode({
    address: query,
    region: "JP",
    componentRestrictions: { country: "JP" },
  });
  const first = results[0];
  if (!first) return null;
  return {
    position: { lat: first.geometry.location.lat(), lng: first.geometry.location.lng() },
    label: first.formatted_address,
  };
}

/* ------------------------------------------------------------------ */
/* 経路                                                                 */
/* ------------------------------------------------------------------ */

/** 徒歩の速さ（m/s）。時間の表示に使う（約 4.3 km/h） */
const WALK_SPEED = 1.2;

/**
 * 候補経路を2本返す。
 *
 * 1本目 = 距離と時間を優先した経路、2本目 = 迂回しやすさを優先した経路。
 * **どちらが安全かは断定しない**。画面には距離・時間・イベント数と、
 * 経路データから言える事実（曲がる回数など）だけを出す。
 */
export async function fetchRoutes(home: LatLng, shelter: Shelter): Promise<RouteOption[]> {
  if (hasMapsKey()) {
    try {
      const routes = await fetchRoutesFromDirections(home, shelter);
      if (routes.length >= 2) return routes;
    } catch {
      // 取れなければデモ経路に落ちる
    }
  }
  await wait(300);
  return demoRoutes(home, shelter);
}

/** Maps JS の DirectionsService（徒歩・代替経路あり）から取る */
async function fetchRoutesFromDirections(
  home: LatLng,
  shelter: Shelter,
): Promise<RouteOption[]> {
  const maps = await loadMaps();
  const service = new maps.DirectionsService();

  const result = await service.route({
    origin: home,
    destination: shelter.position,
    travelMode: maps.TravelMode.WALKING,
    provideRouteAlternatives: true,
    language: "ja",
    region: "JP",
  });

  const sorted = [...result.routes].sort(
    (a, b) => legMeters(a) - legMeters(b),
  );
  if (sorted.length === 0) return [];

  // 最短と、いちばん違う経路（＝迂回しやすい別ルート）を選ぶ
  const shortest = sorted[0];
  const alternative = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  const options: RouteOption[] = [toRouteOption(shortest, "short", 3)];
  if (alternative) options.push(toRouteOption(alternative, "safe", 2));
  return options;

  function legMeters(r: google.maps.DirectionsRoute) {
    return r.legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0);
  }

  function toRouteOption(
    r: google.maps.DirectionsRoute,
    kind: RouteOption["kind"],
    eventCount: number,
  ): RouteOption {
    const meters = legMeters(r);
    const seconds = r.legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0);
    const steps = r.legs.flatMap((l) => l.steps);
    const path = (r.overview_path ?? []).map((p) => ({ lat: p.lat(), lng: p.lng() }));
    return {
      id: `${kind}-${Math.round(meters)}`,
      kind,
      label: kind === "short" ? "最短[さいたん]ルート" : "迂回[うかい]しやすいルート",
      notes: routeNotes(kind, meters, steps.length, eventCount),
      distanceM: meters,
      durationS: seconds || Math.round(meters / WALK_SPEED),
      path: path.length > 1 ? path : [home, shelter.position],
      eventCount,
    };
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
  const notes: string[] = [];
  if (kind === "short") {
    notes.push("距離[きょり]と時間[じかん]がいちばん短[みじか]い");
    notes.push(`曲[ま]がる回数[かいすう]は ${turns} 回[かい]`);
    notes.push("細[ほそ]い道[みち]を含[ふく]むことがある");
  } else {
    notes.push("大[おお]きい道[みち]を通[とお]るぶん、距離[きょり]は長[なが]い");
    notes.push(`曲[ま]がる回数[かいすう]は ${turns} 回[かい]`);
    notes.push("途中[とちゅう]で別[べつ]の道[みち]に切[き]り替[か]えやすい");
  }
  notes.push(`このルートで起[お]きる判断[はんだん]イベントは ${eventCount} 件[けん]`);
  return notes;
}

/** Maps を使えないときのデモ経路。碁盤の目に沿った2本を作る。 */
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
      label: kind === "short" ? "最短[さいたん]ルート" : "迂回[うかい]しやすいルート",
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

/* ------------------------------------------------------------------ */
/* 判断地点                                                             */
/* ------------------------------------------------------------------ */

export type DecisionPoint = {
  id: string;
  /** 経路上の位置（0–1） */
  t: number;
  position: LatLng;
  /** そこで進んでいる向き（ストリートビューの初期 POV に使う） */
  heading: number;
  event: HazardEvent;
  /** 残り距離・残り時間（この地点に着いた時点） */
  remainingM: number;
  remainingS: number;
};

/**
 * 経路上の判断地点を返す。
 *
 * どの地点でどのイベントを出すかは **ルールエンジン側の担当**（仕様 10）。
 * ストリートビューの画像を見て決めているわけではない。
 */
export async function fetchDecisionPoints(route: RouteOption): Promise<DecisionPoint[]> {
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
  /** 進行方向（度）。ストリートビューの向きに使う */
  heading: number;
  remainingM: number;
  remainingS: number;
  /** この地点で起きる判断イベント（無ければ、ただ進むだけの地点） */
  event?: HazardEvent;
  pointId?: string;
};

/** 1歩ぶんの距離（m）。ストリートビューを進める間隔。 */
const STEP_M = 70;

/**
 * 自宅から避難場所までを、ストリートビューで歩ける粒度に区切る。
 * 判断地点はその途中に混ぜ込む。
 */
export function buildWalkSteps(route: RouteOption, points: DecisionPoint[]): WalkStep[] {
  const total = pathLengthM(route.path);
  const count = Math.min(24, Math.max(5, Math.round(total / STEP_M)));

  const ts = new Set<number>();
  for (let i = 0; i <= count; i++) ts.add(Number((i / count).toFixed(4)));
  for (const p of points) ts.add(Number(p.t.toFixed(4)));

  return [...ts]
    .sort((a, b) => a - b)
    .map((t): WalkStep => {
      const point = points.find((p) => Number(p.t.toFixed(4)) === t);
      return {
        id: `${route.id}:${t}`,
        t,
        position: point?.position ?? pointAt(route.path, t),
        heading: point?.heading ?? headingAt(route.path, t),
        remainingM: Math.round(total * (1 - t)),
        remainingS: Math.round((total * (1 - t)) / WALK_SPEED),
        event: point?.event,
        pointId: point?.id,
      };
    });
}
