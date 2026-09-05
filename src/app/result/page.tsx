"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { AXIS_LABEL, CHECKLIST, safetyBand, type Axis } from "@/lib/content";
import { useHaptics } from "@/lib/settings";
import { getSession, overallSafety, scoreByAxis, strengths, useSession } from "@/lib/session";

const AXES: Axis[] = ["initial", "judgement", "room", "evacuation"];

export default function ResultPage() {
  const router = useRouter();
  const { answers, risks, checked, toggleChecked, reset } = useSession();
  const vibrate = useHaptics();

  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const wins = useMemo(() => strengths(answers), [answers]);
  // 設問ごとの正誤ではなく、ぜんたいの傾向としてまとめて見せる
  const overall = useMemo(() => safetyBand(overallSafety(answers)), [answers]);

  // シミュレーションをやっていなければ最初から
  useEffect(() => {
    if (getSession().answers.length === 0) router.replace("/");
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
            {AXES.map((axis) => (
              <div key={axis} className="flex items-center gap-2">
                <span className="w-20 shrink-0 font-display text-xs font-bold text-ink-muted">
                  <Furigana text={AXIS_LABEL[axis]} />
                </span>
                <span className="min-w-0 flex-1">
                  <Meter value={scores[axis] / 5} />
                </span>
                <span className="shrink-0">
                  <span className="font-display text-xs font-bold text-primary-ink">{scores[axis]}</span>
                  <span className="text-11 text-ink-soft">/5</span>
                </span>
              </div>
            ))}
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
