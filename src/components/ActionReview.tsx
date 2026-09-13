"use client";

import { useSettings } from "@/lib/settings";
import { reviewNotes } from "@/lib/review-copy";
import Image from "next/image";
import { DetailSheet } from "@/components/ui/DetailSheet";
import type { Choice, Question } from "@/lib/content";
import { reviewIllustration, reviewImagePath } from "@/lib/review-illustrations";
import { Furigana } from "@/components/ui/Furigana";

export function ActionReview({ question, choice, timedOut, number }: { question: Question; choice: Choice; timedOut: boolean; number: number }) {
  const { audience } = useSettings();
  const scene = reviewIllustration(question);
  const best = question.choices.reduce((best, next) => next.safety > best.safety ? next : best, choice);
  const safe = !timedOut && choice.safety >= 0.7;
  const feedback = timedOut
    ? "時間内に選べませんでした。次に備えて、行動を確認しましょう。"
    : safe
      ? "安全につながる行動を選べました"
      : choice.safety >= 0.4
        ? "気をつけたい点がある行動です"
        : "この場面では、けがにつながるおそれがある行動です";
  return <article className="overflow-hidden rounded-panel bg-surface">
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-13 font-bold text-primary-ink">
      <p>Q{number} · <Furigana text={question.category} /></p>
    </div>
    {scene && <figure className="bg-secondary-soft">
      <Image src={reviewImagePath(scene.image)} alt={scene.alt} width={1536} height={1024} sizes="(max-width: 480px) 100vw, 360px" className="h-auto w-full" loading="eager" />
      <figcaption className="px-4 py-3">
        <p className="text-11 font-bold text-secondary-ink">覚えておきたい行動</p>
        <p className="mt-1 text-15 font-bold leading-relaxed"><Furigana text={scene.headline} /></p>
      </figcaption>
    </figure>}
    {!scene && (timedOut || choice.id !== best.id) && <div className="bg-secondary-soft p-4">
      <p className="text-sm font-bold text-secondary-ink">安全のために覚えておきたい行動</p>
      <p className="mt-1 text-15 font-bold"><Furigana text={best.label} /></p>
    </div>}
    <div className="space-y-3 p-4">
      <div className="border-l-[3px] border-border pl-3">
        {!timedOut && <><p className="text-11 text-ink-muted">あなたが選んだ行動</p><p className="mt-1 text-sm font-bold"><Furigana text={choice.label} /></p></>}
        <p className="mt-1 text-13 font-bold text-ink-muted"><span aria-hidden>{safe ? "✓ " : timedOut ? "◷ " : "! "}</span><Furigana text={feedback} /></p>
      </div>
      <DetailSheet title="理由・注意点を読む" summary="問題の場面と参考資料も確認">
        <section className="rounded-field bg-canvas p-3">
          <h3 className="text-sm font-bold text-ink-muted">この問題の場面</h3>
          {scene && <p className="mt-1 text-xs text-ink-muted">{scene.timing}</p>}
          <p className="mt-2 text-base leading-relaxed"><Furigana text={question.situation} adult={question.adultSituation} /></p>
        </section>
        <section>
          <h3 className="text-base font-bold"><Furigana text="ここを覚[おぼ]えよう" adult="理由・注意点" /></h3>
          {reviewNotes(question, audience).map((text, i) => <p key={i} className="mt-3 text-base leading-relaxed text-ink"><Furigana text={text} /></p>)}
          {question.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-11 text-primary-ink underline">{source.title} ↗</a>)}
        </section>
      </DetailSheet>
    </div>
  </article>;
}
