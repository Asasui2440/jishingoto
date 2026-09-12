"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import roomThumb from "@/../public/figma/img/room-thumb.jpg";
import {
  CheckCircleTealIcon,
  DotBlueIcon,
  DotGrayIcon,
  LightbulbTealIcon,
  XCircleBlueIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { Meter, TitleBlock } from "@/components/ui/Bits";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { prepareRoom } from "@/lib/room-preparation";
import { ANALYSIS_STEPS, TRIVIA } from "@/lib/content";
import { useSession } from "@/lib/session";

/** 1ステップあたりの見せかけの所要時間 */
const STEP_MS = 1400;

export default function AnalysisLoadingPage() {
  const router = useRouter();
  const { photoUrl, startedAt, update } = useSession();
  const [step, setStep] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [triviaOffset, setTriviaOffset] = useState(0);

  // 体験を始めた時刻から選ぶので、毎回ちがう豆知識が出て、
  // かつ同じセッション内での再レンダーでは入れ替わらない
  const trivia = TRIVIA[((startedAt ?? 0) + triviaOffset) % TRIVIA.length];

  useEffect(() => {
    if (cancelled) return;
    if (step >= ANALYSIS_STEPS.length) {
      let alive = true;
      void prepareRoom(photoUrl).then((analysis) => {
        if (!alive) return;
        update({
          ...(analysis.source === "demo" ? { photoUrl: "/figma/img/room-risk.jpg" } : {}),
          risks: analysis.risks,
          analysisSource: analysis.source,
          analysisWarning: analysis.warning ?? null,
        });
        router.replace("/risks");
      });
      return () => {
        alive = false;
      };
    }
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
    // update / router は安定なので、進行に必要な値だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cancelled, photoUrl]);

  const progress = Math.min(1, (step + 0.35) / ANALYSIS_STEPS.length);

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <TitleBlock
          title="AIが部屋[へや]をチェック中[ちゅう]..."
          lead="危[あぶ]ない場所[ばしょ]がないかしらべています。"
        />
      </div>

      <div className="flex flex-col items-center gap-5 px-6">
        <div className="rounded-pill bg-primary-soft p-3">
          <div className="relative size-[120px] overflow-hidden rounded-tile bg-ink">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Image src={roomThumb} alt="" fill sizes="120px" className="object-cover" />
            )}
            <span
              aria-hidden
              className="animate-scan absolute inset-x-0 h-1 bg-primary shadow-[0_0_12px_var(--color-primary)]"
            />
          </div>
        </div>

        <div
          className="w-full rounded-panel bg-surface p-5"
          role="status"
          aria-live="polite"
        >
          <Meter value={progress} height={10} track="var(--color-canvas)" />

          <ol className="mt-3 flex flex-col gap-2">
            {ANALYSIS_STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li
                  key={label}
                  className={[
                    "flex items-center gap-2 transition-opacity",
                    done || active ? "opacity-100" : "opacity-40",
                  ].join(" ")}
                >
                  {done ? (
                    <CheckCircleTealIcon className="size-4 shrink-0 text-safe" />
                  ) : active ? (
                    <DotBlueIcon className="size-4 shrink-0 animate-pulse text-primary-ink" />
                  ) : (
                    <DotGrayIcon className="size-4 shrink-0 text-ink-faint" />
                  )}
                  <span
                    className={[
                      "text-13",
                      active
                        ? "font-bold text-primary-ink"
                        : done
                          ? "font-bold text-ink"
                          : "text-ink-muted",
                    ].join(" ")}
                  >
                    <Furigana text={label} />
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="px-6">
        <div className="rounded-card border border-safe bg-safe-soft p-4">
          <p className="flex items-center gap-1.5 font-display text-sm font-bold text-safe">
            <LightbulbTealIcon className="size-[18px] shrink-0" />
            <Furigana text="しってた？防災[ぼうさい]豆知識[まめちしき]" />
          </p>
          <p className="mt-3 text-lg font-bold leading-relaxed"><Furigana text={trivia.title} /></p>
          <p className="mt-2 text-base leading-relaxed">
            <Furigana text={trivia.body} adult={trivia.adultBody} />
          </p>
          <p className="mt-2 text-base leading-relaxed text-ink-muted"><Furigana text={trivia.note} adult={trivia.adultNote} /></p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <a href={trivia.source.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">{trivia.source.title}</a>
            <button type="button" onClick={() => setTriviaOffset((n) => n + 1)} className="min-h-11 rounded-pill bg-surface px-4 text-base font-bold"><Furigana text="次[つぎ]の豆知識[まめちしき]" /></button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-5">
        <Button
          variant="quiet"
          onClick={() => {
            setCancelled(true);
            router.push("/");
          }}
        >
          <XCircleBlueIcon className="size-5 text-primary-ink" />
          キャンセル
        </Button>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
