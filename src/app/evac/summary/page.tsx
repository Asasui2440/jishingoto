"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet, GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { eventTitle } from "@/lib/evac-display";
import { DecisionRating } from "@/components/evac/DecisionRating";
import { ChoiceTradeoffs } from "@/components/evac/ChoiceTradeoffs";
import { WalkIllustration } from "@/components/evac/WalkIllustration";
import { ReviewIllustrations } from "@/components/evac/ReviewIllustrations";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { getEvac, useEvac } from "@/lib/evac";
import { scoreDecisions } from "@/lib/evac-review";

export default function EvacSummaryPage() {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const [followOpen, setFollowOpen] = useState(false);
  const evac = useEvac();
  const {decisions,walk,followUp,update} = evac;
  const result = useMemo(() => scoreDecisions({decisions,walk}), [decisions,walk]);
  const followUps = result.followUps.length ? result.followUps : ["自治体の防災マップで、この経路と避難先の指定を平常時に確認する"];
  const rows = [...result.good, ...result.improvements].sort((a, b) => decisions.indexOf(a.d) - decisions.indexOf(b.d));
  const row = index === null ? undefined : rows[index];
  useEffect(() => { if (!getEvac().finishedAt) router.replace("/evac"); }, [router]);
  return <GameShell>
    <GameHeader title="判断をふりかえろう" subtitle="良かった点と、次にできること" step={3} onBack={() => router.push("/evac/report")} />
    <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
      <section aria-label="判断スコア" className="rounded-panel border-2 border-primary bg-surface p-3 text-center">
        <h2 className="text-13 font-bold">判断スコア</h2>
        <div className="mt-2 flex items-center gap-3">
        <div className="relative grid size-24 shrink-0 place-items-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border)" strokeWidth="9" />
            <circle data-testid="score-ring" cx="60" cy="60" r="50" fill="none" stroke="var(--color-safe)" strokeWidth="9" pathLength="100" strokeDasharray={`${result.score ?? 0} 100`} strokeLinecap={result.score ? "round" : "butt"} />
          </svg>
          <p className="font-display text-3xl font-bold">{result.score ?? "—"}<span className="block text-11 font-medium">/ 100</span></p>
        </div>
        <p className="text-13">{result.count ? `${result.count}問中${result.good.length}問で、最も優先したい行動を選べました。` : "採点できる判断の記録がありません。"}</p>
        </div>
        <details className="mt-3 text-left text-11 text-ink-muted"><summary className="cursor-pointer">スコアの見方</summary><p className="mt-2">今回の問題での判断を振り返るスコアです。実際の避難の安全性や災害時の対応力を保証するものではありません。</p><p className="mt-2">各問題の行動の優先度をもとに、最も優先したい選択を満点として平均しています。回答にかかった時間やルートの短さでは減点しません。採点対象は回答記録{result.total}件のうち{result.count}件です。</p></details>
      </section>
      <section aria-labelledby="decisions-heading" className="space-y-2">
        <h2 id="decisions-heading" className="font-bold">判断の振り返り</h2>
        <p className="text-11 text-ink-muted">○ 良い判断　△ もう一工夫　× 見直したい判断</p>
        <p className="text-13 text-ink-muted">気になる場面だけ、押して見返せます。</p>
        {rows.length ? rows.map((item, i) => <button key={item.d.pointId} type="button" onClick={() => setIndex(i)} aria-label={`判断${i + 1}：${eventTitle(item.event.title)}を見返す`} className="flex min-h-14 w-full items-center gap-2 rounded-tile border border-border bg-surface p-2 text-left">
          <DecisionRating event={item.event} choice={item.choice} compact />
          <WalkIllustration event={item.event} className="h-12 w-16 shrink-0 rounded-lg object-contain" />
          <span className="min-w-0 flex-1 text-13 font-bold"><span className="mr-2 text-11 text-ink-muted">{i + 1}</span><Furigana text={eventTitle(item.event.title)} /></span><GameIcon name="chevron" className="size-4 shrink-0" />
        </button>) : <p className="text-13">採点できる判断の記録がありません。</p>}
      </section>
    </main>
    <div className="shrink-0 border-t border-border bg-surface px-4 py-2"><Button onClick={() => setFollowOpen(true)}>振り返りを終わる</Button></div>
    <BottomSheet open={followOpen} title="次に確かめること" onClose={() => setFollowOpen(false)} footer={<Button onClick={() => router.push("/evac/complete")}>次へ</Button>}>
      <section className="space-y-2" aria-labelledby="followup-heading">
        <h2 id="followup-heading" className="font-bold">次の備えをひとつ選ぼう</h2>
        <p className="text-13 text-ink-muted">平常時に確かめたいことを、ひとつ選ぼう。</p>
        {followUps.map(value => <button type="button" key={value} aria-pressed={followUp === value} onClick={() => update({followUp:value})} className={`flex min-h-14 w-full items-center gap-3 rounded-tile border p-3 text-left text-13 ${followUp === value ? "border-amber-300 bg-amber-50" : "border-border bg-surface"}`}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-border">{followUp === value ? <GameIcon name="check" className="size-4" /> : null}</span><Furigana text={value} /></button>)}
        {followUp ? <p role="status" className="text-11 text-amber-900">次に確かめることを保存しました。</p> : null}
      </section>
    </BottomSheet>
    <BottomSheet open={!!row} title={row ? `判断 ${index! + 1} / ${rows.length}` : "判断の振り返り"} onClose={() => setIndex(null)} footer={row ? <nav aria-label="判断の切り替え" className="flex gap-2">
      <Button size="md" variant="quiet" disabled={index === 0} onClick={() => setIndex(index! - 1)}>前の判断</Button>
      <Button size="md" onClick={() => index! < rows.length - 1 ? setIndex(index! + 1) : setIndex(null)}>{index! < rows.length - 1 ? "次の判断" : "判断を閉じる"}</Button>
    </nav> : undefined}>
      {row ? <section aria-label="判断の詳細" className="space-y-2">
        <h2 className="text-15 font-bold"><Furigana text={eventTitle(row.event.title)} /></h2>
        <ReviewIllustrations event={row.event} choice={row.choice} recommended={row.value < 1 ? row.recommended : undefined} />
        <ChoiceTradeoffs key={row.d.pointId} event={row.event} choice={row.choice} />
        <details key={`reason-${row.d.pointId}`} className="rounded-tile bg-canvas p-3 text-13"><summary className="cursor-pointer font-bold">{row.value === 1 ? "この行動が良かった理由" : "次に意識したい理由"}</summary><p className="mt-2"><Furigana text={row.value === 1 ? row.choice.feedback : row.event.hint} /></p></details>
      </section> : null}
    </BottomSheet>
  </GameShell>;
}
