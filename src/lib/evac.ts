"use client";

import { useCallback } from "react";
import { DEFAULT_TIMER_SECONDS, type LatLng, type RouteOption, type Shelter } from "./evac-content";
import { createPersistentStore, useStore } from "./store";

/**
 * フェーズ2（ひなん経路シミュレーション）の状態。
 *
 * 保存するのは仕様 9 の範囲だけ:
 *   指定した地点 / 選んだ避難場所 / 経路の座標 / イベント ID と回答
 * ストリートビューの画像やパノラマ ID は保存しない（毎回 緯度経度から取り直す）。
 */

export type EvacDecision = {
  pointId: string;
  eventId: string;
  choiceId: string;
  /** 選択後にルートを切り替えたか */
  rerouted: boolean;
  /** 時間切れで自動的に進んだか */
  timedOut: boolean;
  /** この選択で増えた想定時間（秒） */
  extraSeconds: number;
};

export type EvacSession = {
  home: LatLng | null;
  /** 指定した地点の呼び名（住所・「現在地」など）。画面表示だけに使う */
  homeLabel: string | null;
  shelter: Shelter | null;
  /** 表示した候補経路 */
  routes: RouteOption[];
  /** 最初に選んだ経路 */
  startRouteId: string | null;
  /** 実際に通った経路の並び（迂回するたびに増える） */
  takenRouteIds: string[];
  decisions: EvacDecision[];
  /** 制限時間（秒）。0 なら無効 */
  timerSeconds: number;
  /** 結果画面で選んだ「平常時に確認すること」 */
  followUp: string | null;
  startedAt: number | null;
  finishedAt: number | null;
};

const EMPTY: EvacSession = {
  home: null,
  homeLabel: null,
  shelter: null,
  routes: [],
  startRouteId: null,
  takenRouteIds: [],
  decisions: [],
  timerSeconds: DEFAULT_TIMER_SECONDS,
  followUp: null,
  startedAt: null,
  finishedAt: null,
};

const store = createPersistentStore<EvacSession>("jishingoto.evac.v1", EMPTY, "session");

/** レンダーを介さず、いまの状態をそのまま読む（画面の入口チェックに使う） */
export const getEvac = store.get;

export function useEvac() {
  const [evac, set] = useStore(store);

  const decide = useCallback(
    (d: EvacDecision) =>
      set((prev) => ({
        ...prev,
        decisions: [...prev.decisions.filter((x) => x.pointId !== d.pointId), d],
      })),
    [set],
  );

  /** 迂回で経路が切り替わったときに記録する */
  const pushTakenRoute = useCallback(
    (routeId: string) =>
      set((prev) =>
        prev.takenRouteIds[prev.takenRouteIds.length - 1] === routeId
          ? prev
          : { ...prev, takenRouteIds: [...prev.takenRouteIds, routeId] },
      ),
    [set],
  );

  const reset = useCallback(() => set(() => ({ ...EMPTY, startedAt: Date.now() })), [set]);

  return { ...evac, update: set, decide, pushTakenRoute, reset };
}

/* ------------------------------------------------------------------ */
/* 集計                                                                 */
/* ------------------------------------------------------------------ */

/** 想定の所要時間（秒）。選んだ行動ぶんの遅れを足す。 */
export function totalSeconds(evac: EvacSession) {
  const route = evac.routes.find((r) => r.id === evac.startRouteId);
  const base = route?.durationS ?? 0;
  return base + evac.decisions.reduce((s, d) => s + d.extraSeconds, 0);
}

/** 「危険物から距離を取る／迂回する」を選んだ回数（成功指標の副指標） */
export function avoidanceCount(evac: EvacSession) {
  return evac.decisions.filter((d) => d.choiceId !== "go").length;
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `約${m}分`;
  return `約${Math.floor(m / 60)}時間${m % 60}分`;
}

export function formatDistance(meters: number) {
  return meters >= 1000
    ? `約${(meters / 1000).toFixed(1)}km`
    : `約${Math.round(meters / 10) * 10}m`;
}
