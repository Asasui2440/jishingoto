import type { LatLng } from "./evac-content";

/** 画像やパノラマIDを保存せず、判断した座標からGoogleマップを開く。キー不要。 */
export function streetViewUrl(position: LatLng, heading = 0) {
  const direction = Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0;
  const params = new URLSearchParams({
    api: "1",
    map_action: "pano",
    viewpoint: `${position.lat},${position.lng}`,
    heading: String(direction),
    pitch: "0",
    fov: "90",
  });
  return `https://www.google.com/maps/@?${params}`;
}
