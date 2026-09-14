"use client";

import { useEffect, useState } from "react";
import { AlertOctagonIcon } from "@/components/icons";
import { Furigana } from "@/components/ui/Furigana";
import { type Aftermath } from "@/lib/api";
import { prepareAftermath, preparedAftermath } from "@/lib/room-preparation";
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

  const display = result ? aftermathDisplay(result) : null;

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-[0_8px_9px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertOctagonIcon className="size-[18px] shrink-0" />
        <h2 className="font-display text-15 font-bold text-ink">
          <Furigana text={display?.mock ? "地震後の部屋の予想図（サンプル）" : "地震後[じしんご]の部屋[へや]の予想図[よそうず]"} />
        </h2>
      </div>

      {result ? (
        <p className="border-b border-border bg-canvas px-4 py-2 text-11 font-bold text-ink-muted">
          <Furigana text={display?.mock ? audience === "adult" ? MOCK_NOTE : MOCK_NOTE_CHILD : result.source === "ai"
            ? audience === "adult" ? SUMMARY_COPY.note : SUMMARY_COPY.childNote
            : "AI画像を作成できなかったため、写真に危険候補を重ねています。"} />
        </p>
      ) : null}

      <div className="relative mx-auto my-3 aspect-[3/2] w-[88%] overflow-hidden rounded-field bg-ink">
        {result === null ? (
          // 生成待ち
          <div className="absolute inset-0 grid place-items-center bg-canvas">
            <div className="flex flex-col items-center gap-2">
              <span className="size-8 animate-spin rounded-full border-[3px] border-border border-t-primary" />
              <p className="text-11 text-ink-soft">
                <Furigana text="AIが予想図[よそうず]をつくっています..." />
              </p>
            </div>
          </div>
        ) : display && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={display.imageUrl} alt={display.mock ? "サンプルの予想図。あなたの部屋を再現した画像ではありません" : "撮影した部屋をもとにした地震後の予想図"} className="size-full object-contain" />
        )}
      </div>

      {result?.source === "preview" && photoUrl?.startsWith("data:image/") && <div className="space-y-3 px-4 py-3">
        <p role="status" className="text-sm"><Furigana text={result.error ?? "予想図を生成できませんでした。"} /></p>
        {<button type="button" className="min-h-11 rounded-pill border border-border px-4 font-bold" onClick={() => { setResult(null); setAttempt(value => value + 1); }}><Furigana text={"予想図をもう一度生成"} /></button>}
      </div>}
      {result && result.events.length === 0 && !result.imageUrl && !result.error ? (
        <p className="px-4 py-3 text-13 text-ink-muted">
          <Furigana text="予想図[よそうず]を作成できませんでした。写真を見ながら、部屋の備[そな]えを確認[かくにん]してください。" />
        </p>
      ) : null}
    </section>
  );
}
