"use client";

import { useCallback } from "react";
import type { BlurRegion } from "./api";
import { QUESTIONS, type Axis, type Question, type Risk } from "./content";
import { createPersistentStore, useStore } from "./store";
import { adultText } from "./adult-copy";
import type { Audience } from "./settings";
import { clearRoomPreparation } from "./room-preparation";
import type { RoomSetting } from "./scenarios";

/** ユーザーが1問に答えた記録 */
export type Answer = {
  questionId: string;
  choiceId: string;
  /** 選んだ行動の安全度 0–1 */
  safety: number;
  axis: Axis;
  /** 時間切れで自動的に次へ進んだか */
  timedOut: boolean;
};

export type Session = {
  roomSetting: RoomSetting;
  /** 撮影した写真（data URL）。個人情報を残さないため永続化しない */
  photoUrl: string | null;
  blurRegions: BlurRegion[];
  risks: Risk[];
  /** この部屋の危険に合わせて選んだ設問 */
  questions: Question[];
  /** 実際の AI 解析か、API 未設定時のデモか */
  analysisSource: "ai" | "demo" | null;
  analysisWarning: string | null;
  answers: Answer[];
  /** チェックリストでチェックを入れた項目 */
  checked: string[];
  startedAt: number | null;
  /** 全問終わった時刻。リザルトを出していいかの判定に使う */
  finishedAt: number | null;
};

const EMPTY: Session = {
  roomSetting: "home",
  photoUrl: null,
  blurRegions: [],
  risks: [],
  questions: [],
  analysisSource: null,
  analysisWarning: null,
  answers: [],
  checked: [],
  startedAt: null,
  finishedAt: null,
};

// 写真は data URL でも永続化しない。端末に部屋の写真を残さないため。
const store = createPersistentStore<Session>("jishingoto.session.v1", EMPTY, "session", [
  "photoUrl",
]);

/** 状態は外部ストアに持つので、Provider は木を素通りさせるだけ */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * レンダーを介さず、いまのセッションをそのまま読む。
 * hydration 直後の描画はまだ空の既定値なので、
 * 「体験をやっていなければ最初に戻す」判定はこちらを使う。
 */
export const getSession = store.get;

export function useSession() {
  const [session, set] = useStore(store);

  /** 1問ぶんの回答を記録する（同じ設問に答え直したら上書き） */
  const answer = useCallback(
    (a: Answer) =>
      set((prev) => ({
        ...prev,
        answers: [...prev.answers.filter((x) => x.questionId !== a.questionId), a],
      })),
    [set],
  );

  const toggleChecked = useCallback(
    (id: string) =>
      set((prev) => ({
        ...prev,
        checked: prev.checked.includes(id)
          ? prev.checked.filter((x) => x !== id)
          : [...prev.checked, id],
      })),
    [set],
  );

  const reset = useCallback(() => {
    clearRoomPreparation();
    set(() => ({ ...EMPTY, startedAt: Date.now() }));
  }, [set]);

  return { ...session, update: set, answer, toggleChecked, reset };
}

/* ------------------------------------------------------------------ */
/* 集計                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 「防災4つのチカラ」を 0–5 で出す。
 *
 * 設問ごとの ◯✕ ではなく、軸ごとにまとめた安全度として見せることで
 * 「どれが正解だったか」を直接つきつけない形にしている。
 */
export function scoreByAxis(answers: Answer[], _risks: Risk[]): Record<Axis, number | null> {
  const axes: Axis[] = ["initial", "judgement", "room", "evacuation"];
  const out = {} as Record<Axis, number | null>;

  for (const axis of axes) {
    const hits = answers.filter((a) => a.axis === axis);
    // 出題されなかった軸は null。点をでっちあげない。
    // 出る設問は部屋で確認した危険によって変わるので、空の軸は普通に起きる。
    out[axis] =
      hits.length > 0
        ? Math.max(1, Math.round((hits.reduce((s, a) => s + a.safety, 0) / hits.length) * 5))
        : null;
  }

  // 認識した家具の数は危険性の確定ではないため、回答の評価を減点しない。

  return out;
}

/** 全体の安全度 0–1 */
export function overallSafety(answers: Answer[]): number {
  if (answers.length === 0) return 0;
  return answers.reduce((s, a) => s + a.safety, 0) / answers.length;
}

/**
 * 「できたこと」。安全度の高かった選択から拾う。
 * 低い選択を名指しで責めないよう、ここでは肯定的なものだけを出す。
 */
export function strengths(answers: Answer[], questions: typeof QUESTIONS = QUESTIONS, audience: Audience = "child"): string[] {
  const out: string[] = [];
  for (const a of answers) {
    if (a.timedOut || a.safety < 0.7) continue;
    const q = questions.find((x) => x.id === a.questionId);
    const c = q?.choices.find((x) => x.id === a.choiceId);
    if (q && c) out.push(audience === "adult"
      ? `${adultText(q.category)}の場面で「${adultText(c.label)}」を選択しました。`
      : `${q.category}のばめんで「${c.label}」をえらべた`);
  }
  return out;
}
