"use client";

import { useSettings } from "@/lib/settings";
import { reviewNotes } from "@/lib/review-copy";
import Image from "next/image";
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
  return <article className="overflow-hidden rounded-field bg-canvas">
    <div className="p-3">
      <p className="text-15 font-bold text-primary-ink">Q{number}　<Furigana text={question.category} /></p>
      <p className="mt-3 text-lg font-bold leading-relaxed text-ink"><Furigana text={question.situation} adult={question.adultSituation} /></p>
      <div className={`mt-4 flex items-start gap-2 rounded-field p-3 text-base font-bold ${safe ? "bg-safe-soft text-safe" : "bg-primary-soft text-ink"}`}>
        <span aria-hidden>{safe ? "✓" : timedOut ? "◷" : "!"}</span>
        <p><Furigana text={feedback} /></p>
      </div>
      {!timedOut && <p className="mt-3 text-sm font-bold">あなたが選んだ行動</p>}
      {!timedOut && <p className="mt-1 text-base font-bold"><Furigana text={choice.label} /></p>}

    </div>
    {!scene && (timedOut || choice.id !== best.id) && <div className="border-y border-border bg-primary-soft p-3">
      <p className="text-sm font-bold text-primary-ink">安全のために覚えておきたい行動</p>
      <p className="mt-1 text-15 font-bold"><Furigana text={best.label} /></p>

    </div>}
    {scene && <figure className="border-y border-border bg-primary-soft">
      <figcaption className="p-3">
        <p className="text-sm font-bold text-primary-ink">安全のために覚えておきたい行動 · {scene.timing}</p>
        <p className="mt-1 text-15 font-bold"><Furigana text={scene.headline} /></p>
      </figcaption>
      <Image src={reviewImagePath(scene.image)} alt={scene.alt} width={1536} height={1024} sizes="(max-width: 480px) 100vw, 360px" className="h-auto w-full" />
    </figure>}
    <div className="p-3">
      <h3 className="text-base font-bold"><Furigana text="ここを覚[おぼ]えよう" adult="理由・注意点" /></h3>
      {reviewNotes(question, audience).map((text, i) => <p key={i} className="mt-3 text-base leading-relaxed text-ink"><Furigana text={text} /></p>)}
      {question.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-11 text-primary-ink underline">{source.title} ↗</a>)}
    </div>
  </article>;
}
