"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildWalkSteps, fetchDecisionPoints, fetchDetourFrom } from "./evac-api";
import { getEvac, useEvac } from "./evac";
import { nextWalkIndex, rerouteWalk } from "./evac-walk";
import type { EvacChoice } from "./evac-content";

export function useEvacWalk() {
  const evac = useEvac();
  const { routes, startRouteId, walk, decisions, update } = evac;
  const [walking, setWalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [timerOverride, setTimerOverride] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const source = evac.mode === "api" ? evac.analysisMode ?? "geo-ai" : "sample";
  const choosing = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const route = routes.find((r) => r.id === (walk?.routeId ?? startRouteId));
  useEffect(() => {
    if (!route || walk) return;
    let alive = true;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    void fetchDecisionPoints(route, { source, signal: controller.signal }).then((points) => {
      if (alive) update((prev) => ({ ...prev,
        routes: prev.routes.map((r) => r.id === route.id ? { ...r, eventCount: points.length } : r),
        walk: { source, routeId: route.id, steps: buildWalkSteps(route, points), index: 0 },
      }));
    }).catch((problem: unknown) => {
      if (alive) setError(problem instanceof Error ? problem.message : "解析できませんでした。再試行してください。");
    });
    return () => { alive = false; controller.abort(); };
  }, [route, walk, update, source, attempt]);

  const step = walk?.steps[walk.index];
  const pending = step?.event && step.pointId && !decisions.some((d) => d.pointId === step.pointId) ? step.event : null;
  const arrived = !!walk && walk.index === walk.steps.length - 1 && !pending;

  const advance = useCallback((jump = false) => {
    if (choosing.current) return;
    setNotice(null);
    setError(null);
    setTimerOverride(null);
    update((prev) => prev.walk ? {
      ...prev,
      walk: { ...prev.walk, index: nextWalkIndex(prev.walk, prev.decisions.map((d) => d.pointId), jump) },
    } : prev);
  }, [update]);

  useEffect(() => {
    if (!walking || !walk || pending || notice || arrived || busy) return;
    const timer = setTimeout(() => advance(), 44);
    return () => clearTimeout(timer);
  }, [walking, walk, pending, notice, arrived, busy, advance]);

  const choose = async (choice: EvacChoice, timedOut: boolean) => {
    if (choosing.current || !walk || !step?.event || !step.pointId || !pending) return;
    choosing.current = true;
    setBusy(true);
    setError(null);
    setWalking(false);
    try {
      const current = getEvac();
      const detour = choice.reroute && current.shelter
        ? await fetchDetourFrom(step.position, current.shelter, current.mode)
        : null;
      if (choice.reroute && !detour) throw new Error("迂回路を取得できませんでした。もう一度試すか、別の行動を選んでください。");
      const excluded = [...current.decisions.map((d) => d.eventId), step.event.id];
      const remaining = Math.max(0, 3 - current.decisions.length - 1);
      const points = detour && remaining ? await fetchDecisionPoints(detour, { source: walk.source ?? source, excludedEventIds: excluded, maxPoints: remaining }) : [];
      if (!mounted.current || getEvac().walk !== walk) return;
      const nextWalk = detour ? rerouteWalk(walk, detour, points, [...current.decisions.map((d) => d.eventId), step.event.id]) : walk;
      // 迂回の移動時間は新しい経路に含まれる。追加時間を二重に加算しない。
      const decision = { pointId: step.pointId, position: step.position, eventId: step.event.id, choiceId: choice.id, rerouted: !!detour, timedOut, extraSeconds: detour ? 0 : choice.extraSeconds };
      update((prev) => ({
        ...prev,
        decisions: [...prev.decisions, decision],
        routes: detour ? [...prev.routes, { ...detour, eventCount: points.length }] : prev.routes,
        takenRouteIds: detour ? [...prev.takenRouteIds, detour.id] : prev.takenRouteIds,
        walk: nextWalk,
      }));
      setNotice(detour ? "ここから先の経路を更新しました。" : "選んだ行動を記録しました。");
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "経路を取得できませんでした。もう一度お試しください。");
    } finally {
      choosing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, advance, choose, timerOverride, setTimerOverride, retry: () => setAttempt((n) => n + 1) };
}
