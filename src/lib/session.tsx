"use client";

import { useCallback } from "react";
import type { BlurRegion } from "./api";
import { QUESTIONS, type Axis, type Risk } from "./content";
import { createPersistentStore, useStore } from "./store";

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
  /** 撮影した写真（object URL）。リロードすると失われるので任意扱い */
  photoUrl: string | null;
  blurRegions: BlurRegion[];
  risks: Risk[];
  answers: Answer[];
  /** チェックリストでチェックを入れた項目 */
  checked: string[];
  startedAt: number | null;
  /** 全問終わった時刻。リザルトを出していいかの判定に使う */
  finishedAt: number | null;
};

const EMPTY: Session = {
  photoUrl: null,
  blurRegions: [],
  risks: [],
  answers: [],
  checked: [],
  startedAt: null,
  finishedAt: null,
};

// photoUrl は blob: URL なので、保存しても次のセッションでは使えない
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

  const reset = useCallback(() => set(() => ({ ...EMPTY, startedAt: Date.now() })), [set]);

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
export function scoreByAxis(answers: Answer[], risks: Risk[]): Record<Axis, number | null> {
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

  // 「部屋のそなえ」は設問だけでなく、部屋の中で見つかった危険の数も反映する
  if (risks.length > 0 && out.room !== null) {
    const confirmed = risks.filter((r) => r.confirmed).length;
    out.room = Math.max(1, out.room - Math.min(2, Math.floor(confirmed / 2)));
  }

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
export function strengths(answers: Answer[]): string[] {
  const out: string[] = [];
  for (const a of answers) {
    if (a.safety < 0.7) continue;
    const q = QUESTIONS.find((x) => x.id === a.questionId);
    const c = q?.choices.find((x) => x.id === a.choiceId);
    if (q && c) out.push(`${q.category}のばめんで「${c.label}」をえらべた`);
  }
  return out;
}
