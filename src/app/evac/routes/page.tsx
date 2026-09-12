"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EvacModeBadge } from "@/components/evac/EvacMode";
import { EvacMap } from "@/components/evac/EvacMap";
import { Tag } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { TIMER_PRESETS, fetchRoutes } from "@/lib/evac-api";
import { SCENARIO_NOTE, type RouteOption } from "@/lib/evac-content";
import { formatDistance, formatDuration, getEvac, useEvac } from "@/lib/evac";

/**
 * フェーズ2 ②：候補経路の比較。
 *
 * 「候補経路を二つ以上比較する」が行動目標（仕様 2）なので、
 * 2本を必ず並べ、開いた経路を記録する。
 * どちらが安全かは断定せず、距離・時間・イベント数と、
 * 経路データから言える事実だけを出す（仕様 5・11）。
 */
export default function EvacRoutesPage() {
  const router = useRouter();
  const { mode, analysisMode, home, shelter, routes, startRouteId, timerSeconds, update } = useEvac();
  const [loading, setLoading] = useState(true);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // 自宅と避難場所が決まっていなければ最初へ戻す
  useEffect(() => {
    const s = getEvac();
    if (!s.home || !s.shelter) router.replace("/evac");
  }, [router]);

  useEffect(() => {
    if (!home || !shelter) return;
    let alive = true;
    void fetchRoutes(home, shelter, mode).then((list) => {
      if (!alive) return;
      update({ routes: list, startRouteId: list[0]?.id ?? null, walk: null, decisions: [], takenRouteIds: [], followUp: null, finishedAt: null });
      setOpenedIds(list[0] ? [list[0].id] : []);
      setLoading(false);
    }).catch((err: unknown) => {
      if (!alive) return;
      update({ routes: [], startRouteId: null, walk: null, decisions: [], takenRouteIds: [] });
      setError(err instanceof Error ? err.message : "徒歩ルートを取得できませんでした。");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // 家と避難場所が決まったときに1回取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home?.lat, home?.lng, shelter?.id, mode, attempt]);

  const active = useMemo(
    () => routes.find((r) => r.id === startRouteId) ?? null,
    [routes, startRouteId],
  );

  const select = (r: RouteOption) => {
    update({ startRouteId: r.id });
    setOpenedIds((prev) => (prev.includes(r.id) ? prev : [...prev, r.id]));
  };

  const comparedEnough = openedIds.length >= Math.min(2, routes.length);

  return (
    <Screen>
      <main className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
        <header>
          <EvacModeBadge mode={mode} />
          <h1 className="font-display text-xl font-bold text-ink">
            <Furigana text={routes.length === 1 && !loading ? "この道[みち]を確[たし]かめよう" : "どちらの道[みち]で行[い]く？"} />
          </h1>
          <p className="mt-1 text-13 text-ink-muted">
            <Furigana text={routes.length === 1 && !loading ? "取得[しゅとく]できた徒歩[とほ]ルートは1本[ぽん]です。距離[きょり]や時間[じかん]を確認[かくにん]して進[すす]めます。" : "2本[ほん]とも開[ひら]いて、距離[きょり]・時間[じかん]・注意点[ちゅういてん]をくらべてみてね。"} />
          </p>
        </header>

        {loading ? (
          <p className="text-13 text-ink-muted"><Furigana text="経路をさがしています..." /></p>
        ) : error ? (
          <Card className="p-5">
            <p role="alert" className="text-13 text-ink-muted">{error}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button onClick={() => { setError(null); setLoading(true); setAttempt((n) => n + 1); }}>もう一度取得する</Button>
              <Button variant="outline" onClick={() => router.push("/evac")}>場所・バージョンを選び直す</Button>
            </div>
          </Card>
        ) : (
          <>
            <EvacMap
              mode={mode}
              center={home ?? { lat: 35.7186, lng: 139.7237 }}
              home={home}
              shelters={shelter ? [shelter] : []}
              selectedShelterId={shelter?.id ?? null}
              routes={routes}
              activeRouteId={startRouteId}
              onSelectRoute={(id) => select(routes.find((r) => r.id === id)!)}
              height={220}
            />

            {mode === "api" ? <p className="rounded-field bg-primary-soft p-3 text-11 text-primary-ink">{analysisMode === "sample" ? "実際の地図と経路で、固定の練習問題を体験します。" : "開始後、収録済みの地形データをAIが読み、注意を考える地点を選びます。データ範囲外では解析を開始しません。"}</p> : null}

            {active?.demo ? <p className="rounded-field bg-primary-soft p-3 text-11 text-primary-ink">練習用の経路です。実際の道路や通行状況とは異なります。</p> : null}

            <ul className="flex flex-col gap-3">
              {routes.map((r) => {
                const on = r.id === startRouteId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => select(r)}
                      aria-pressed={on}
                      className={[
                        "w-full rounded-card border bg-surface p-4 text-left transition-colors",
                        on ? "border-primary-mid bg-primary-soft" : "border-border",
                      ].join(" ")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-display text-15 font-bold text-ink">
                          <Furigana text={r.label} />
                        </span>
                        <Tag
                          color={
                            r.kind === "short" ? "var(--color-primary-ink)" : "var(--color-safe)"
                          }
                          soft={
                            r.kind === "short"
                              ? "var(--color-primary-soft)"
                              : "var(--color-safe-soft)"
                          }
                        >
                          <Furigana text={openedIds.includes(r.id) ? "比べた" : "みてみる"} />
                        </Tag>
                      </span>

                      <span className="mt-2 flex items-center gap-3">
                        <span className="font-display text-lg font-black text-ink">
                          {formatDuration(r.durationS)}
                        </span>
                        <span className="text-13 text-ink-muted">
                          {formatDistance(r.distanceM)}
                        </span>
                        <span className="text-13 text-ink-muted">
                          <Furigana text="判断[はんだん]" />
                          {mode === "api" && analysisMode !== "sample" ? "：AI解析後に表示" : `${r.eventCount}件`}
                        </span>
                      </span>

                      <span className="mt-2 block border-t border-border pt-2">
                        {r.notes.filter((n) => !(mode === "api" && analysisMode !== "sample" && n.includes("練習用"))).map((n) => (
                          <span key={n} className="block text-11 text-ink-muted">
                            ・<Furigana text={n} />
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {!comparedEnough ? (
              <p className="text-11 text-primary-ink">
                <Furigana text="もう1本[ぽん]も開[ひら]いてから決[き]めると、迂回[うかい]するときに迷[まよ]いにくくなります。" />
              </p>
            ) : null}

            <Card className="p-[18px]">
              <p className="font-display text-13 font-bold text-ink">
                <Furigana text="考[かんが]える時間[じかん]" />
              </p>
              <p className="mt-1 text-11 text-ink-soft">
                <Furigana text="災害時[さいがいじ]の「すぐ決[き]める」感[かん]じを出[だ]すための制限時間[せいげんじかん]です。延[の]ばす・なくすこともできます。" />
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {TIMER_PRESETS.map((t) => {
                  const on = timerSeconds === t.seconds;
                  return (
                    <label key={t.seconds} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="timer"
                        checked={on}
                        onChange={() => update({ timerSeconds: t.seconds })}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={[
                          "grid size-[18px] shrink-0 place-items-center rounded-full border-2",
                          on ? "border-primary-mid" : "border-border",
                        ].join(" ")}
                      >
                        {on ? <span className="size-2.5 rounded-full bg-primary-mid" /> : null}
                      </span>
                      <span className="text-13 text-ink">
                        <Furigana text={t.label} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </Card>

            <p className="text-11 text-ink-soft">
              <Furigana text={SCENARIO_NOTE} />
            </p>

            <div className="flex gap-3">
              <Button size="md" variant="quiet" onClick={() => router.push("/evac")}>
                <Furigana text="場所[ばしょ]を選[えら]び直[なお]す" />
              </Button>
              <Button
                size="md"
                disabled={!active}
                onClick={() => {
                  if (!active) return;
                  update({ takenRouteIds: [active.id], decisions: [], walk: null, followUp: null, startedAt: Date.now(), finishedAt: null });
                  router.push("/evac/walk");
                }}
              >
                <Furigana text="地図[ちず]で体験[たいけん]する" />
              </Button>
            </div>
          </>
        )}
      </main>
    </Screen>
  );
}
