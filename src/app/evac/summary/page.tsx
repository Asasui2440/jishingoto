"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { getEvac, useEvac } from "@/lib/evac";
import { scoreDecisions } from "@/lib/evac-review";

export default function EvacSummaryPage() {
  const router = useRouter();
  const evac = useEvac();
  const {decisions,walk,followUp,update,reset} = evac;
  const result = useMemo(() => scoreDecisions({decisions,walk}), [decisions,walk]);
  const followUps = result.followUps.length ? result.followUps : ["自治体の防災マップで、この経路と避難先の指定を平常時に確認する"];
  useEffect(() => { if (!getEvac().finishedAt) router.replace("/evac"); }, [router]);
  return <GameShell>
    <GameHeader title="判断をふりかえろう" subtitle="良かった点と、次にできること" step={3} onBack={() => router.push("/evac/report")} />
    <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5">
      <section aria-label="判断スコア" className="rounded-panel bg-primary-soft p-5 text-center">
        <h2 className="text-13 font-bold">判断スコア</h2>
        <p className="my-3 font-display text-5xl font-bold">{result.score ?? "—"}<span className="ml-2 text-base font-medium">/ 100</span></p>
        <p className="text-13">{result.count ? `${result.count}問中${result.good.length}問で、最も優先したい行動を選べました。` : "採点できる判断の記録がありません。"}</p>
        <p className="mt-3 text-11 leading-relaxed text-ink-muted">今回の想定問題での判断を振り返るためのスコアです。実際の避難の安全性や、災害時の対応力を保証するものではありません。</p>
        <details className="mt-3 text-left text-11 text-ink-muted"><summary className="cursor-pointer">スコアの見方</summary><p className="mt-2">各問題の行動の優先度をもとに、最も優先したい選択を満点として平均しています。回答にかかった時間やルートの短さでは減点しません。採点対象は回答記録{result.total}件のうち{result.count}件です。</p></details>
      </section>
      <section className="rounded-panel bg-amber-50 p-4" aria-labelledby="good-heading">
        <h2 id="good-heading" className="mb-3 flex items-center gap-2 font-bold text-amber-900"><GameIcon name="check" className="size-5" />良かったところ</h2>
        {result.good.length ? <ul className="space-y-4">{result.good.map(row => <li key={row.d.pointId}><p className="text-11 text-ink-muted"><Furigana text={row.event.title} /></p><p className="mt-1 text-13 font-bold"><Furigana text={row.choice.label} /></p><p className="mt-1 text-13"><Furigana text={row.choice.feedback} /></p></li>)}</ul> : <p className="text-13">{result.count ? "場面ごとに行動を選び、振り返るための記録を残せました。次は下の改善点を意識してみましょう。" : "体験中に行動を選ぶと、その判断に応じた良かった点を確認できます。"}</p>}
      </section>
      <section className="rounded-panel bg-blue-50 p-4" aria-labelledby="improve-heading">
        <h2 id="improve-heading" className="mb-3 font-bold text-blue-900">もっと改善できるところ</h2>
        {result.improvements.length ? <ul className="space-y-4">{result.improvements.map(row => <li key={row.d.pointId}><p className="text-11 text-ink-muted"><Furigana text={row.event.title} /></p><p className="mt-1 text-13">選んだ行動：<Furigana text={row.choice.label} /></p><p className="mt-2 text-13 font-bold">次に意識したい行動：<Furigana text={row.recommended.label} /></p><p className="mt-1 text-13"><Furigana text={row.event.hint} /></p></li>)}</ul> : <p className="text-13">{result.count ? "今回の問題では、いずれも最も優先したい行動を選べました。次は実際の道で、目印や周囲の状況を確認してみましょう。" : "採点できる記録がないため、個別の改善点はまだ表示できません。"}</p>}
      </section>
      <section className="space-y-2" aria-labelledby="followup-heading">
        <h2 id="followup-heading" className="font-bold">次に確かめること</h2>
        <p className="text-13 text-ink-muted">平常時に確かめたいことを、ひとつ選ぼう。</p>
        {followUps.map(value => <button type="button" key={value} aria-pressed={followUp === value} onClick={() => update({followUp:value})} className={`flex min-h-14 w-full items-center gap-3 rounded-tile border p-3 text-left text-13 ${followUp === value ? "border-amber-300 bg-amber-50" : "border-border bg-surface"}`}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-border">{followUp === value ? <GameIcon name="check" className="size-4" /> : null}</span><Furigana text={value} /></button>)}
        {followUp ? <p role="status" className="text-11 text-amber-900">次に確かめることを保存しました。</p> : null}
      </section>
      <Button onClick={() => {
        const {mode,scenario,home,homeLabel,shelter,timerSeconds,roomFinishedAt} = evac;
        reset(); update({mode,scenario,home,homeLabel,shelter,timerSeconds,roomFinishedAt}); router.push("/evac/routes");
      }}>別ルートで試す</Button>
      <Link href="/" className="flex min-h-12 items-center justify-center text-13 font-bold text-ink-muted">ホーム</Link>
    </main>
  </GameShell>;
}
