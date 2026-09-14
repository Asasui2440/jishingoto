import { buildWalkSteps, pathLengthM, distanceM, type DecisionPoint, type WalkStep } from "./evac-api";
import { WALK_SCENARIOS } from "./walk-scenarios";
import type { RouteOption, LatLng } from "./evac-content";

export type WalkProgress = { questionSpacingVersion?: 2 | 3 | 4; questionsAligned?: boolean; source?: "geo-ai" | "context" | "sample"; routeId: string; steps: WalkStep[]; index: number; street?: StreetProgress };

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
  history[walk.index] = { ...history[walk.index], ...(walk.street ? { position: walk.street.position } : {}), remainingM: next[0].remainingM, remainingS: next[0].remainingS, heading: next[0].heading };
  return {
    ...(walk.source ? { source: walk.source } : {}),
    routeId: route.id,
    steps: [...history, ...next.slice(1)],
    index: walk.index,
    ...(walk.street ? { street: { ...walk.street, routeM: 0, remainingM: next[0].remainingM, remainingS: next[0].remainingS, arrived: false } } : {}),
  };
}

export function walkedPath(walk: WalkProgress | null) {
  if (walk?.street) return walk.street.path;
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


/** Actual Street View positions only. Panorama IDs intentionally stay out of storage. */
export type StreetProgress = {
  position: LatLng;
  heading: number;
  path: LatLng[];
  routeM: number;
  elapsedS: number;
  remainingM: number;
  remainingS: number;
  arrived: boolean;
  atArrivalNode?: boolean;
  questionPointIds?: string[];
};
const MATCH_M = 20;
/** Project onto the selected route and look along its geometry. Guidance only. */
export function streetRouteGuidance(path: LatLng[], position: LatLng) {
  if (path.length < 2) return null;
  const lengths = path.slice(1).map((point, i) => distanceM(path[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let best = Infinity, along = 0, segment = 0, offset = 0, traversed = 0;
  let projection = path[0];
  for (let i = 0; i < lengths.length; i++) {
    const a = path[i], b = path[i + 1];
    const scale = Math.cos(position.lat * Math.PI / 180);
    const dx = (b.lng - a.lng) * scale, dy = b.lat - a.lat;
    const t = Math.max(0, Math.min(1, ((position.lng - a.lng) * scale * dx + (position.lat - a.lat) * dy) / (dx * dx + dy * dy || 1)));
    const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const away = distanceM(position, point);
    if (away < best) { best = away; along = traversed + lengths[i] * t; segment = i; offset = lengths[i] * t; projection = point; }
    traversed += lengths[i];
  }
  let ahead = offset + 12;
  let targetSegment = segment;
  while (targetSegment < lengths.length - 1 && ahead >= lengths[targetSegment]) ahead -= lengths[targetSegment++];
  const a = path[targetSegment], b = path[targetSegment + 1];
  const t = Math.min(1, ahead / (lengths[targetSegment] || 1));
  const target = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  const heading = Math.atan2((target.lng - projection.lng) * Math.cos(projection.lat * Math.PI / 180), target.lat - projection.lat) * 180 / Math.PI;
  return { heading, distanceFromRoute: best, routeM: along, remainingM: Math.max(0, total - along), segment, total };
}

/** Actual position drives progress; missed questions cannot prevent arrival. */
export function observeStreetPosition(walk: WalkProgress, position: LatLng, heading: number, answered: string[], arrivalConfirmed = false, questionPointIds?: string[]): WalkProgress {
  const prior = walk.street;
  const moved = prior ? distanceM(prior.position, position) : 0;
  const path = prior ? (moved > 0.1 ? [...prior.path, position] : prior.path) : [position];
  const start = walk.steps.findIndex(step => step.id.startsWith(`${walk.routeId}:`));
  const routeStart = Math.max(0, start - (start > 0 ? 1 : 0));
  const guide = streetRouteGuidance(walk.steps.slice(routeStart).map(step => step.position), position);
  let matchedIndex = guide && guide.distanceFromRoute <= MATCH_M ? routeStart + guide.segment : walk.index;
  const nearby = walk.steps.map((step, i) => ({ step, i, distance: questionPointIds?.includes(step.pointId ?? "") ? 0 : walk.questionsAligned && questionPointIds !== undefined ? Infinity : distanceM(position, step.position) }))
    .filter(({ step, i, distance }) => i >= routeStart && step.pointId && !answered.includes(step.pointId) && distance <= (walk.questionsAligned ? 2 : MATCH_M))
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearby) matchedIndex = nearby.i;
  const arrived = arrivalConfirmed && !((walk.questionSpacingVersion === 3 || walk.questionSpacingVersion === 4) && nearby);
  if (arrived) matchedIndex = walk.steps.length - 1;
  const end = walk.steps[walk.steps.length - 1];
  const remainingM = arrived ? 0 : Math.max(distanceM(position, end.position), guide?.remainingM ?? 0);
  const duration = walk.steps.slice(routeStart + 1).reduce((sum, step) => sum + step.travelSeconds, 0);
  const total = guide?.total ?? 0;
  return { ...walk, index: matchedIndex, street: { position, heading, path, routeM: guide?.routeM ?? prior?.routeM ?? 0,
    remainingM, elapsedS: (prior?.elapsedS ?? 0) + (total > 0 ? moved / total * duration : 0), remainingS: total > 0 ? remainingM / total * duration : 0, questionPointIds, atArrivalNode:arrivalConfirmed, arrived } };
}

export const QUESTION_INTERVAL_NODES = 8;

/** Every eight confirmed hops; short routes distribute enough questions for three in the whole trip. */
export function alignWalkQuestions(walk: WalkProgress, route: RouteOption, nodes: {position: LatLng}[], answeredEvents: string[], random: () => number = Math.random) {
  if (walk.source !== "context" || walk.questionSpacingVersion === 4 || nodes.length === 0) return walk;
  const path = nodes.map(n => n.position);
  const total = pathLengthM(path), hops = nodes.length - 1;
  const regularCount = Math.floor(hops / QUESTION_INTERVAL_NODES);
  const count = Math.max(regularCount, 3 - answeredEvents.length);
  const candidates = walk.steps.filter(step => step.event && step.pointId && !answeredEvents.includes(step.event.id));
  const common = WALK_SCENARIOS.filter(c => c.area === "common").map(c => c.event);
  const used = new Set(answeredEvents);
  let traversed = 0;
  const positions = nodes.map((node,i) => {
    if (i) traversed += distanceM(nodes[i-1].position,node.position);
    return {...node,t: total ? traversed / total : 0, index:i};
  });
  const points: DecisionPoint[] = [];
  for (let i = 0; i < count; i++) {
    const nodeIndex = count > regularCount ? Math.ceil((i + 1) * hops / count) : (i + 1) * QUESTION_INTERVAL_NODES;
    const node = positions[nodeIndex];
    const nearby = candidates.filter(step => !used.has(step.event!.id) && distanceM(step.position,node.position) <= 100)
      .sort((a,b) => distanceM(a.position,node.position)-distanceM(b.position,node.position))[0];
    let event = nearby?.event;
    if (!event) {
      const fresh = common.filter(event => !used.has(event.id));
      // Long routes may exhaust the catalogue: repeat only after every common case was used.
      if (!fresh.length) common.forEach(event => used.delete(event.id));
      const pool = fresh.length ? fresh : common;
      event = pool[Math.floor(random() * pool.length)];
    }
    used.add(event!.id);
    points.push({id:`${route.id}:node-question:${i}:${event!.id}`,t:node.t,position:node.position,heading:nearby?.heading ?? 0,event:event!,remainingM:Math.round(total*(1-node.t)),remainingS:Math.round(route.durationS*(1-node.t))});
  }
  // Drop old unvisited questions; keep only answers and the actual travelled history.
  const history = walk.steps.slice(0,walk.index+1).filter(step => !step.event || answeredEvents.includes(step.event.id));
  const next = buildWalkSteps({...route,path},points);
  if (!history.length) history.push(next[0]);
  const aligned: WalkProgress = {...walk,steps:[...history,...next.slice(1)],index:history.length-1,questionsAligned:true,questionSpacingVersion:4};
  return aligned.street ? observeStreetPosition(aligned,aligned.street.position,aligned.street.heading,
    history.flatMap(step => step.pointId ? [step.pointId] : []),aligned.street.arrived) : aligned;
}

/** Bind questions to a confirmed panorama's planned position, independent of SDK coordinate drift. */
export function questionIdsAtNode(walk: Pick<WalkProgress, "steps"> | null, position: LatLng) {
  return walk?.steps.flatMap(step => step.pointId && distanceM(step.position,position) < .1 ? [step.pointId] : []) ?? [];
}
