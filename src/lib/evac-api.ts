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
import { MAPS_API_KEY, hasMapsKey, loadMaps } from "./gmaps";

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
 * 地理院タイル（z14 の 3×3 枚）が覆う範囲とだいたい合わせてある。
 * これより遠い候補は、指定した地点の「近く」ではないので出さない。
 */
const NEARBY_RADIUS_M = 3000;

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
 *
 * どの手段でも、指定した地点から `NEARBY_RADIUS_M` より遠いものは落とす。
 * 遠くの避難場所を「近く」として並べると、その地点に避難場所があるかのように
 * 誤って伝わるため（仕様 11）。近くに1件も無ければ空配列を返し、
 * 画面側が「見つからなかった」と出す。
 */
export async function fetchShelters(near: LatLng): Promise<Shelter[]> {
  const nearby = (list: Shelter[]) =>
    [...list]
      .filter((s) => distanceM(near, s.position) <= NEARBY_RADIUS_M)
      .sort((a, b) => distanceM(near, a.position) - distanceM(near, b.position))
      .slice(0, 5);

  try {
    const official = nearby(await fetchGsiShelters(near));
    if (official.length > 0) return official;
  } catch {
    // 公的データを取れなければ次の手段へ
  }

  if (hasMapsKey()) {
    try {
      const places = nearby(await fetchPlaceShelters(near));
      if (places.length > 0) return places;
    } catch {
      // Places も使えなければデモデータへ
    }
  }

  await wait(200);
  // デモデータはデモ地点の周りにしか無い。離れた地点では 0 件になる。
  return nearby(DEMO_SHELTERS);
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
 * 候補経路を2本返す。
 *
 * 1本目 = 距離と時間を優先した経路、2本目 = 迂回しやすさを優先した経路。
 * **どちらが安全かは断定しない**。画面には距離・時間・イベント数と、
 * 経路データから言える事実（曲がる回数など）だけを出す。
 */
export async function fetchRoutes(home: LatLng, shelter: Shelter): Promise<RouteOption[]> {
  if (hasMapsKey()) {
    // 1. Routes API（新）。2025 年以降に作った Google Cloud プロジェクトは
    //    旧 Directions API を有効にできないので、まずこちらを試す。
    try {
      const routes = await fetchRoutesFromRoutesApi(home, shelter);
      if (routes.length >= 2) return routes;
    } catch {
      // 次の手段へ
    }

    // 2. 旧 Directions API。以前から有効にしているプロジェクト向け。
    try {
      const routes = await fetchRoutesFromDirections(home, shelter);
      if (routes.length >= 2) return routes;
    } catch {
      // どちらも使えなければデモ経路に落ちる
    }
  }
  await wait(300);
  return demoRoutes(home, shelter);
}

/* --- Routes API（新） ------------------------------------------------ */

type RoutesApiRoute = {
  distanceMeters?: number;
  /** "423s" の形 */
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: { steps?: unknown[] }[];
};

/**
 * 経路を1回取る。経由点を渡すと、そこを通る別ルートになる。
 *
 * Routes API は REST なので、ブラウザから直接叩くと `X-Goog-Api-Key` に
 * キーが載り、DevTools からそのまま読めてしまう。
 * `GOOGLE_MAPS_SERVER_KEY` が設定してあれば `/api/routes` を通して、
 * 経路用のキーをブラウザに出さないようにする。
 *
 * 設定が無い環境（キーを1本しか用意していないとき）は、
 * これまでどおりブラウザから直接叩く。動くことを優先する。
 */
async function callRoutesApi(
  origin: LatLng,
  destination: LatLng,
  via?: LatLng,
): Promise<RoutesApiRoute[]> {
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, ...(via ? { via } : {}) }),
  });

  if (res.ok) {
    const json = (await res.json()) as { routes?: RoutesApiRoute[] };
    return json.routes ?? [];
  }
  // 503 = サーバー用のキーが未設定。それ以外は本当に失敗している。
  if (res.status !== 503) throw new Error(`routes-proxy-${res.status}`);

  return callRoutesApiDirect(origin, destination, via);
}

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** ブラウザから直接叩く版。キーはリファラー制限で守る前提。 */
async function callRoutesApiDirect(
  origin: LatLng,
  destination: LatLng,
  via?: LatLng,
): Promise<RoutesApiRoute[]> {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

  const res = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": MAPS_API_KEY,
      // 必要な項目だけを取る（課金は FieldMask の範囲で決まる）
      "X-Goog-FieldMask": [
        "routes.distanceMeters",
        "routes.duration",
        "routes.polyline.encodedPolyline",
        "routes.legs.steps.navigationInstruction",
      ].join(","),
    },
    body: JSON.stringify({
      origin: point(origin),
      destination: point(destination),
      ...(via ? { intermediates: [point(via)] } : {}),
      travelMode: "WALK",
      computeAlternativeRoutes: !via,
      languageCode: "ja",
      regionCode: "JP",
      units: "METRIC",
    }),
  });

  if (!res.ok) throw new Error(`routes-api-${res.status}`);
  const json = (await res.json()) as { routes?: RoutesApiRoute[] };
  return json.routes ?? [];
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

async function fetchRoutesFromRoutesApi(
  home: LatLng,
  shelter: Shelter,
): Promise<RouteOption[]> {
  // polyline の復号に geometry ライブラリを使う
  const maps = await loadMaps();
  const decode = (encoded: string): LatLng[] =>
    maps.geometry.encoding.decodePath(encoded).map((p) => ({ lat: p.lat(), lng: p.lng() }));

  const toOption = (
    r: RoutesApiRoute,
    kind: RouteOption["kind"],
    eventCount: number,
  ): RouteOption => {
    const meters = r.distanceMeters ?? 0;
    const seconds = Number.parseInt(r.duration ?? "", 10) || Math.round(meters / WALK_SPEED);
    const turns = r.legs?.reduce((s, l) => s + (l.steps?.length ?? 0), 0) ?? 0;
    const path = r.polyline?.encodedPolyline ? decode(r.polyline.encodedPolyline) : [];
    return {
      id: `${kind}-${Math.round(meters)}`,
      kind,
      label: kind === "short" ? "最短[さいたん]ルート" : "迂回[うかい]しやすいルート",
      notes: routeNotes(kind, meters, turns, eventCount),
      distanceM: meters,
      durationS: seconds,
      path: path.length > 1 ? path : [home, shelter.position],
      eventCount,
    };
  };

  const found = await callRoutesApi(home, shelter.position);
  if (found.length === 0) return [];

  const sorted = [...found].sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  const shortest = sorted[0];

  // 代替が返っていればいちばん違うものを使う。
  // 徒歩の短い距離では1本しか返らないので、そのときは経由点でもう1本引く。
  let alternative = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  if (!alternative) {
    try {
      const [detour] = await callRoutesApi(
        home,
        shelter.position,
        detourVia(home, shelter.position),
      );
      if (detour && (detour.distanceMeters ?? 0) > (shortest.distanceMeters ?? 0)) {
        alternative = detour;
      }
    } catch {
      // 迂回が引けなければ最短だけ返す（呼び出し側が次の手段に移る）
    }
  }

  const options = [toOption(shortest, "short", 3)];
  if (alternative) options.push(toOption(alternative, "safe", 2));
  return options;
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
