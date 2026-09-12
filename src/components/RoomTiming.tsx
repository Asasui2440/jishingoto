"use client";

import { useEffect, useState } from "react";
import { roomTimings } from "@/lib/room-test";

export function RoomTiming() {
  const [now, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(performance.now()), 500); return () => clearInterval(timer); }, []);
  const timings = roomTimings();
  return <details className="my-3 rounded-field border border-border bg-surface p-3 text-11">
    <summary className="cursor-pointer font-bold">処理時間・テスト情報{timings.mode === "fixture" ? "（APIなし）" : ""}</summary>
    <p className="mt-2">{timings.mode === "fixture" ? "APIなし／模擬待ち時間（実際のAPI速度ではありません）" : "実測／通信を含むリクエスト開始からの時間"}</p>
    <p>解析：{timings.analysis ? `${Math.max(0, (timings.analysis.end ?? now) - timings.analysis.start).toFixed(0)} ms ・${timings.analysis.end === undefined ? "処理中" : timings.analysis.ok ? "完了" : "取得できず代替表示"}` : "未開始（再読み込み後は記録なし）"}</p>
    <p className="mt-2">解析画面の演出時間は含みません。実測はその時点の1回分で、次回の速度を保証しません。</p>
  </details>;
}
