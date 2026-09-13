"use client";

import { hasMapsKey, loadMaps } from "./gmaps";
import type { LatLng } from "./evac-content";

/** SDKのインスタンスを持ち回らず、経路に必要な数値・座標だけを画面へ渡す。 */
export type WalkingRoute = {
  path: LatLng[];
  distanceM: number;
  durationS: number;
  segments: number;
};

function normalizeRoute(route: google.maps.routes.Route): WalkingRoute | null {
  const meters = route.distanceMeters;
  const milliseconds = route.durationMillis;
  const path = route.path;
  if (!path || path.length < 2 || !path.every((p) =>
    Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180
  )) return null;
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0) return null;
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return {
    path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
    distanceM: meters,
    // Routes Libraryはミリ秒。アプリのタイマー・集計は秒。
    durationS: milliseconds / 1000,
    segments: route.legs?.reduce((sum, leg) => sum + (leg.steps?.length ?? 0), 0) ?? 0,
  };
}

/**
 * Maps JSで読み込んだ1つのブラウザキーをRoutes Libraryも共用する。
 * サーバー用キー、RESTへの直接fetch、旧Directions APIは使用しない。
 * @see https://developers.google.com/maps/documentation/javascript/routes/start
 */
export async function requestWalkingRoutes(origin: LatLng, destination: LatLng, via?: LatLng): Promise<WalkingRoute[]> {
  if (!hasMapsKey()) throw new Error("GoogleマップのAPIキーが未設定です。");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("徒歩ルートの取得に時間がかかっています。接続を確認して再試行してください。")), 20000);
    void (async () => {
      const maps = await loadMaps();
      const { Route } = await maps.importLibrary("routes") as google.maps.RoutesLibrary;
      const { routes } = await Route.computeRoutes({
        origin,
        destination,
        ...(via ? { intermediates: [{ location: via }] } : {}),
        travelMode: "WALKING",
        computeAlternativeRoutes: !via,
        fields: ["path", "distanceMeters", "durationMillis", "legs"],
        language: "ja",
        region: "jp",
        polylineQuality: "HIGH_QUALITY",
      });
      return (routes ?? []).map(normalizeRoute).filter((route): route is WalkingRoute => route !== null);
    })().then(resolve, () => reject(new Error("徒歩ルートを取得できませんでした。通信と、Google CloudのRoutes APIの有効化・キーのAPI制限を確認して再試行してください。"))).finally(() => clearTimeout(timeout));
  });
}
