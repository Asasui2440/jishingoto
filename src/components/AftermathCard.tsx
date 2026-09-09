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
import { RoomTiming } from "@/components/RoomTiming";

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
  const [result, setResult] = useState<Aftermath | null>(() => preparedAftermath(photoUrl, risks.filter((risk) => risk.confirmed)));

  useEffect(() => {
    let alive = true;
    void prepareAftermath(photoUrl, risks.filter((risk) => risk.confirmed)).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [photoUrl, risks]);

  const confirmed = risks.filter((r) => r.confirmed);

  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-[0_8px_9px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertOctagonIcon className="size-[18px] shrink-0" />
        <h2 className="font-display text-15 font-bold text-ink">
          <Furigana text="もし地震[じしん]がきたら、この部屋[へや]は" />
        </h2>
      </div>

      <RoomTiming />
      {result ? (
        <p className="border-b border-border bg-primary-soft px-4 py-2 text-11 font-bold text-primary-ink">
          {result.source === "test" ? "APIなしのテスト用画像です。生成結果の代わりに固定の元写真を表示しています。" : result.source === "ai"
            ? "写真からAIが想像した一例です。下の危険候補の説明とは別に作成しており、修正した候補は画像には反映されません。実際の被害を断定するものではありません。"
            : "AI画像を作成できなかったため、写真に危険候補を重ねています。"}
        </p>
      ) : null}

      <div className="relative aspect-[4/3] w-full bg-ink">
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
          <img src={result.imageUrl} alt={result.source === "test" ? "生成結果の代わりに表示する固定テスト写真" : audience === "adult" ? "地震発生後の室内予測画像" : "地震のあとの部屋の予想図"} className="size-full object-cover" />
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

      {result && result.events.length > 0 ? (
        <ul className="flex flex-col gap-1.5 px-4 py-3">
          {result.events.map((e) => (
            <li key={e.riskId} className="flex gap-1.5 text-13 text-ink-muted">
              <span aria-hidden className="text-warn">
                ▸
              </span>
              <span>
                <Furigana text={e.text} adult={e.adultText} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.events.length === 0 && !result.imageUrl ? (
        <p className="px-4 py-3 text-13 text-ink-muted">
          <Furigana text="予想図[よそうず]を作成[さくせい]できませんでした。写真[しゃしん]を見[み]ながら、部屋[へや]の備[そな]えを確認[かくにん]してね。" />
        </p>
      ) : null}
    </section>
  );
}
