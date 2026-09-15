"use client";

import { useEffect, useState } from "react";
import { AlertOctagonIcon } from "@/components/icons";
import { Furigana } from "@/components/ui/Furigana";
import { type Aftermath } from "@/lib/api";
import { aftermathStartedAt, prepareAftermath, preparedAftermath } from "@/lib/room-preparation";
import { type Risk } from "@/lib/content";
import { useSettings } from "@/lib/settings";
import { SUMMARY_COPY } from "@/lib/share-card";
import { aftermathDisplay, MOCK_NOTE, MOCK_NOTE_CHILD } from "@/lib/aftermath-display";

/**
 * 「もし地震がきたら、この部屋はこうなるかも」の予想図。
 *
 * OpenAI の画像編集 API が利用できるときはアニメ調の予想図を生成し、
 * 利用できないときはサンプルと明示した予想図を表示する。
 */
export function AftermathCard({
  photoUrl,
  risks,
}: {
  photoUrl: string | null;
  risks: Risk[];
}) {
  const { audience } = useSettings();
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [result, setResult] = useState<Aftermath | null>(() => preparedAftermath(photoUrl, risks.filter((risk) => risk.confirmed)));

  useEffect(() => {
    let alive = true;
    void prepareAftermath(photoUrl, risks.filter((risk) => risk.confirmed), attempt > 0).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [photoUrl, risks, attempt]);

  useEffect(() => {
    if (result !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [result]);
  const confirmed = risks.filter(r => r.confirmed);
  const elapsed = Math.max(0, Math.floor((now - (aftermathStartedAt(photoUrl, confirmed) ?? now)) / 1_000));
  const display = result ? aftermathDisplay(result) : null;

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-glass-soft px-4 py-3">
        <AlertOctagonIcon className="size-[18px] shrink-0" />
        <h2 className="font-display text-15 font-bold text-ink">
          <Furigana text={display?.mock ? "地震後の部屋の予想図（サンプル）" : SUMMARY_COPY.prediction} />
        </h2>
      </div>

      {result ? (
        <p className="border-b border-border bg-canvas px-4 py-2 text-11 font-bold text-ink-muted">
          <Furigana text={display?.mock ? audience === "adult" ? MOCK_NOTE : MOCK_NOTE_CHILD : result.source === "ai"
            ? `${audience === "adult" ? SUMMARY_COPY.note : SUMMARY_COPY.childNote}${result.verification === "unavailable" ? " 元写真との自動比較は完了していません。部屋の形や家具を確認してください。" : ""}`
            : "AI画像を作成できなかったため、写真に危険候補を重ねています。"} />
        </p>
      ) : null}

      <div className="relative mx-auto my-3 aspect-[3/2] w-[88%] overflow-hidden rounded-field bg-ink">
        {result === null ? (
          // 生成待ち
          <div className="absolute inset-0 grid place-items-center bg-canvas">
            <div className="flex max-w-sm flex-col items-center gap-2 px-4 text-center">
              <span className="size-8 animate-spin rounded-full border-[3px] border-border border-t-primary" />
              <p className="text-11 text-ink-soft">
                <Furigana text="AIが予想図[よそうず]をつくっています..." />
              </p>
              <p className="text-xs tabular-nums text-ink-muted">経過 {elapsed} 秒</p>
              <p className="text-xs leading-relaxed text-ink-muted"><Furigana text={elapsed >= 60 ? "少し時間がかかっています。このまま備えの確認へ進めます。" : "待っている間も、備えの確認へ進めます。"} /></p>
            </div>
          </div>
        ) : display && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={display.imageUrl} alt={display.mock ? "サンプルの予想図。あなたの部屋を再現した画像ではありません" : "撮影した部屋をもとにした地震後の予想図"} className="size-full object-contain" />
        )}
      </div>

      {result?.source === "preview" && <div className="space-y-3 px-4 py-3">
        <p role="status" className="text-sm"><Furigana text={result.error ?? "予想図を生成できませんでした。"} /></p>
        {photoUrl?.startsWith("data:image/") ? <button type="button" className="min-h-11 rounded-pill border border-border px-4 font-bold" onClick={() => { setResult(null); setAttempt(value => value + 1); }}><Furigana text={"予想図をもう一度生成"} /></button> : <a href="/camera" className="inline-block py-3 underline">写真を選び直す</a>}
      </div>}
      {result && result.events.length === 0 && !result.imageUrl && !result.error ? (
        <p className="px-4 py-3 text-13 text-ink-muted">
          <Furigana text="予想図[よそうず]を作成できませんでした。写真を見ながら、部屋の備[そな]えを確認[かくにん]してください。" />
        </p>
      ) : null}
    </section>
  );
}
