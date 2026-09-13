import type { LatLng } from "./evac-content";

/** 経路形状から、ほぼ同じ区間を逆向きに15m以上たどる往復を検出する。 */
export function hasRouteBacktracking(path: LatLng[]): boolean {
  if (path.length < 3) return false;
  const origin = path[0];
  const scale = 111320 * Math.cos(origin.lat * Math.PI / 180);
  const points = path.map(p => ({ x: (p.lng - origin.lng) * scale, y: (p.lat - origin.lat) * 111132 }));
  const segments = points.slice(1).map((b, i) => {
    const a = points[i], dx = b.x - a.x, dy = b.y - a.y;
    return { a, b, dx, dy, length: Math.hypot(dx, dy) };
  }).filter(s => s.length > 0.1);
  let retraced = 0;
  for (let i = 1; i < segments.length; i++) {
    const s = segments[i], ux = s.dx / s.length, uy = s.dy / s.length;
    const intervals: [number, number][] = [];
    for (let j = 0; j < i; j++) {
      const prior = segments[j];
      // 逆向きで、方向差が約15度以内の線分だけを照合する。
      if ((s.dx * prior.dx + s.dy * prior.dy) / (s.length * prior.length) > -0.966) continue;
      const ax = prior.a.x - s.a.x, ay = prior.a.y - s.a.y;
      const bx = prior.b.x - s.a.x, by = prior.b.y - s.a.y;
      const start = ax * ux + ay * uy, end = bx * ux + by * uy;
      const lo = Math.max(0, Math.min(start, end)), hi = Math.min(s.length, Math.max(start, end));
      if (hi <= lo) continue;
      const sideA = ax * uy - ay * ux, sideB = bx * uy - by * ux;
      const offset = (t: number) => sideA + (sideB - sideA) * ((t - start) / (end - start));
      // 座標の丸めは許容するが、平行する別の道路まで同一道とみなさない。
      if (Math.abs(offset(lo)) > 2 || Math.abs(offset(hi)) > 2) continue;
      intervals.push([lo, hi]);
    }
    // 同じ区間に複数の過去線分が重なる場合も、距離を二重計上しない。
    intervals.sort((a, b) => a[0] - b[0]);
    let coveredUntil = 0;
    for (const [lo, hi] of intervals) {
      retraced += Math.max(0, hi - Math.max(lo, coveredUntil));
      coveredUntil = Math.max(coveredUntil, hi);
    }
    if (retraced >= 15) return true;
  }
  return false;
}

/** 頂点の分割や丸めだけが違う同じ道を、別候補として数えない。 */
export function similarRoutePaths(a: LatLng[], b: LatLng[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const near = (point: LatLng, path: LatLng[]) => {
    const scale = 111320 * Math.cos(point.lat * Math.PI / 180);
    return path.slice(1).some((end, i) => {
      const start = path[i], x = (start.lng - point.lng) * scale, y = (start.lat - point.lat) * 111132;
      const dx = (end.lng - start.lng) * scale, dy = (end.lat - start.lat) * 111132;
      const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x + t * dx, y + t * dy) <= 8;
    });
  };
  const covered = (path: LatLng[], other: LatLng[]) => path.every((p, i) => near(p, other) &&
    (i === 0 || near({ lat: (path[i - 1].lat + p.lat) / 2, lng: (path[i - 1].lng + p.lng) / 2 }, other)));
  return covered(a, b) && covered(b, a);
}
