"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { AlertOctagonIcon } from "@/components/icons";
import { Furigana } from "@/components/ui/Furigana";
import { type Aftermath } from "@/lib/api";
import { prepareAftermath, preparedAftermath } from "@/lib/room-preparation";
import { RISK_KINDS, type Risk } from "@/lib/content";
import { useSettings } from "@/lib/settings";

/**
 * 「もし地震がきたら、この部屋はこうなるかも」の予想図。
 *
 * OpenAI の画像編集 API が利用できるときはアニメ調の予想図を生成し、
 * 利用できないときは元写真へのマーカー表示へフォールバックする。
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

  const confirmed = risks.filter((r) => r.confirmed);

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-[0_8px_9px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertOctagonIcon className="size-[18px] shrink-0" />
        <h2 className="font-display text-15 font-bold text-ink">
          <Furigana text="地震後[じしんご]の部屋[へや]の予想図[よそうず]" />
        </h2>
      </div>

      {result ? (
        <p className="border-b border-border bg-primary-soft px-4 py-2 text-11 font-bold text-primary-ink">
          {result.source === "test" ? "APIなしのテスト用画像です。生成結果の代わりに固定の元写真を表示しています。" : result.source === "ai"
            ? "写真をもとにAIが描いた想像図です。実際の被害を断定するものではありません。"
            : "AI画像を作成できなかったため、写真に危険候補を重ねています。"}
        </p>
      ) : null}

      <div className="relative aspect-[3/2] w-full bg-ink">
        {result === null ? (
          // 生成待ち
          <div className="absolute inset-0 grid place-items-center bg-canvas">
            <div className="flex flex-col items-center gap-2">
              <span className="size-8 animate-spin rounded-full border-[3px] border-border border-t-primary-mid" />
              <p className="text-11 text-ink-soft">
                <Furigana text="AIが予想図[よそうず]をつくっています..." />
              </p>
            </div>
          </div>
        ) : result.imageUrl ? (
          // バックエンドが生成した画像
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.imageUrl} alt={result.source === "test" ? "生成結果の代わりに表示する固定テスト写真" : audience === "adult" ? "撮影した部屋をもとにした地震後のアニメ調の想像図" : "地震のあとの部屋の予想図"} className="size-full object-contain" />
        ) : (
          <>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Image src={roomRisk} alt="" fill sizes="354px" className="object-cover" />
            )}
            {/* 生成画像がないあいだの代用。何がどうなるかをマーカーで示す */}
            <span aria-hidden className="absolute inset-0 bg-ink/35" />
            {confirmed.map((r) => {
              const kind = RISK_KINDS[r.kind];
              return (
                <span
                  key={r.id}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                  style={{ left: `${r.x}%`, top: `${r.y}%` }}
                >
                  <span
                    className="size-7 rotate-45 rounded-md border-2 border-white"
                    style={{ background: kind.accent }}
                  />
                  <span className="rounded-chip bg-black/70 px-2 py-0.5 font-display text-11 font-bold whitespace-nowrap text-white">
                    <Furigana text={r.name} adult={r.adultName} />
                  </span>
                </span>
              );
            })}
          </>
        )}
      </div>

      {result?.source === "preview" && <div className="space-y-3 px-4 py-3">
        <p role="status" className="text-sm">{result.error ?? "予想図を生成できませんでした。"}</p>
        {photoUrl?.startsWith("data:image/") ? <button type="button" className="min-h-11 rounded-pill border border-border px-4 font-bold" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>予想図をもう一度生成</button> : <a href="/camera" className="inline-block py-3 underline">写真を選び直す</a>}
      </div>}
      {result && result.events.length === 0 && !result.imageUrl && !result.error ? (
        <p className="px-4 py-3 text-13 text-ink-muted">
          <Furigana text="予想図[よそうず]を作成できませんでした。写真を見ながら、部屋の備[そな]えを確認[かくにん]してください。" />
        </p>
      ) : null}
    </section>
  );
}
