"use client";

import { EVAC_SCENARIOS, SHELTER_DISASTERS, type EvacScenario } from "./evac-scenario";
import { compareFloodRoutes } from "./flood-hazard";
import { groupSchoolShelters } from "./shelter-groups";
import { floodPracticeEvent } from "./geo-events";
import { hasRouteBacktracking, similarRoutePaths } from "./route-backtracking";
import { findRouteBranches, followsRouteBranch } from "./route-branches";

/**
 * フェーズ2の取得境界。フェーズ1のfixture/liveと同様、モードを明示する。
 * mock: サンプル避難場所・合成ルート。外部サービスを呼ばない。
 * api: 災害種別に対応するGSIの避難場所と、Maps JS Routes Libraryの徒歩ルート。
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

/** 選択した災害に対応する公的な指定緊急避難場所だけを返す。 */
export async function fetchShelters(near: LatLng, mode: EvacMode, scenario: EvacScenario = "earthquake"): Promise<Shelter[]> {
  const nearby = (list: Shelter[]) =>
    [...list]
      .filter((s) => distanceM(near, s.position) <= NEARBY_RADIUS_M)
      .sort((a, b) => distanceM(near, a.position) - distanceM(near, b.position))
      .slice(0, 5);

  if (mode === "mock") return nearby(DEMO_SHELTERS).map((s) => ({ ...s, source: "練習用サンプル（現在の指定状況は未確認）" }));
  if (!hasMapsKey()) throw new Error("地図のAPIキーが未設定です。入口で設定を確認してください。");

  try {
    return nearby(groupSchoolShelters(await fetchGsiShelters(near, scenario), near));
  } catch {
    throw new Error(`${EVAC_SCENARIOS[scenario].label}に対応する指定緊急避難場所を取得できませんでした。通信を確認して再試行してください。`);
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
 * 地理院タイルの GeoJSON（選択した災害の指定緊急避難場所）から、周囲の候補を集める。
 *
 * 取得できない環境（CORS・オフラインなど）では例外にして、呼び出し側が再試行を案内する。
 */
async function fetchGsiShelters(near: LatLng, scenario: EvacScenario): Promise<Shelter[]> {
  const tiles = tilesAround(near, GSI_ZOOM, NEARBY_RADIUS_M);

  const results = await Promise.all(
    tiles.map(async (t) => {
      const res = await fetch(
        `https://maps.gsi.go.jp/xyz/${EVAC_SCENARIOS[scenario].layer}/${GSI_ZOOM}/${t.x}/${t.y}.geojson`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.status === 404) return [] as GsiFeature[];
      if (!res.ok) throw new Error("gsi-unavailable");
      const json = (await res.json()) as { features?: GsiFeature[] };
      if (!Array.isArray(json.features)) throw new Error("invalid-shelter-data");
      return json.features;
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
    if (!c || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return [];
    if (String(props[EVAC_SCENARIOS[scenario].flag]) !== "1") return [];
    const name = pick(props, ["name", "名称", "施設・場所名"]);
    if (!name) return [];
    const id = `gsi-${c[0].toFixed(5)}-${c[1].toFixed(5)}-${encodeURIComponent(name)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        name,
        kind: `指定緊急避難場所（${EVAC_SCENARIOS[scenario].label}）`,
        supportedDisasters: SHELTER_DISASTERS.filter((_, i) => String(props[`disaster${i + 1}`]) === "1"),
        address: pick(props, ["address", "住所", "所在地"]),
        position: { lat: c[1], lng: c[0] },
        source: `国土地理院「指定緊急避難場所データ」（${EVAC_SCENARIOS[scenario].label}）`,
        note: [pick(props, ["remarks"]), "対応[たいおう]する災害[さいがい]の種別[しゅべつ]は、自治体[じちたい]の一覧[いちらん]でも確[たし]かめてください。"].filter(Boolean).join(" "),
      },
    ];
  });
}


/* ------------------------------------------------------------------ */
/* 経路                                                                 */
/* ------------------------------------------------------------------ */

/** 徒歩の速さ（m/s）。時間の表示に使う（約 4.3 km/h） */
const WALK_SPEED = 1.2;

/**
 * 候補経路を返す。実APIから1本だけ取得できた場合もそのまま採用する。
 *
 * 実在する分岐の別の道も探索し、距離順に最大3本を返す。
 * **どの道が安全かは断定しない**。画面には距離・時間・イベント数と、
 * 経路データから言える事実（曲がる回数など）だけを出す。
 */
export async function fetchRoutes(home: LatLng, shelter: Shelter, mode: EvacMode, scenario: EvacScenario = "earthquake"): Promise<RouteOption[]> {
  if (mode === "mock") return demoRoutes(home, shelter);
  if (!hasMapsKey()) throw new Error("地図のAPIキーが未設定です。入口で設定を確認してください。");
  const routes = await fetchRoutesFromGoogle(home, shelter, scenario);
  if (!routes.length) throw new Error("同じ道を引き返さずに進める徒歩ルートが見つかりませんでした。避難先を選び直してください。");
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
  // 歩行中の迂回用。最初のルート候補には、実在する分岐を使う。
  const off = Math.min(500, Math.max(150, len * 0.4));
  // 垂直方向は (-north, east)
  return {
    lat: (home.lat + to.lat) / 2 + ((east / len) * off) / latM,
    lng: (home.lng + to.lng) / 2 + ((-north / len) * off) / lngM,
  };
}

async function fetchRoutesFromGoogle(home: LatLng, shelter: Shelter, scenario: EvacScenario): Promise<RouteOption[]> {
  const found = await requestWalkingRoutes(home, shelter.position);
  const unique = new Map<string, WalkingRoute>();
  const collect = (routes: WalkingRoute[]) => {
    for (const route of routes) {
      const key = [...unique.entries()].find(([, prior]) => similarRoutePaths(prior.path, route.path))?.[0] ?? JSON.stringify(route.path);
      const previous = unique.get(key);
      if (!previous || route.distanceM < previous.distanceM) unique.set(key, route);
    }
  };
  collect(found);
  // 機械的に遠方へ経由点を置かず、実在する分岐の別の道を比較する。
  // 通常候補が3本あっても、分かれ道の直進などを探索対象にする。
  const branches = await findRouteBranches(found.length ? found.map(route => route.path) : [[home, shelter.position]])
    .catch(() => []);
  for (let i = 0; i < branches.length; i += 2) {
    const results = await Promise.allSettled(branches.slice(i, i + 2).map(async branch => {
      const routes = await requestWalkingRoutes(home, shelter.position, branch.via);
      return routes.filter(route => followsRouteBranch(route.path, branch));
    }));
    for (const result of results) {
      if (result.status === "fulfilled") collect(result.value);
    }
    if (unique.size >= 3) break;
  }
  const candidates = [...unique.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, 3);
  if (!candidates.length) return [];
  const toOption = (route: WalkingRoute, i: number): RouteOption => {
    const kind = i === 0 ? "short" : "safe";
    const eventCount = i === 0 ? 3 : 2;
    return {
      id: `${kind}-${Math.round(route.distanceM)}-${i}`,
      kind,
      label: i === 0 ? "距離[きょり]が短[みじか]いルート" : `別[べつ]のルート ${String.fromCharCode(65 + i)}`,
      notes: routeNotes(kind, route.distanceM, route.segments, eventCount),
      distanceM: route.distanceM,
      durationS: route.durationS,
      path: route.path,
      eventCount,
    };
  };
  const assessed = await assessRouteOptions(candidates.map(toOption), scenario);
  if (scenario !== "flood") return assessed;
  const vias: LatLng[] = [];
  for (const route of assessed) for (const via of route.assessment?.flood?.suggestedVias ?? []) {
    if (vias.every(prior => distanceM(prior, via) > 80)) vias.push(via);
  }
  // ハザード上でより浅い地点を経由する実経路を取得し、道全体を再評価する。
  const extra: RouteOption[] = [];
  const known = candidates.map(route => route.path);
  for (let i = 0; i < Math.min(vias.length, 4); i += 2) {
    const results = await Promise.allSettled(vias.slice(i, Math.min(i + 2, 4)).map(via => requestWalkingRoutes(home, shelter.position, via)));
    for (const result of results) if (result.status === "fulfilled") for (const route of result.value) {
      if (known.some(path => similarRoutePaths(path, route.path))) continue;
      known.push(route.path);
      extra.push(toOption(route, extra.length + 10));
    }
  }
  const added: RouteOption[] = [];
  for (let i = 0; i < extra.length; i += 4) added.push(...await assessRouteOptions(extra.slice(i, i + 4), scenario));
  const all = [...assessed, ...added];
  const shortest = Math.min(...all.map(route => route.distanceM));
  const allColored = all.every(route => (route.assessment?.flood?.coloredM ?? 0) > 0);
  return all.sort(compareFloodRoutes).slice(0, 3).map((route, i) => ({
    ...route,
    assessment: route.assessment ? { ...route.assessment, rank: route.assessment.flood?.status === "available" ? i + 1 : null, comparisonScore: null } : undefined,
    kind: route.distanceM === shortest ? "short" : "safe",
    label: route.assessment?.flood?.status === "available" && i === 0 ? "浸水想定を考慮したルート" : "比較するルート",
    notes: [
      ...(allColored ? ["今回取得できた候補には、浸水想定の着色区間を完全に避けるルートはありません。"] : []),
      ...route.notes.filter(note => !note.startsWith("候補[こうほ]の中") && !note.startsWith("収録地形[しゅうろくちけい]・距離")),
      ...(route.assessment?.flood?.status === "available" ? ["浸水想定の深さの区分と着色区間の長さを優先して比較しています。無着色は未指定・未収録を含みます。"] : []),
    ],
  }));
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
async function assessRouteOptions(routes: RouteOption[], scenario: EvacScenario = "earthquake"): Promise<RouteOption[]> {
  try {
    const response = await fetch("/api/evac/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        scenario,
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
        scenario === "flood" ? "洪水ハザード・地形データの比較を取得できませんでした。距離・時間だけを表示しています。" : "地形[ちけい]データとの比較[ひかく]は取得[しゅとく]できませんでした。距離[きょり]・時間[じかん]だけを確認[かくにん]してください",
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
  scenario: EvacScenario = "earthquake",
  previousPath?: LatLng[],
): Promise<RouteOption | null> {
  if (mode === "mock") {
    const route = demoRoutes(from, shelter)[1];
    return { ...route, id: `demo-detour-${from.lat}-${from.lng}`, label: "迂回[うかい]した道[みち]" };
  }
  if (!hasMapsKey()) return null;
  try {
    if (previousPath) {
      const candidates = await fetchRoutes(from, shelter, mode, scenario);
      for (const candidate of candidates) {
        const connection = distanceM(from, candidate.path[0]);
        const path = connection < .01 ? candidate.path : [from,...candidate.path];
        if (connection > 50 || hasRouteBacktracking(path) || similarRoutePaths(path,previousPath)) continue;
        return {...candidate,path,distanceM:candidate.distanceM+connection,durationS:candidate.durationS+connection/WALK_SPEED,id:`detour-${Date.now()}-${candidate.id}`,label:"見直した道[みち]"};
      }
    }
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
    if (hasRouteBacktracking(connectedPath) || (previousPath && similarRoutePaths(connectedPath, previousPath))) return null;
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
    return (await assessRouteOptions([option], scenario))[0] ?? option;
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
export async function fetchDecisionPoints(route: RouteOption, options?: { source: "geo-ai" | "context" | "sample"; scenario?: EvacScenario; signal?: AbortSignal; excludedEventIds?: string[]; maxPoints?: number }): Promise<DecisionPoint[]> {
  if (options?.source === "context") {
    const commercial: LatLng[] = [];
    try {
      const searches = (async () => {
        const maps = await loadMaps();
        const { Place } = await maps.importLibrary("places") as google.maps.PlacesLibrary;
        options.signal?.throwIfAborted();
        return Promise.all([.2,.5,.8].map(async t => {
        const result = await Place.searchNearby({fields:["location"], locationRestriction:{center:pointAt(route.path,t),radius:150},includedPrimaryTypes:["shopping_mall","department_store","supermarket"],maxResultCount:4});
        return result.places.flatMap(p => p.location ? [p.location.toJSON()] : []);
        }));
      })();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { commercial.push(...await Promise.race([searches,new Promise<LatLng[]>(resolve => {timer=setTimeout(() => resolve([]),4000);})]).then(results => results.flat())); }
      finally { if (timer) clearTimeout(timer); }
    } catch { /* Places is optional: unconfirmed commercial areas are not inferred. */ }
    options.signal?.throwIfAborted();
    const response = await fetch("/api/evac/scenarios", {
      method:"POST",headers:{"Content-Type":"application/json"}, signal:options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      body:JSON.stringify({scenario:options.scenario ?? "earthquake",route:{id:route.id,path:route.path,durationS:route.durationS},excludedEventIds:options.excludedEventIds ?? [],maxPoints:options.maxPoints,commercial}),
    });
    const result = await response.json();
    if (!response.ok || result.source !== "context" || !Array.isArray(result.points)) throw new Error(result.message ?? "想定問題の準備に失敗しました。再試行してください。");
    return result.points as DecisionPoint[];
  }
  if (options?.source === "geo-ai") {
    const response = await fetch("/api/evac/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000),
      body: JSON.stringify({ scenario: options?.scenario ?? "earthquake", route: { id: route.id, path: route.path, durationS: route.durationS }, excludedEventIds: options.excludedEventIds ?? [] }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "地理データのAI解析に接続できませんでした。");
    if (result.source !== "geo-ai" || !Array.isArray(result.points)) throw new Error("地理データの解析結果を読み取れませんでした。");
    return result.points.slice(0, options.maxPoints ?? 3) as DecisionPoint[];
  }
  await wait(200);
  // 最短ルートは3件、もう一方は2件（仕様 4：1体験につき2〜3件）
  const plan = options?.scenario === "flood" ? [{ t: 0.5, eventId: "practice-flood" }] :
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
    const event = eventId === "practice-flood" ? floodPracticeEvent() : HAZARD_EVENTS.find((e) => e.id === eventId);
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
  { seconds: DEFAULT_TIMER_SECONDS, label: "15秒[びょう]" },
  { seconds: 25, label: "25秒[びょう]" },
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
export function buildWalkSteps(route: RouteOption, points: DecisionPoint[], stepM?: number): WalkStep[] {
  const total = pathLengthM(route.path);
  const count = stepM ? Math.max(1, Math.ceil(total / stepM)) : Math.min(24, Math.max(5, Math.round(total / STEP_M)));
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
  return sorted.flatMap((t, i): WalkStep[] => {
    const matches = points.filter((p) => p.t === t);
    const base: WalkStep = {
      id: `${route.id}:${t}`,
      t,
      position: positions.get(t) ?? pointAt(route.path, t),
      heading: headingAt(route.path, t),
      remainingM: Math.round(total * (1 - t)),
      remainingS: Math.round(route.durationS * (1 - t)),
      travelSeconds: (t - (sorted[i - 1] ?? 0)) * route.durationS,
    };
    if (!matches.length) return [base];
    const events = matches.map((point,j) => ({...base,id:`${route.id}:${t}:${j}`,position:point.position,heading:point.heading,event:point.event,pointId:point.id,travelSeconds:j === 0 ? base.travelSeconds : 0}));
    // Keep the origin record even when several exercises are queued before the first move.
    return t === 0 ? [base,...events] : events;
  });
}
