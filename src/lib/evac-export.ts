import type { EvacSession } from "./evac";
import { walkedPath } from "./evac-walk";
import { scoreDecisions } from "./evac-review";

/** Export the recorded trail, including detours; map imagery is never included. */
export function exportEvacRoute(session: EvacSession) {
  const trail = session.walk ? walkedPath(session.walk) : [];
  const route = session.routes.find(item => item.id === session.startRouteId);
  const path = trail.length ? trail : route?.path ?? [];
  if (!path.length || path.some(point => !Number.isFinite(point.lat) || !Number.isFinite(point.lng))) throw new Error("保存できるルートの記録がありません。");
  const coordinates = path.map(point => [point.lng, point.lat]);
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        name: `${session.homeLabel ?? "出発地点"} → ${session.shelter?.name ?? "避難先"}`,
        source: "ジシンゴト", mode: session.mode, scenario: session.scenario,
        routeType: trail.length ? "体験で通った道" : "選択した経路",
        finishedAt: session.finishedAt, score: scoreDecisions(session).score,
        followUp: session.followUp,
        note: "練習の記録です。実際の経路の安全性を示すものではありません。",
      },
      geometry: coordinates.length > 1 ? { type: "LineString", coordinates } : { type: "Point", coordinates: coordinates[0] },
    }],
  };
}
