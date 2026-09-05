"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { AlertOctagonIcon } from "@/components/icons";
import { Furigana } from "@/components/ui/Furigana";
import { generateAftermath, type Aftermath } from "@/lib/api";
import { RISK_KINDS, type Risk } from "@/lib/content";

/**
 * 「もし地震がきたら、この部屋はこうなるかも」の予想図。
 *
 * 画像はバックエンドで AI に生成してもらう想定（`generateAftermath`）。
 * まだ実装がないので、いまは元の写真に「何がどうなったか」を重ねて出している。
 * 実装が入って `imageUrl` が返るようになれば、そちらに差し替わる。
 */
export function AftermathCard({
  photoUrl,
  risks,
}: {
  photoUrl: string | null;
  risks: Risk[];
}) {
  const [result, setResult] = useState<Aftermath | null>(null);

  useEffect(() => {
    let alive = true;
    void generateAftermath(photoUrl, risks).then((r) => {
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
          <img src={result.imageUrl} alt="地震のあとの部屋の予想図" className="size-full object-cover" />
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
                    <Furigana text={r.name} />
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
                <Furigana text={e.text} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.events.length === 0 ? (
        <p className="px-4 py-3 text-13 text-ink-muted">
          <Furigana text="あぶない場所[ばしょ]をひとつも確認[かくにん]しなかったので、予想図[よそうず]は出[だ]せなかったよ。" />
        </p>
      ) : null}
    </section>
  );
}
