"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { AftermathCard } from "@/components/AftermathCard";
import { AXIS_LABEL, CHECKLIST, QUESTIONS, safetyBand, type Axis } from "@/lib/content";
import { useHaptics } from "@/lib/settings";
import { getSession, overallSafety, scoreByAxis, strengths, useSession } from "@/lib/session";

const AXES: Axis[] = ["initial", "judgement", "room", "evacuation"];

export default function ResultPage() {
  const router = useRouter();
  const { answers, risks, checked, photoUrl, toggleChecked, reset } = useSession();
  const vibrate = useHaptics();

  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const wins = useMemo(() => strengths(answers), [answers]);
  // 設問ごとの正誤ではなく、ぜんたいの傾向としてまとめて見せる
  const overall = useMemo(() => safetyBand(overallSafety(answers)), [answers]);

  // ふりかえり。答えた順に、選んだ行動と解説を並べる。
  // 1問ずつの安全度は出さない（結果は全部終わってからまとめて見せる方針）。
  const review = useMemo(
    () =>
      answers.flatMap((a) => {
        const q = QUESTIONS.find((x) => x.id === a.questionId);
        const c = q?.choices.find((x) => x.id === a.choiceId);
        return q && c ? [{ id: a.questionId, q, c, timedOut: a.timedOut }] : [];
      }),
    [answers],
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

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center gap-2 px-6 pt-3">
          <span className="shrink-0 rounded-field bg-primary-soft px-2 py-0.5 font-display text-xs font-black whitespace-nowrap text-primary-ink">
            ジシンゴト
          </span>
          <h1 className="font-display text-lg font-bold text-ink">
            <Furigana text="防災[ぼうさい]シミュレーション結果[けっか]" />
          </h1>
        </div>
      </div>

      <div className="animate-rise flex flex-col gap-4 px-6 pt-3 pb-6">
        <AftermathCard photoUrl={photoUrl} risks={risks} />

        <Card>
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text="あなたの防災[ぼうさい]4つのチカラ" />
          </p>
          <p className="mt-1 text-13 text-ink-muted">
            ぜんたいとしては
            <span className="font-display font-bold" style={{ color: overall.color }}>
              「<Furigana text={overall.label} />」
            </span>
            よりの行動が多かったよ。
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
                      <span className="text-11 text-ink-faint">今回はなし</span>
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
            <p className="font-display text-sm font-bold text-safe">◎ できたこと</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {wins.map((w, i) => (
                <li key={i} className="text-13 text-ink-muted">
                  ・<Furigana text={w} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="えらんだ行動[こうどう]のふりかえり" />
          </p>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="ひとつずつ開[ひら]いて、なぜそうなのか読[よ]んでみてね。" />
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {review.map(({ id, q, c, timedOut }, i) => (
              <details key={id} className="rounded-field bg-canvas p-3">
                <summary className="cursor-pointer list-none">
                  <span className="font-display text-11 font-bold text-primary-ink">
                    Q{i + 1}　<Furigana text={q.category} />
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="flex-1 font-display text-13 font-bold text-ink">
                      {timedOut ? "時間切れ：" : ""}
                      <Furigana text={c.label} />
                    </span>
                    <span aria-hidden className="text-ink-soft">
                      ＋
                    </span>
                  </span>
                </summary>
                <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                  <p className="text-11 text-ink-soft">
                    <Furigana text={q.situation} />
                  </p>
                  {c.explanation.map((t, j) => (
                    <p key={j} className="text-13 leading-[1.6] text-ink-muted">
                      <Furigana text={t} />
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Card>

        <Card className="p-[18px]">
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

        <div className="flex gap-3">
          <Button
            size="md"
            variant="outline"
            onClick={() => {
              reset();
              router.push("/camera");
            }}
          >
            <Furigana text="もういちど挑戦[ちょうせん]" />
          </Button>
          <Button size="md" onClick={() => router.push("/share")}>
            <Furigana text="結果[けっか]をシェア" />
          </Button>
        </div>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
