"use client";

import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import type { EvacChoice, HazardEvent } from "@/lib/evac-content";
import { ChoiceTradeoffs } from "./ChoiceTradeoffs";
import { BottomSheet } from "./GameUI";
import { ReviewIllustrations } from "./ReviewIllustrations";

export function AnswerFeedback({ feedback, busy, error, onContinue }: {
  feedback: { event: HazardEvent; choice: EvacChoice } | null;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  const best = feedback ? Math.max(...feedback.event.choices.map(choice => choice.priority)) : 0;
  return <BottomSheet open={!!feedback} title="回答と解説" onClose={onContinue}
    footer={<Button className="w-full" disabled={busy} onClick={onContinue}>{busy ? "迂回路を確認中…" : error ? "回答を選び直す" : "歩行を続ける"}</Button>}>
    {feedback ? <div className="space-y-4 pb-2">
      <section className="space-y-2" aria-label="選んだ行動の評価">
        <ReviewIllustrations event={feedback.event} choice={feedback.choice} />
        <p className="text-13 leading-relaxed"><Furigana text={feedback.choice.feedback} /></p>
      </section>
      <ChoiceTradeoffs key={`${feedback.event.id}-${feedback.choice.id}`} event={feedback.event} choice={feedback.choice} />
      <section className="space-y-2 rounded-2xl border border-border bg-primary-soft p-4" aria-label="この場面の推奨行動">
        <h3 className="text-13 font-bold">この条件で最も優先したい行動</h3>
        {feedback.event.choices.filter(choice => choice.priority === best).map(choice => <p key={choice.id} className="text-15 font-bold"><Furigana text={choice.label} /></p>)}
        <p className="text-13 leading-relaxed"><Furigana text={feedback.event.hint} /></p>
      </section>
      {error ? <p role="alert" className="rounded-xl bg-warn-soft p-3 text-13">{error}</p> : null}
      {busy ? <p role="status" className="text-13 text-ink-muted">解説を読みながらお待ちください。迂回路を確認しています。</p> : null}
    </div> : null}
  </BottomSheet>;
}
