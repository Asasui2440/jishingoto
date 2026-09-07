"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { AlertOctagonIcon } from "@/components/icons";
import { Furigana } from "@/components/ui/Furigana";
import { generateAftermath, type Aftermath } from "@/lib/api";
import { RISK_KINDS, type Risk } from "@/lib/content";

/** AI-generated hypothetical room image, with explicit retry on failure. */
export function AftermathCard({
  photoUrl,
  risks,
}: {
  photoUrl: string | null;
  risks: Risk[];
}) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Aftermath | null>(null);

  useEffect(() => {
    if (!requested) return;
    let alive = true;
    void generateAftermath(photoUrl, risks).then((r) => {
      if (alive) setResult(r);
    }).catch((e) => {
      if (alive) {
        setError(e instanceof Error ? e.message : "画像生成に失敗しました。");
        setResult({ imageUrl: null, events: [] });
      }
    });
    return () => {
      alive = false;
    };
  }, [photoUrl, risks, attempt, requested]);

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
        {!requested ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-canvas p-5 text-center">
            <p className="text-sm text-ink-muted">画像生成にはOpenAI APIの利用料金がかかります。</p>
            <button type="button" disabled={!photoUrl || !confirmed.length} className="rounded-panel bg-primary px-4 py-3 font-bold text-ink disabled:opacity-45" onClick={() => setRequested(true)}>有料の画像生成を開始する</button>
            {!confirmed.length ? <p className="text-xs text-ink-muted">危険ポイントを確認すると生成できます。</p> : null}
          </div>
        ) : result === null ? (
          // 生成待ち
          <div className="absolute inset-0 grid place-items-center bg-canvas">
            <div className="flex flex-col items-center gap-2">
              <span className="size-8 animate-spin rounded-full border-[3px] border-border border-t-primary-mid" />
              <p className="text-11 text-ink-soft">
                <Furigana text="AIが想定画像[そうていがぞう]をつくっています（数分[すうふん]かかることがあります）..." />
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

      <p className="px-4 py-3 text-xs text-ink-muted">AIによる想定イメージです。実際の被害や建物の安全性を予測・判定するものではありません。</p>
      {error ? <div role="alert" className="px-4 pb-3 text-sm text-danger">
        <p>{error} 元の写真を表示しています。</p>
        <button type="button" className="mt-2 underline" onClick={() => { setError(null); setResult(null); setAttempt((n) => n + 1); }}>画像生成を再試行する（API料金がかかります）</button>
      </div> : null}
      {!photoUrl ? <p className="px-4 pb-3 text-sm text-ink-muted">サンプル表示です。自分の部屋の写真を使うとAI画像を生成できます。</p> : null}
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

      {result && !error && photoUrl && confirmed.length === 0 ? (
        <p className="px-4 py-3 text-13 text-ink-muted">
          <Furigana text="あぶない場所[ばしょ]をひとつも確認[かくにん]しなかったので、予想図[よそうず]は出[だ]せなかったよ。" />
        </p>
      ) : null}
    </section>
  );
}
