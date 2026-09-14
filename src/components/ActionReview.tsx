"use client";

import { questionRoomView } from "@/lib/room-views";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import { reviewNotes } from "@/lib/review-copy";
import Image from "next/image";
import { DetailSheet } from "@/components/ui/DetailSheet";
import type { Choice, Question } from "@/lib/content";
import { reviewIllustration, reviewImagePath } from "@/lib/review-illustrations";
import { Furigana } from "@/components/ui/Furigana";

export function ActionReview({ question, choice, timedOut, number }: { question: Question; choice: Choice; timedOut: boolean; number: number }) {
  const { audience } = useSettings();
  const { photoUrl: sourcePhoto, roomViews = [], risks } = useSession();
  const displayed = questionRoomView(question, risks, roomViews, sourcePhoto);
  const photoUrl = displayed.photo;
  question = displayed.question;
  const scene = reviewIllustration(question);
  const best = question.choices.reduce((best, next) => next.safety > best.safety ? next : best, choice);
  const safe = !timedOut && choice.safety >= 0.7;
  const informationFeedback: Record<string, string> = {
    share: "確かめずに広めると、不安や混乱を広げるおそれがあります",
    verify: "情報の発信元を確かめる行動を選べました",
    panic: "投稿だけで判断せず、情報の発信元を確かめましょう",
  };
  const feedback = timedOut
    ? question.id === "q5"
      ? "時間内に選べませんでした。情報の確かめ方を確認しましょう。"
      : "時間内に選べませんでした。次に備えて、行動を確認しましょう。"
    : (question.id === "q5" ? informationFeedback[choice.id] : undefined) ?? (
      safe
        ? "安全につながる行動を選べました"
        : choice.safety >= 0.4
          ? "気をつけたい点がある行動です"
          : "この場面では、けがにつながるおそれがある行動です"
    );
  return <>
    <section className="mb-4 px-1">
      <h3 className="text-sm font-bold text-ink-muted">この問題の場面</h3>
      {scene && <p className="mt-1 text-xs text-ink-muted">{scene.timing}</p>}
      <p className="mt-2 text-base leading-relaxed"><Furigana text={question.situation} adult={question.adultSituation} /></p>
    </section>
  <article className="action-review overflow-hidden rounded-panel border border-border bg-surface">
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-13 font-bold text-primary-ink">
      <p>Q{number} · <Furigana text={question.category} /></p>
    </div>

    {scene && <figure className={scene.secondary ? "review-figure p-3" : "review-figure"}>
      <div className={scene.secondary ? "grid grid-cols-2 gap-2" : ""}>
        <div>
          <Image src={reviewImagePath(scene.image)} alt={scene.alt} width={1536} height={1024} sizes={scene.secondary ? "(max-width: 480px) 44vw, 320px" : "(max-width: 639px) 100vw, 540px"} className="review-diagram" loading="eager" />
          {scene.secondary && <p className="mt-2 text-center text-13 font-bold leading-relaxed"><Furigana text={scene.headline} /></p>}
        </div>
        {scene.secondary && <div>
          <Image src={reviewImagePath(scene.secondary.image)} alt={scene.secondary.alt} width={1536} height={1024} sizes="(max-width: 480px) 44vw, 320px" className="review-diagram" loading="eager" />
          <p className="mt-2 text-center text-13 font-bold leading-relaxed"><Furigana text={scene.secondary.headline} /></p>
        </div>}
      </div>
      {!scene.secondary && <figcaption className="px-4 py-3">
        <p className="text-11 font-bold text-secondary-ink">覚えておきたい行動</p>
        <p className="mt-1 text-15 font-bold leading-relaxed"><Furigana text={scene.headline} /></p>
      </figcaption>}
      {scene.secondary && <figcaption className="pt-3 text-center text-11 font-bold text-secondary-ink"><Furigana text="揺れが収まり、安全に近づける場合だけ" /></figcaption>}
    </figure>}
    {!scene && (timedOut || choice.id !== best.id) && <div className="bg-secondary-soft p-4">
      <p className="text-sm font-bold text-secondary-ink">安全のために覚えておきたい行動</p>
      <p className="mt-1 text-15 font-bold"><Furigana text={best.label} /></p>
    </div>}
    <div className="review-copy space-y-3 p-4">
      <div className="text-ink">
        {!timedOut && <>
        <p className="text-11 text-ink-muted">あなたが選んだ行動</p>
        <p className="mt-1 text-sm font-bold"><Furigana text={choice.label} /></p>
        </>}
        <p className={`mt-1 text-13 font-bold ${safe ? "text-green-700" : "text-amber-900"}`}><span aria-hidden>{safe ? "✓ " : timedOut ? "◷ " : "! "}</span><Furigana text={audience === "child" && !safe && !timedOut && question.id !== "q5" && choice.safety < 0.4 ? "この場面では、けがをするかもしれない行動です" : feedback} /></p>
      </div>
      <DetailSheet title="理由・注意点を読む" summary="行動の理由と参考資料を確認">
      {photoUrl && question.sourceRiskId && question.highlight && <figure className="mt-3 overflow-hidden rounded-field border border-border">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="問題で確認した家具が写っている部屋の写真" className="block h-auto w-full" />
          <div aria-hidden className="pointer-events-none absolute rounded-field border-[3px] border-primary shadow-[0_0_0_1px_white]" style={{ left: `${question.highlight.x}%`, top: `${question.highlight.y}%`, width: `${question.highlight.w}%`, height: `${question.highlight.h}%` }} />
        </div>
        <figcaption className="bg-primary-soft p-3 text-base font-bold text-primary-ink"><Furigana text={question.highlight.label} adult={question.adultPlace} /></figcaption>
      </figure>}

        <section>
          <h3 className="text-base font-bold"><Furigana text="ここを覚[おぼ]えよう" adult="理由・注意点" /></h3>
          {reviewNotes(question, audience).map((text, i) => <p key={i} className="mt-3 text-base leading-relaxed text-ink"><Furigana text={text} /></p>)}
          {!!question.sources?.length && <div className="mt-4 rounded-field border border-border bg-canvas p-3">
            <p className="text-sm font-bold text-primary-ink"><Furigana text="こちらもチェック！" /></p>
            {question.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-13 font-bold text-primary-ink underline">{source.title} ↗</a>)}
          </div>}
        </section>
      </DetailSheet>
    </div>
  </article></>;
}
