"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRoomTestOptions } from "@/lib/room-test";
import { clearRoomPreparation, prepareRoom } from "@/lib/room-preparation";
import { useSession } from "@/lib/session";
import { AFTER_SHAKING_QUESTIONS } from "@/lib/after-shaking-questions";
import { HOME_KITCHEN_AFTER, SCENARIOS } from "@/lib/scenarios";
import { DETECTED_RISKS, QUESTIONS } from "@/lib/content";
import { Button } from "@/components/ui/Button";

export default function TestRoomClient() {
  const [analysis, setAnalysis] = useState(2);
  const { reset, update } = useSession();
  const router = useRouter();
  const previewResult = (showIntro = false, showPeople = false) => {
    reset();
    setRoomTestOptions({ mode: "fixture", analysisMs: 0, imageMs: 0 });
    const questions = showPeople
      ? [AFTER_SHAKING_QUESTIONS[0], HOME_KITCHEN_AFTER, ...SCENARIOS.filter(q => [
          "shelter-damaged", "shelter-home", "shelter-tsunami", "home-bed",
          "office-copier", "office-elevator", "office-stay",
        ].includes(q.id))]
      : [QUESTIONS[0], AFTER_SHAKING_QUESTIONS[1]];
    update({ photoUrl: "/figma/img/room-risk.jpg", risks: DETECTED_RISKS.map(r => ({ ...r, confirmed: true })), questions,
      answers: questions.map((q, i) => {
        const c = q.choices.find(c => i === 0 ? c.safety < 0.4 : c.safety >= 0.7)!;
        return { questionId: q.id, choiceId: c.id, safety: c.safety, axis: q.axis, timedOut: false };
      }), analysisSource: "demo", analysisWarning: "結果ページの表示確認用の固定データです。", startedAt: Date.now(), finishedAt: Date.now(), resultStep: 0, resultIntroPending: showIntro });
    router.push("/result");
  };
  return <main className="space-y-5 px-6 pt-16 pb-6">
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
    <Button variant="outline" onClick={() => previewResult()}>結果ページを試す（APIなし）</Button>
    <Button variant="outline" onClick={() => previewResult(true)}>クイズ終了の演出を試す（APIなし）</Button>
    <Button variant="outline" onClick={() => previewResult(false, true)}>人物入りのイラストを試す（APIなし）</Button>
    <Button variant="outline" onClick={() => {
      reset();
      setRoomTestOptions({ mode: "live", analysisMs: 0, imageMs: 0 });
      router.push("/camera");
    }}>実測するため写真を撮る（API課金あり）</Button>
    <p className="text-11">実測はぼかし確認でOKを押した後、解析を1回呼びます。家具の確認を終えてクイズへ進むと、想像図の生成と元写真との比較を各1回行います。写真や解析結果をテスト用に保存しません。</p>
  </main>;
}
