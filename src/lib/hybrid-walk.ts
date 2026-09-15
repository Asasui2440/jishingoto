import { buildWalkSteps, pathLengthM, type DecisionPoint } from "./evac-api";
import type { RouteOption } from "./evac-content";
import { nextWalkIndex, streetRouteGuidance, type WalkProgress } from "./evac-walk";

/** Route coordinates drive this simulation. Nearby imagery never changes its position. */
export function prepareHybridWalk(walk: WalkProgress, route: RouteOption, answered: string[]): WalkProgress {
  const hasMoved = (walk.street?.path.length ?? 0) > 1;
  const current = hasMoved ? walk.street!.position : route.path[0];
  const guide = streetRouteGuidance(route.path, current);
  if (!guide || guide.distanceFromRoute > 20) throw new Error("選んだルートに戻ってから、地図での歩行に切り替えてください。");
  const path = hasMoved ? [current, guide.projection, ...route.path.slice(guide.segment + 1)] : route.path;
  const total = pathLengthM(path);
  const points: DecisionPoint[] = walk.steps.flatMap(step => {
    if (!step.event || !step.pointId || answered.includes(step.pointId)) return [];
    const original = streetRouteGuidance(route.path, step.position);
    if (hasMoved && original && original.routeM + 1 < guide.routeM) return [];
    const match = streetRouteGuidance(path, step.position);
    if (!match) return [];
    const t = total ? match.routeM / total : 0;
    return [{ id: step.pointId, event: step.event, position: match.projection, heading: match.heading, t,
      remainingM: total * (1 - t), remainingS: route.durationS * (1 - t) }];
  });
  const steps = buildWalkSteps({ ...route, path, durationS: route.durationS * (guide.total ? total / guide.total : 0) }, points, 10);
  const history = walk.steps.filter(step => step.pointId && answered.includes(step.pointId));
  const next: WalkProgress = { ...walk, navigationMode: "hybrid", questionsAligned: false,
    questionSpacingVersion: undefined, steps: [...history, ...steps], index: history.length,
    street: hasMoved ? walk.street : undefined };
  return recordHybridStep(next, next.index, answered);
}

export function recordHybridStep(walk: WalkProgress, index: number, answered: string[]): WalkProgress {
  const step = walk.steps[index];
  const prior = walk.street;
  const moved = !prior || prior.position.lat !== step.position.lat || prior.position.lng !== step.position.lng;
  const arrived = index === walk.steps.length - 1 && (!step.pointId || answered.includes(step.pointId));
  return { ...walk, index, street: { position: step.position, heading: step.heading,
    path: prior ? moved ? [...prior.path, step.position] : prior.path : [step.position],
    routeM: pathLengthM(walk.steps.slice(0, index + 1).map(s => s.position)),
    elapsedS: (prior?.elapsedS ?? 0) + (index > walk.index ? step.travelSeconds : 0),
    remainingM: step.remainingM, remainingS: step.remainingS, arrived } };
}

export function advanceHybridWalk(walk: WalkProgress, answered: string[]) {
  return recordHybridStep(walk, nextWalkIndex(walk, answered), answered);
}
