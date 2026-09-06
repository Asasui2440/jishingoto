import { NextResponse } from "next/server";

/**
 * Routes API（徒歩の候補経路）へのサーバー経由の橋渡し。
 *
 * ■ なぜサーバーを挟むか
 *   Maps JS・ストリートビュー・Geocoding・Places は SDK 経由なので、
 *   キーは `NEXT_PUBLIC_...` で配るしかなく、HTTP リファラー制限で守る。
 *   一方 Routes API は REST なので、ブラウザから直接叩くと
 *   `X-Goog-Api-Key` ヘッダにキーが載り、DevTools からそのまま読める。
 *   Referer ヘッダは curl などで詐称できるため、REST の守りとしては弱い。
 *   ここを通せば、経路用のキーはサーバーの中だけに置ける。
 *
 * ■ この入口でできることを絞っている
 *   受け取るのは緯度経度だけ。travelMode も FieldMask もサーバー側で固定して、
 *   ここから別の（高い）API や余計な項目を呼べないようにしている。
 */

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** 課金は FieldMask の範囲で決まる。画面で使う項目だけに絞る。 */
const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.navigationInstruction",
].join(",");

type Pt = { lat: number; lng: number };

function isPoint(v: unknown): v is Pt {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180
  );
}

const toLocation = (p: Pt) => ({
  location: { latLng: { latitude: p.lat, longitude: p.lng } },
});

export async function POST(request: Request) {
  // サーバー専用のキー。
  //
  // ブラウザ用のキー（NEXT_PUBLIC_...）は流用できない。
  // あちらは HTTP リファラー制限をかけてある前提で、
  // サーバーからの呼び出しは Referer を送らないため Google に 403 で弾かれる。
  // こちらは「Routes API だけ」に絞った、リファラー制限なしのキーを用意する。
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    // 未設定なら、呼び出し側がブラウザから直接叩く方に落ちる
    return NextResponse.json({ error: "no-server-key" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  const { origin, destination, via } = (body ?? {}) as Record<string, unknown>;
  if (!isPoint(origin) || !isPoint(destination)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const waypoint = isPoint(via) ? via : null;

  let res: Response;
  try {
    res = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        origin: toLocation(origin),
        destination: toLocation(destination),
        ...(waypoint ? { intermediates: [toLocation(waypoint)] } : {}),
        travelMode: "WALK",
        // 経由点を指定するときは代替ルートを求められない
        computeAlternativeRoutes: !waypoint,
        languageCode: "ja",
        regionCode: "JP",
        units: "METRIC",
      }),
    });
  } catch {
    return NextResponse.json({ error: "upstream-unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    // Google 側のメッセージはそのまま返さない（キーの情報が混ざりうるため）。
    // 呼び出し側は失敗したことだけ分かればよい。
    return NextResponse.json({ error: "upstream-error" }, { status: 502 });
  }

  const json = (await res.json()) as { routes?: unknown[] };
  return NextResponse.json({ routes: json.routes ?? [] });
}
