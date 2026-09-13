"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { AftermathCard } from "@/components/AftermathCard";
import { ActionReview } from "@/components/ActionReview";
import { EvacuationGuide } from "@/components/EvacuationGuide";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { withAdultSituation } from "@/lib/api";
import { AXIS_LABEL, type Axis } from "@/lib/content";
import { useSettings } from "@/lib/settings";
import { getSession, scoreByAxis, strengths, useSession } from "@/lib/session";

const AXES: Axis[] = ["initial", "judgement", "room", "evacuation"];

export default function ResultPage() {
  const router = useRouter();
  const { answers, risks, questions, photoUrl, checked, toggleChecked, reset, resultStep, update } = useSession();
  const { audience } = useSettings();
  const adult = audience === "adult";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const wins = useMemo(() => strengths(answers, questions, audience), [answers, questions, audience]);
  // ふりかえり。答えた順に、選んだ行動と解説を並べる。
  // 1問ずつの安全度は出さない（結果は全部終わってからまとめて見せる方針）。
  const review = useMemo(
    () =>
      answers.flatMap((a) => {
        const saved = questions.find((x) => x.id === a.questionId);
        const risk = risks.find((x) => x.id === saved?.sourceRiskId);
        const q = saved && risk ? withAdultSituation(saved, risk) : saved;
        const c = q?.choices.find((x) => x.id === a.choiceId);
        return q && c ? [{ id: a.questionId, q, c, timedOut: a.timedOut }] : [];
      }),
    [answers, questions, risks],
  );

  // リザルトは全問終わってから。途中の状態では出さない。
  useEffect(() => {
    if (!getSession().finishedAt) router.replace("/");
  }, [router]);


  // 部屋の危険はクイズ前に確認済み。結果では選んだ行動だけを振り返る。
  const summaryStep = review.length;
  const checklistStep = summaryStep + 1;
  const lastStep = checklistStep;
  const step = Math.min(resultStep ?? 0, lastStep);
  const stepLabel = step < summaryStep ? `行動の振り返り ${step + 1} / ${review.length}`
    : step === summaryStep ? "今回のまとめ" : "今日からできること";
  const moveStep = (next: number) => {
    update(prev => ({ ...prev, resultStep: next }));
    window.scrollTo({ top: 0, behavior: "instant" });
    headingRef.current?.focus();
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center gap-2 px-6 pt-3">
          <span className="shrink-0 rounded-field bg-primary-soft px-2 py-0.5 font-display text-xs font-black whitespace-nowrap text-primary-ink">
            ジシンゴト
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-lg font-bold text-ink">
            <Furigana text="防災[ぼうさい]シミュレーション結果[けっか]" />
          </h1>
        </div>
      </div>

      <div className="animate-rise flex flex-col gap-4 px-6 pt-3 pb-6">
        <p role="status" className="font-display text-sm font-bold text-primary-ink">{stepLabel} <span className="text-11 text-ink-soft">({step + 1} / {lastStep + 1})</span></p>
        <Meter value={(step + 1) / (lastStep + 1)} />
        {step === summaryStep && <>
        <Card>
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text="あなたの防災[ぼうさい]4つのチカラ" />
          </p>
          <p className="mt-1 text-13 text-ink-muted">今回の判断を振り返り、次の備えにつなげましょう。</p>
          <div className="mt-3 flex flex-col gap-2">
            {AXES.map((axis) => {
              const score = scores[axis];
              return (
                <div key={axis} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-display text-xs font-bold text-ink-muted">
                    <Furigana text={AXIS_LABEL[axis]} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <Meter value={score === null ? 0 : score / 5} />
                  </span>
                  <span className="shrink-0 text-right">
                    {score === null ? (
                      // 出題されなかった軸。点をつけずに、そう書く。
                      <span className="text-11 text-ink-faint">{adult ? "対象なし" : "今回はなし"}</span>
                    ) : (
                      <>
                        <span className="font-display text-xs font-bold text-primary-ink">
                          {score}
                        </span>
                        <span className="text-11 text-ink-soft">/5</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>


        {wins.length > 0 ? (
          <div className="rounded-tile bg-safe-soft p-4">
            <p className="font-display text-sm font-bold text-safe">✓ {adult ? "適切に判断できたこと" : "できたこと"} <span className="ml-2 rounded-full bg-safe px-2 py-1 text-white">{wins.length}件達成</span></p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {wins.map((w, i) => (
                <li key={i} className="flex items-start gap-2 rounded-field bg-surface p-3 text-13 text-ink">
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-safe text-white">✓</span><Furigana text={w} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <AftermathCard photoUrl={photoUrl} risks={risks} />

        </>}
        {step < summaryStep && <Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="えらんだ行動[こうどう]のふりかえり" />
          </p>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="この場面[ばめん]で、何[なに]をどうするか確認[かくにん]しよう。" />
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {review.slice(step, step + 1).map(({ id, q, c, timedOut }) => (
              <ActionReview key={id} question={q} choice={c} timedOut={!!timedOut} number={step + 1} />
            ))}
          </div>
        </Card>}

        {step === checklistStep && <><Card className="p-[18px]">
          <h2 className="text-lg font-bold">室内の備え</h2>
          <p className="mt-2 font-bold text-safe" role="status">{risks.filter(r => checked.includes(`prepared:${r.id}`)).length} / {risks.length} か所 対策済み</p>
          <ul className="mt-3 space-y-2">{risks.map(r => <li key={r.id}><label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-field bg-canvas p-3"><input type="checkbox" checked={checked.includes(`prepared:${r.id}`)} onChange={() => toggleChecked(`prepared:${r.id}`)} className="size-5 accent-teal-700" /><span className="flex-1"><Furigana text={r.name} adult={r.adultName} /></span><span className="text-sm font-bold text-safe">{checked.includes(`prepared:${r.id}`) ? "対策済み！" : "対策したらチェック"}</span></label></li>)}</ul>
        </Card>

          <EvacuationGuide />
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-ink-muted">
              <Furigana text="次は、避難場所[ひなんばしょ]までの道を確認しよう。" adult="次は、避難場所までの経路を確認します。" />
            </p>
            <Button onClick={() => router.push("/evac")}>フェーズ2へ</Button>
          </div>
          <button
            type="button"
            className="min-h-11 self-center px-4 py-2 text-13 font-bold text-primary-ink underline underline-offset-4"
            onClick={() => {
              reset();
              router.push("/camera");
            }}
          >
            <Furigana text="もういちど挑戦[ちょうせん]" />
          </button>
        </>}
        <nav aria-label="結果のページ切り替え" className="sticky bottom-0 flex gap-3 border-t border-border bg-canvas py-3">
          <Button variant="outline" size="md" disabled={step === 0} onClick={() => moveStep(step - 1)}>戻る</Button>
          <Button size="md" onClick={() => step < lastStep ? moveStep(step + 1) : router.push("/share")}>{step < lastStep ? "次へ" : <Furigana text="結果を共有" adult="結果を保存・共有" />}</Button>
        </nav>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
