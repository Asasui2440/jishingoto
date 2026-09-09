"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AftermathCard } from "@/components/AftermathCard";
import { ActionReview } from "@/components/ActionReview";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { RiskActions } from "@/components/RiskActions";
import { withAdultSituation } from "@/lib/api";
import { AXIS_LABEL, CHECKLIST, safetyBand, type Axis } from "@/lib/content";
import { useHaptics, useSettings } from "@/lib/settings";
import { getSession, overallSafety, scoreByAxis, strengths, useSession } from "@/lib/session";

const AXES: Axis[] = ["initial", "judgement", "room", "evacuation"];

export default function ResultPage() {
  const router = useRouter();
  const { answers, risks, questions, checked, photoUrl, toggleChecked, reset } = useSession();
  const vibrate = useHaptics();
  const { audience } = useSettings();
  const adult = audience === "adult";
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const riskCount = risks.filter((risk) => risk.confirmed).length;

  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const wins = useMemo(() => strengths(answers, questions, audience), [answers, questions, audience]);
  // 設問ごとの正誤ではなく、ぜんたいの傾向としてまとめて見せる
  const overall = useMemo(() => safetyBand(overallSafety(answers)), [answers]);

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

  // 見つかった危険に合わせてチェックリストを絞る
  const items = useMemo(() => {
    const kinds = new Set(risks.filter((r) => r.confirmed).map((r) => r.kind));
    const relevant = CHECKLIST.filter((c) => !c.riskKind || kinds.has(c.riskKind));
    return relevant.length >= 3 ? relevant : CHECKLIST;
  }, [risks]);

  // 「今日すぐにできること」などの区分ごとにまとめる
  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      map.set(item.group, [...(map.get(item.group) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  const summaryStep = 1 + riskCount + review.length;
  const lastStep = summaryStep + 1;
  const stepLabel = step === 0 ? "地震後の部屋を見てみよう"
    : step <= riskCount ? `危険箇所 ${step} / ${riskCount}`
    : step < summaryStep ? `行動の振り返り ${step - riskCount} / ${review.length}`
    : step === summaryStep ? "今回のまとめ" : "今日からできること";
  const moveStep = (next: number) => {
    setStep(next);
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
        <div hidden={step !== 0}>
          <AftermathCard photoUrl={photoUrl} risks={risks} />
          <p className="mt-3 text-13 text-ink-muted">このあと、危険箇所と対策をひとつずつ見ていきましょう。画像の作成中でも次へ進めます。</p>
        </div>
        {step > 0 && step <= riskCount && <RiskActions photoUrl={photoUrl} risks={risks} activeIndex={step - 1} />}

        {step === summaryStep && <>
        <Card>
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text="あなたの防災[ぼうさい]4つのチカラ" />
          </p>
          <p className="mt-1 text-13 text-ink-muted">
            {adult ? "総合的には" : "ぜんたいとしては"}
            <span className="font-display font-bold" style={{ color: overall.color }}>
              「<Furigana text={overall.label} />」
            </span>
            {adult ? "に近い行動が多く見られました。" : "よりの行動が多かったよ。"}
          </p>
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
            <p className="font-display text-sm font-bold text-safe">◎ {adult ? "適切だった行動" : "できたこと"}</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {wins.map((w, i) => (
                <li key={i} className="text-13 text-ink-muted">
                  ・<Furigana text={w} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        </>}
        {step > riskCount && step < summaryStep && <Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="えらんだ行動[こうどう]のふりかえり" />
          </p>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="絵[え]を見[み]ながら、この場面[ばめん]での動[うご]きを確認[かくにん]しよう。" />
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {review.slice(step - riskCount - 1, step - riskCount).map(({ id, q, c, timedOut }) => (
              <ActionReview key={id} question={q} choice={c} timedOut={!!timedOut} number={step - riskCount} />
            ))}
          </div>
        </Card>}

        {step === lastStep && <><Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="部屋[へや]をさらに安全[あんぜん]にするためのチェックリスト" />
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {groups.map(([group, list]) => (
              <div key={group} className="rounded-field bg-canvas p-2.5">
                <p className="font-display text-11 font-bold text-primary-ink">
                  <Furigana text={group} />
                </p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {list.map((item) => {
                    const on = checked.includes(item.id);
                    return (
                      <li key={item.id}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              vibrate();
                              toggleChecked(item.id);
                            }}
                            className="sr-only"
                          />
                          <span
                            aria-hidden
                            className={[
                              "grid size-[18px] shrink-0 place-items-center rounded border-2 transition-colors",
                              on ? "border-primary-mid bg-primary" : "border-border bg-surface",
                            ].join(" ")}
                          >
                            {on ? (
                              <svg viewBox="0 0 14 14" className="size-3" aria-hidden>
                                <path
                                  d="M2.5 7.5 5.5 10.5 11.5 3.5"
                                  fill="none"
                                  stroke="var(--color-ink)"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </span>
                          <span
                            className={[
                              "flex-1 text-13",
                              on ? "text-ink-faint line-through" : "text-ink",
                            ].join(" ")}
                          >
                            <Furigana text={item.text} />
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>


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
          <Button size="md" onClick={() => step < lastStep ? moveStep(step + 1) : router.push("/share")}>{step < lastStep ? "次へ" : <Furigana text="結果[けっか]をシェア" />}</Button>
        </nav>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
