"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildWalkSteps, distanceM, fetchDecisionPoints, fetchDetourFrom } from "./evac-api";
import { getEvac, useEvac } from "./evac";
import { nextWalkIndex, nextStreetIndex, rerouteWalk, observeStreetPosition, streetRouteGuidance } from "./evac-walk";
import { reachedStreetArrival, type StreetSnapshot } from "./street-navigation";
import type { EvacChoice } from "./evac-content";

export function useEvacWalk({ readyStepId, paused = false }: { readyStepId?: string | null; paused?: boolean } = {}) {
  const evac = useEvac();
  const { routes, startRouteId, walk, decisions, update } = evac;
  const [walking, setWalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [timerOverride, setTimerOverride] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const scenario = evac.scenario ?? "earthquake";
  const source = evac.mode === "api" && evac.analysisMode !== "sample" ? "context" : "sample";
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
    void fetchDecisionPoints(route, { source, scenario, signal: controller.signal }).then((points) => {
      if (alive) update((prev) => ({ ...prev,
        routes: prev.routes.map((r) => r.id === route.id ? { ...r, eventCount: points.length } : r),
        walk: { source, routeId: route.id, steps: buildWalkSteps(route, points), index: 0 },
      }));
    }).catch((problem: unknown) => {
      if (alive) setError(problem instanceof Error ? problem.message : "解析できませんでした。再試行してください。");
    });
    return () => { alive = false; controller.abort(); };
  }, [route, walk, update, source, scenario, attempt]);

  const step = walk?.steps[walk.index];
  const sceneReady = readyStepId === undefined || readyStepId === step?.id;
  const pending = !walk?.street?.arrived && (evac.mode === "mock" || !!walk?.street) && step?.event && (evac.mode === "mock" || !!walk?.street && (walk.street.questionPointIds?.includes(step.pointId ?? "") || distanceM(walk.street.position, step.position) <= (walk.questionsAligned ? 2 : 20))) && step.pointId && !decisions.some((d) => d.pointId === step.pointId) ? step.event : null;
  const arrived = !!walk && (evac.mode === "api" ? !!walk.street?.arrived : walk.index === walk.steps.length - 1) && !pending;

  const advance = useCallback((jump = false) => {
    if (choosing.current) return;
    setNotice(null);
    setError(null);
    setTimerOverride(null);
    if (getEvac().mode === "api") return;
    update((prev) => prev.walk ? {
      ...prev,
      walk: { ...prev.walk, index: jump ? nextWalkIndex(prev.walk, prev.decisions.map((d) => d.pointId), true) : nextStreetIndex(prev.walk, prev.decisions.map((d) => d.pointId)) },
    } : prev);
  }, [update]);

  useEffect(() => {
    if (evac.mode === "api" || !walking || !walk || pending || notice || arrived || busy || !sceneReady || paused) return;
    const timer = setTimeout(() => advance(), 1600);
    return () => clearTimeout(timer);
  }, [evac.mode, walking, walk, pending, notice, arrived, busy, advance, sceneReady, paused]);

  // Keep auto-walk enabled while a decision is shown; resume after its notice.
  useEffect(() => {
    if (!walking || !notice || pending || busy || paused) return;
    const timer = setTimeout(() => setNotice(null), 1200);
    return () => clearTimeout(timer);
  }, [walking, notice, pending, busy, paused]);

  const observeStreet = useCallback((state: StreetSnapshot, questionPointIds?: string[]) => {
    if (!state.ready || state.busy || !state.position) return;
    const position = state.position;
    const current = getEvac();
    if (reachedStreetArrival(state)) setWalking(false);
    const lastPosition = current.walk?.street?.position;
    if (lastPosition && (lastPosition.lat !== position.lat || lastPosition.lng !== position.lng)) {
      setNotice(null);
      setTimerOverride(null);
    }
    update(prev => {
      if (prev.mode !== "api" || !prev.walk) return prev;
      const last = prev.walk.street?.position;
      if (last?.lat === position.lat && last?.lng === position.lng && prev.walk.street?.arrived === reachedStreetArrival(state) && JSON.stringify(prev.walk.street?.questionPointIds) === JSON.stringify(questionPointIds)) return prev;
      return { ...prev, walk: observeStreetPosition(prev.walk, position, state.heading, prev.decisions.map(d => d.pointId), reachedStreetArrival(state), questionPointIds) };
    });
  }, [update]);

  const choose = async (choice: EvacChoice, timedOut: boolean) => {
    if (choosing.current || !walk || !step?.event || !step.pointId || !pending) return;
    choosing.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = getEvac();
      const from = walk.street?.position ?? step.position;
      const guide = route ? streetRouteGuidance(route.path, from) : null;
      const remainingPath = route && guide ? [from, ...route.path.slice(guide.segment + 1)] : undefined;
      const detour = choice.reroute && current.shelter
        ? await fetchDetourFrom(walk.street?.position ?? step.position, current.shelter, current.mode, scenario, walk.source === "context" ? remainingPath : undefined)
        : null;
      if (choice.reroute && !detour) throw new Error("迂回路を取得できませんでした。もう一度試すか、別の行動を選んでください。");
      const excluded = [...current.decisions.map((d) => d.eventId), step.event.id];
      const remaining = Math.max(0, 3 - current.decisions.length - 1);
      const points = detour && remaining ? await fetchDecisionPoints(detour, { source: walk.source ?? source, scenario, excludedEventIds: excluded, maxPoints: remaining }) : [];
      if (!mounted.current || getEvac().walk !== walk) return;
      const nextWalk = detour ? rerouteWalk(walk, detour, points, [...current.decisions.map((d) => d.eventId), step.event.id]) : walk;
      // 迂回の移動時間は新しい経路に含まれる。追加時間を二重に加算しない。
      const decision = { pointId: step.pointId, position: walk.street?.position ?? step.position, eventId: step.event.id, choiceId: choice.id, rerouted: !!detour, timedOut, extraSeconds: detour ? 0 : choice.extraSeconds };
      update((prev) => ({
        ...prev,
        decisions: [...prev.decisions, decision],
        routes: detour ? [...prev.routes, { ...detour, eventCount: points.length }] : prev.routes,
        takenRouteIds: detour ? [...prev.takenRouteIds, detour.id] : prev.takenRouteIds,
        walk: current.mode === "api" && nextWalk.street
          ? observeStreetPosition(nextWalk, nextWalk.street.position, nextWalk.street.heading, [...current.decisions.map(d => d.pointId), step.pointId!], detour ? false : nextWalk.street.atArrivalNode ?? false, detour ? undefined : nextWalk.street.questionPointIds)
          : nextWalk,
      }));
      setNotice(detour ? "ここから先の経路を更新しました。" : "選んだ行動を記録しました。");
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "経路を取得できませんでした。もう一度お試しください。");
    } finally {
      choosing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { observeStreet, evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, advance, choose, timerOverride, setTimerOverride, retry: () => setAttempt((n) => n + 1) };
}
