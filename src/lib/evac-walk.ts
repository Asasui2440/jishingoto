import { buildWalkSteps, pathLengthM, distanceM, type DecisionPoint, type WalkStep } from "./evac-api";
import type { RouteOption } from "./evac-content";

export type WalkProgress = { source?: "geo-ai" | "sample"; routeId: string; steps: WalkStep[]; index: number };

/** 早送りでも未回答の判断地点を越えない。 */
export function nextWalkIndex(walk: WalkProgress, answeredIds: string[], jump = false) {
  const here = walk.steps[walk.index];
  if (here?.pointId && !answeredIds.includes(here.pointId)) return walk.index;
  if (!jump) return Math.min(walk.index + 1, walk.steps.length - 1);
  const next = walk.steps.findIndex((step, i) => i > walk.index && step.pointId && !answeredIds.includes(step.pointId));
  return next < 0 ? walk.steps.length - 1 : next;
}

/** いまいる地点までの履歴を残し、未体験のシナリオだけを迂回路に配置する。 */
export function rerouteWalk(walk: WalkProgress, route: RouteOption, points: DecisionPoint[], answeredEvents: string[]): WalkProgress {
  const next = buildWalkSteps(route, points.filter((p) => !answeredEvents.includes(p.event.id)));
  const history = walk.steps.slice(0, walk.index + 1);
  history[walk.index] = { ...history[walk.index], remainingM: next[0].remainingM, remainingS: next[0].remainingS, heading: next[0].heading };
  return {
    ...(walk.source ? { source: walk.source } : {}),
    routeId: route.id,
    steps: [...history, ...next.slice(1)],
    index: walk.index,
  };
}

export function walkedPath(walk: WalkProgress | null) {
  return walk?.steps.slice(0, walk.index + 1).map((step) => step.position) ?? [];
}

export function walkDistance(walk: WalkProgress | null) {
  return pathLengthM(walkedPath(walk));
}

/** Keep every route vertex in the record, but advance the panorama about one Main-style stride. */
export function nextStreetIndex(walk: WalkProgress, answeredIds: string[]) {
  if (nextWalkIndex(walk, answeredIds) === walk.index) return walk.index;
  let distance = 0;
  for (let i = walk.index + 1; i < walk.steps.length; i++) {
    distance += distanceM(walk.steps[i - 1].position, walk.steps[i].position);
    const pointId = walk.steps[i].pointId;
    if (pointId && !answeredIds.includes(pointId)) return i;
    const following = walk.steps[i + 1];
    if (following && distance > 5) {
      const before = walk.steps[i - 1].position;
      const here = walk.steps[i].position;
      const after = following.position;
      const bearing = (a: typeof here, b: typeof here) => Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI;
      const turn = Math.abs(((bearing(here, after) - bearing(before, here) + 540) % 360) - 180);
      if (turn >= 25) return i;
    }
    if (distance >= 65) return i;
  }
  return walk.steps.length - 1;
}
