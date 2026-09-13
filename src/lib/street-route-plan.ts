import type { LatLng } from "./evac-content";
import { distanceM } from "./evac-api";
import { streetRouteGuidance } from "./evac-walk";
import type { StreetLink, StreetNode, StreetSnapshot } from "./street-navigation";

export type PlannedStreetNode = StreetNode & { links: StreetLink[] };
export type StreetRoutePlan = { nodes: PlannedStreetNode[]; arrivalAdjusted?: boolean };

/** Bounded graph search within the selected walking route. No coordinate jumps. */
export async function prepareStreetRoute(
  path: LatLng[], start: string, goal: string,
  read: (pano: string) => Promise<PlannedStreetNode>,
  options: { signal?: AbortSignal; maxNodes?: number; goalPosition?: LatLng; onProgress?: (count: number) => void } = {},
): Promise<StreetRoutePlan> {
  const maxNodes = options.maxNodes ?? 400;
  const deadline = Date.now() + 45000;
  const cache = new Map<string, Promise<PlannedStreetNode>>();
  const known = new Map<string, PlannedStreetNode>();
  let readFailure = false;
  let limitReached = false;
  const check = () => {
    if (options.signal?.aborted) throw new Error("cancelled");
    if (Date.now() > deadline) throw new Error("道の接続確認に時間がかかっています。もう一度確認してください。");
  };
  const load = (id: string) => {
    check();
    if (!cache.has(id)) {
      if (cache.size >= maxNodes) { limitReached = true; throw new Error("確認できる地点数を超えました。短いルートを選んでください。"); }
      cache.set(id, new Promise<PlannedStreetNode>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("地点の取得がタイムアウトしました。")), Math.min(8000, Math.max(1, deadline - Date.now())));
        read(id).then(node => {
          if (node.pano !== id || !Number.isFinite(node.position.lat) || !Number.isFinite(node.position.lng)) throw new Error("invalid-node");
          known.set(id, node);
          resolve(node);
        }).catch(reject).finally(() => clearTimeout(timer));
      }));
      options.onProgress?.(cache.size);
    }
    return cache.get(id)!;
  };
  const first = await load(start);
  const open = new Map<string, { node: PlannedStreetNode; cost: number; priority: number }>();
  const costs = new Map<string, number>([[start, 0]]);
  const parents = new Map<string, string>();
  open.set(start, { node: first, cost: 0, priority: 0 });
  while (open.size) {
    check();
    const current = [...open.values()].sort((a, b) => a.priority - b.priority)[0];
    open.delete(current.node.pano);
    if (current.node.pano === goal) {
      const ids = [goal];
      while (ids[0] !== start) ids.unshift(parents.get(ids[0])!);
      return { nodes: await Promise.all(ids.map(id => load(id))) };
    }
    const here = streetRouteGuidance(path, current.node.position);
    if (!here) throw new Error("経路の形状を確認できません。");
    const visitedPositions: LatLng[] = [];
    for (let id: string | undefined = current.node.pano; id; id = parents.get(id)) {
      const position = known.get(id)?.position;
      if (position) visitedPositions.push(position);
    }
    // Look only at actual outgoing links, in small batches.
    const ids = [...new Set(current.node.links.map(link => link.pano))];
    for (let i = 0; i < ids.length; i += 4) {
      const results = await Promise.allSettled(ids.slice(i, i + 4).map(async id => load(id)));
      check();
      for (const result of results) {
        if (result.status !== "fulfilled") { readFailure = true; continue; }
        const node = result.value;
        const match = streetRouteGuidance(path, node.position);
        if (!match) continue;
        const edge = distanceM(current.node.position, node.position);
        if (node.pano !== goal && match.distanceFromRoute > 40) continue;
        // Walking routes trace sidewalks; camera positions can lie on the roadway.
        // A projection can jump ahead at a small bend without skipping a street.
        // Reject shortcuts across substantial route bends, not projection jumps alone.
        if (match.routeM - here.routeM > edge + 15 &&
          path.slice(here.segment + 1, match.segment + 1).some(point =>
            (streetRouteGuidance([current.node.position, node.position], point)?.distanceFromRoute ?? Infinity) > 20 &&
            !visitedPositions.some(position => distanceM(position, point) <= 20))) continue;
        // Parallel sidewalks can make the nearest route projection move backward.
        // Penalize that ambiguity instead of cutting a real graph connection.
        const cost = current.cost + Math.max(1, edge) + match.distanceFromRoute * 2 + Math.max(0, here.routeM - match.routeM);
        if (cost >= (costs.get(node.pano) ?? Infinity)) continue;
        costs.set(node.pano, cost);
        parents.set(node.pano, current.node.pano);
        open.set(node.pano, { node, cost, priority: cost + match.remainingM });
      }
    }
  }
  if (limitReached) throw new Error("確認できる地点数を超えました。短いルートを選んでください。");
  if (readFailure) throw new Error("一部のStreet View地点を取得できませんでした。道を再確認してください。");
  // A facility's nearest panorama may belong to a disconnected courtyard tour.
  // Resolve a road-side goal from the proven connected graph before walking starts.
  // Arrival still requires reaching this exact ID; proximity during walking is not arrival.
  if (options.goalPosition) {
    const endpoint = path.at(-1)!;
    const candidates = [...known.values()].filter(node => {
      if (!costs.has(node.pano) || node.pano === start) return false;
      const match = streetRouteGuidance(path, node.position);
      return match && match.remainingM <= 150 && match.distanceFromRoute <= 20 &&
        distanceM(node.position, endpoint) <= 150 && distanceM(node.position, options.goalPosition!) <= 50;
    }).sort((a, b) => distanceM(a.position, endpoint) - distanceM(b.position, endpoint));
    if (candidates[0]) {
      const ids = [candidates[0].pano];
      while (ids[0] !== start) ids.unshift(parents.get(ids[0])!);
      return { nodes: ids.map(id => known.get(id)!), arrivalAdjusted: true };
    }
  }
  throw new Error("このルートをStreet Viewで最後まで歩ける接続を確認できませんでした。別のルートを選んでください。");
}

export function plannedStreetLink(state: StreetSnapshot | null, plan: StreetRoutePlan | null) {
  if (!state?.ready || state.busy || state.error || !plan) return null;
  const index = plan.nodes.findIndex(node => node.pano === state.pano);
  const next = index < 0 ? null : plan.nodes[index + 1];
  return next ? state.links.find(link => link.pano === next.pano) ?? null : null;
}

export function plannedReturnLink(state: StreetSnapshot | null, plan: StreetRoutePlan | null) {
  if (!state?.ready || state.busy || state.error || !plan) return null;
  const ids = new Set(plan.nodes.map(node => node.pano));
  if (ids.has(state.pano)) return null;
  const trail = state.trail ?? [];
  if (trail.length < 2 || !trail.some(node => ids.has(node.pano))) return null;
  return state.links.find(link => link.pano === trail[trail.length - 2].pano) ?? null;
}
