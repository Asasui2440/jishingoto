"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRoomTestOptions } from "@/lib/room-test";
import { clearRoomPreparation, prepareRoom } from "@/lib/room-preparation";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";

export default function TestRoomPage() {
  const [analysis, setAnalysis] = useState(2);
  const { reset, update } = useSession();
  const router = useRouter();
  return <main className="space-y-5 p-6">
    <h1 className="text-xl font-bold">部屋のテスト（APIなし）</h1>
    <p>固定のサンプル写真と解析結果を利用し、AIへは送信しません。</p>
    <p className="text-13 text-ink-muted">解析の待ち時間を指定できます。本物のAPIの速度を測るものではありません。</p>
    <label className="block">解析の模擬待ち時間（秒）<input className="mt-2 block w-full rounded border p-3" type="number" min={0} max={180} value={analysis} onChange={(e) => setAnalysis(Number(e.target.value))} /></label>
    <Button onClick={() => {
      reset();
      setRoomTestOptions({ mode: "fixture", analysisMs: analysis * 1000, imageMs: 0 });
      clearRoomPreparation();
      update({ photoUrl: "/figma/img/room-risk.jpg", startedAt: Date.now() });
      void prepareRoom("/figma/img/room-risk.jpg");
      router.push("/analyzing");
    }}>APIなしでテスト開始</Button>
    <Button variant="outline" onClick={() => {
      reset();
      setRoomTestOptions({ mode: "live", analysisMs: 0, imageMs: 0 });
      router.push("/camera");
    }}>実測するため写真を撮る（API課金あり）</Button>
    <p className="text-11">実測はぼかし確認でOKを押した後、解析を1回呼びます。危険確認の画面では予想図の生成も行います。写真や解析結果をテスト用に保存しません。</p>
  </main>;
}
