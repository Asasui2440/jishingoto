"use client";

/**
 * Google Maps JavaScript API のローダー。
 *
 * キーは `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`（`.env.local`）で渡す。
 * キーがない環境では地図もストリートビューも読み込まず、
 * 画面側が「デモ表示（自作イラスト）」に落ちる。
 * ハッカソン会場の回線やキーの制限で API が使えなくても、
 * 同じ UI で一通り体験できるようにするため。
 *
 * @see https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */

export const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** キーが設定されているか。false ならデモ表示に切り替える。 */
export function hasMapsKey() {
  return MAPS_API_KEY.trim().length > 0;
}

let loading: Promise<typeof google.maps> | null = null;

/**
 * Maps JS を1度だけ読み込む。
 * 失敗（キーが無効・オフラインなど）したら reject するので、
 * 呼び出し側は catch してデモ表示に切り替える。
 */
export function loadMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  if (!hasMapsKey()) return Promise.reject(new Error("no-api-key"));
  if (loading) return loading;

  loading = new Promise<typeof google.maps>((resolve, reject) => {
    if (window.google?.maps?.StreetViewPanorama) {
      resolve(window.google.maps);
      return;
    }
    const params = new URLSearchParams({
      key: MAPS_API_KEY,
      v: "weekly",
      libraries: "geometry",
      language: "ja",
      region: "JP",
      loading: "async",
      callback: "__jishingotoMapsReady",
    });

    // callback 方式。async 読み込みでも初期化完了を確実に拾える。
    (window as unknown as Record<string, unknown>).__jishingotoMapsReady = () => {
      resolve(window.google.maps);
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error("maps-load-failed"));
    document.head.appendChild(script);
  });

  // 失敗したら次回は読み込み直せるようにする
  loading.catch(() => {
    loading = null;
  });

  return loading;
}
