import type { LatLng } from "./evac-content";
import { distanceM } from "./evac-api";
import { streetRouteGuidance } from "./evac-walk";
import { loadMaps } from "./gmaps";
import { angleDifference, validStreetLinks, type StreetLink, type StreetNode } from "./street-navigation";

type Node = StreetNode & { links: StreetLink[] };
export type RouteBranch = { via: [LatLng, LatLng]; headingDifference: number };
const heading = (a: LatLng, b: LatLng) => Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI;

/** 曲がり角を先に、長い直線の途中も調べる。座標は検索用で、経由点には使わない。 */
function probes(paths: LatLng[][]) {
  const turns: LatLng[] = [], samples: LatLng[] = [];
  for (const path of paths) {
    for (let i = 1; i < path.length - 1; i++) {
      let before = i - 1, after = i + 1;
      while (before > 0 && distanceM(path[before], path[i]) < 20) before--;
      while (after < path.length - 1 && distanceM(path[after], path[i]) < 20) after++;
      if (Math.abs(angleDifference(heading(path[i], path[after]), heading(path[before], path[i]))) >= 35) turns.push(path[i]);
    }
    const total = path.slice(1).reduce((sum, p, i) => sum + distanceM(path[i], p), 0);
    for (let target = 0; target < total; target += Math.max(80, total / 6)) {
      let walked = 0;
      for (let i = 1; i < path.length; i++) {
        const length = distanceM(path[i - 1], path[i]);
        if (walked + length >= target && length > 0) {
          const t = (target - walked) / length;
          samples.push({ lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t, lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t });
          break;
        }
        walked += length;
      }
    }
  }
  const result: LatLng[] = [];
  for (const point of [...turns, ...samples]) {
    if (result.every(prior => distanceM(prior, point) > 35)) result.push(point);
    if (result.length === 12) break;
  }
  return result;
}

/** 実在する分岐の未使用リンクを少し先までたどり、交差点→別の道の経由点を返す。 */
export async function findRouteBranches(paths: LatLng[][]): Promise<RouteBranch[]> {
  const maps = await loadMaps();
  const service = new maps.StreetViewService();
  const deadline = Date.now() + 15000;
  let requests = 0;
  const cache = new Map<string, Promise<Node>>();
  const read = (request: google.maps.StreetViewLocationRequest | google.maps.StreetViewPanoRequest): Promise<Node> => {
    const key = JSON.stringify(request);
    if (cache.has(key)) return cache.get(key)!;
    if (requests++ >= 80 || Date.now() >= deadline) return Promise.reject(new Error("branch-search-limit"));
    const promise = new Promise<Node>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("branch-timeout")), Math.min(3000, deadline - Date.now()));
      service.getPanorama(request).then(({ data }) => {
        if (!data.location?.pano || !data.location.latLng) throw new Error("no-branch-node");
        const position = { lat: data.location.latLng.lat(), lng: data.location.latLng.lng() };
        if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) throw new Error("invalid-branch-node");
        resolve({ pano: data.location.pano, position, links: validStreetLinks(data.links ?? []) });
      }).catch(reject).finally(() => clearTimeout(timer));
    });
    cache.set(key, promise);
    return promise;
  };
  const distanceFromPaths = (position: LatLng) => Math.min(...paths.map(path => streetRouteGuidance(path, position)?.distanceFromRoute ?? Infinity));
  const branches: RouteBranch[] = [];
  const seen = new Set<string>();
  const inspect = async (junction: Node) => {
    if (seen.has(junction.pano) || distanceFromPaths(junction.position) > 35) return;
    seen.add(junction.pano);
    const guides = paths.map(path => ({ path, guide: streetRouteGuidance(path, junction.position) }))
      .filter(item => item.guide && item.guide.distanceFromRoute <= 35);
    const primary = guides[0];
    if (!primary?.guide) return;
    let before = primary.guide.segment;
    while (before > 0 && distanceM(primary.path[before], junction.position) < 20) before--;
    const incoming = distanceM(primary.path[before], junction.position) > 5
      ? heading(primary.path[before], junction.position) : primary.guide.heading;
    await Promise.allSettled(junction.links.map(async first => {
      const difference = Math.abs(angleDifference(first.heading, incoming));
      if (difference > 135) return;
      // 選択済みの道と、来た道は別候補として数えない。
      if (guides.some(({ guide }) => Math.abs(angleDifference(first.heading, guide!.heading)) < 30)) return;
      let link: StreetLink | undefined = first;
      const visited = new Set([junction.pano]);
      for (let hop = 0; link && hop < 5; hop++) {
        if (visited.has(link.pano)) break;
        const node = await read({ pano: link.pano });
        visited.add(node.pano);
        if (distanceM(junction.position, node.position) >= 30 && distanceFromPaths(node.position) > 18) {
          if (!branches.some(branch => distanceM(branch.via[1], node.position) < 25)) branches.push({ via: [junction.position, node.position], headingDifference: difference });
          break;
        }
        const direction: number = link.heading;
        link = node.links.filter(next => !visited.has(next.pano) && Math.abs(angleDifference(next.heading, direction)) < 45)
          .sort((a, b) => Math.abs(angleDifference(a.heading, direction)) - Math.abs(angleDifference(b.heading, direction)))[0];
      }
    }));
  };
  const points = probes(paths);
  for (let i = 0; i < points.length && branches.length < 6; i += 3) {
    await Promise.allSettled(points.slice(i, i + 3).map(async location => {
      const node = await read({ location, radius: 35, preference: maps.StreetViewPreference.NEAREST, sources: [maps.StreetViewSource.OUTDOOR, maps.StreetViewSource.GOOGLE] });
      if (distanceM(location, node.position) > 35) return;
      await inspect(node);
      // 最寄りパノラマが交差点の手前でも、隣接ノードの分岐を確認する。
      await Promise.allSettled(node.links.map(async link => {
        const next = await read({ pano: link.pano });
        if (distanceM(location, next.position) <= 40) await inspect(next);
      }));
    }));
  }
  return branches.sort((a, b) => a.headingDifference - b.headingDifference).slice(0, 6);
}

/** SDKが経由点を別道路へ補正していないか、交差点→枝の順に通るかも確認する。 */
export function followsRouteBranch(path: LatLng[], branch: RouteBranch) {
  const from = streetRouteGuidance(path, branch.via[0]), to = streetRouteGuidance(path, branch.via[1]);
  return !!from && !!to && from.distanceFromRoute <= 20 && to.distanceFromRoute <= 12 && to.routeM - from.routeM >= 20
    && to.routeM - from.routeM <= distanceM(branch.via[0], branch.via[1]) * 2 + 30;
}
