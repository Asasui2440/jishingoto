import { buildWalkSteps, pathLengthM, type DecisionPoint, type WalkStep } from "./evac-api";
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
