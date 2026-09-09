"use client";

import Image from "next/image";
import type { Choice, Question } from "@/lib/content";
import { reviewIllustration } from "@/lib/review-illustrations";
import { Furigana } from "@/components/ui/Furigana";

export function ActionReview({ question, choice, timedOut, number }: { question: Question; choice: Choice; timedOut: boolean; number: number }) {
  const scene = reviewIllustration(question);
  return <article className="overflow-hidden rounded-field bg-canvas">
    <div className="p-3">
      <p className="text-11 font-bold text-primary-ink">Q{number}　<Furigana text={question.category} /></p>
      <p className="mt-2 text-11 text-ink-soft"><Furigana text={question.situation} adult={question.adultSituation} /></p>
      <p className="mt-3 text-11 font-bold">{timedOut ? "時間内に選べなかった行動" : "あなたが選んだ行動"}</p>
      {!timedOut && <p className="mt-1 text-13 font-bold"><Furigana text={choice.label} /></p>}
      <p className="mt-2 text-13 leading-relaxed"><Furigana text={timedOut ? "あわてず選べるように、この場面での動きを確認しよう。" : choice.explanation[0] ?? "この場面での行動を確認しましょう。"} /></p>
    </div>
    {scene && <figure className="border-y border-border bg-primary-soft">
      <figcaption className="p-3">
        <p className="text-11 font-bold text-primary-ink">この場面での行動の例 · {scene.timing}</p>
        <p className="mt-1 text-15 font-bold"><Furigana text={scene.headline} /></p>
      </figcaption>
      <Image src={`/illustrations/review/${scene.image}.webp`} alt={scene.alt} width={1536} height={1024} sizes="(max-width: 480px) 100vw, 360px" className="h-auto w-full" />
      <p className="p-2 text-11 text-ink-muted">AI生成の説明用イラスト。あなたの行動・部屋の再現ではありません。</p>
    </figure>}
    <details className="p-3">
      <summary className="min-h-8 cursor-pointer text-13 font-bold">理由・注意点を詳しく見る</summary>
      {(timedOut ? question.choices.reduce((best, next) => next.safety > best.safety ? next : best, choice).explanation : choice.explanation).map((text, i) => <p key={i} className="mt-2 text-13 leading-relaxed text-ink-muted"><Furigana text={text} /></p>)}
    </details>
  </article>;
}
