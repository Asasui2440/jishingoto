"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteOption } from "./evac-content";
import { loadMaps } from "./gmaps";
import { validStreetLinks, type StreetSnapshot } from "./street-navigation";
import { prepareStreetRoute, type StreetRoutePlan } from "./street-route-plan";

type Preparation = { key: string; status: "loading" | "ready" | "error"; plan: StreetRoutePlan | null; count: number; error: string | null };

export function useStreetRoutePlan(route: RouteOption | undefined, street: StreetSnapshot | null, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Preparation | null>(null);
  const completed = useRef<Preparation | null>(null);
  const pathKey = JSON.stringify(route?.path ?? []);
  const goal = street?.arrivalNode?.pano;
  const goalLat = street?.arrivalNode?.position.lat;
  const goalLng = street?.arrivalNode?.position.lng;
  const start = street?.pano;
  const key = `${route?.id}:${pathKey}:${goal}:${attempt}`;
  useEffect(() => {
    if (!enabled || !goal || !start || completed.current?.key === key) return;
    const controller = new AbortController();
    const update = (state: Preparation) => { if (!controller.signal.aborted) setState(state); };
    const base: Preparation = { key, status: "loading", plan: null, count: 0, error: null };
    queueMicrotask(() => update(base));
    void loadMaps().then(maps => {
      const service = new maps.StreetViewService();
      return prepareStreetRoute(JSON.parse(pathKey), start, goal, async pano => {
        const { data } = await service.getPanorama({ pano });
        if (!data.location?.pano || !data.location.latLng) throw new Error("no-node");
        return { pano: data.location.pano, position: { lat: data.location.latLng.lat(), lng: data.location.latLng.lng() }, links: validStreetLinks(data.links ?? []) };
      }, { signal: controller.signal, goalPosition: goalLat !== undefined && goalLng !== undefined ? { lat: goalLat, lng: goalLng } : undefined, onProgress: count => update({ ...base, count }) });
    }).then(plan => {
      if (controller.signal.aborted) return;
      const ready: Preparation = { ...base, status: "ready", plan, count: plan.nodes.length };
      completed.current = ready;
      update(ready);
    }).catch(error => update({ ...base, status: "error", error: error instanceof Error ? error.message : "道の接続を確認できませんでした。" }));
    return () => controller.abort();
  }, [enabled, key, goal, goalLat, goalLng, start, pathKey]);
  return { preparation: state?.key === key ? state : null, retry: () => { completed.current = null; setAttempt(n => n + 1); } };
}
