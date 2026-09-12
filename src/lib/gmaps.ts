"use client";

/** Maps JavaScript API。API版からだけ呼び、認証失敗・タイムアウトをUIに通知する。 */
export const MAPS_API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
export function hasMapsKey() { return MAPS_API_KEY.length > 0; }

let loading: Promise<typeof google.maps> | null = null;
let authFailed = false;
let callbackId = 0;
const authListeners = new Set<() => void>();
export function onMapsAuthError(listener: () => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

export function loadMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined" || !hasMapsKey()) return Promise.reject(new Error("no-api-key"));
  if (authFailed) return Promise.reject(new Error("maps-auth-failed"));
  if (loading) return loading;
  loading = new Promise<typeof google.maps>((resolve, reject) => {
    const globals = window as unknown as Record<string, unknown>;
    let settled = false;
    const script = document.createElement("script");
    const callback = `__jishingotoMapsReady${++callbackId}`;
    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.remove();
      // 遅れて到着したSDKが存在しないcallbackを呼ばないようにする。
      globals[callback] = () => {};
      reject(new Error(reason));
    };
    globals.gm_authFailure = () => {
      authFailed = true;
      fail("maps-auth-failed");
      authListeners.forEach((listener) => listener());
    };
    if (window.google?.maps?.Map) { settled = true; resolve(window.google.maps); return; }
    globals[callback] = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      delete globals[callback];
      if (window.google?.maps?.Map) resolve(window.google.maps);
      else reject(new Error("maps-not-ready"));
    };
    const params = new URLSearchParams({ key: MAPS_API_KEY, v: "weekly", language: "ja", region: "JP", loading: "async", callback });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => fail("maps-load-failed");
    const timeout = setTimeout(() => fail("maps-load-timeout"), 12000);
    document.head.appendChild(script);
  });
  void loading.catch(() => { loading = null; });
  return loading;
}
