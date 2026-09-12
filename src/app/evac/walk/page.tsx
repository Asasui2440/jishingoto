"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EventSheet } from "@/components/evac/EventSheet";
import { StreetViewPanel } from "@/components/evac/StreetViewPanel";
import { EvacModeBadge } from "@/components/evac/EvacMode";
import { EvacMap } from "@/components/evac/EvacMap";
import { RouteLegend } from "@/components/evac/RouteLegend";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { SCENARIO_BADGE } from "@/lib/evac-content";
import { formatDistance, formatDuration, getEvac } from "@/lib/evac";
import { walkedPath, walkDistance } from "@/lib/evac-walk";
import { useEvacWalk } from "@/lib/use-evac-walk";

export default function EvacWalkPage() {
  const router = useRouter();
  const { evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, advance, choose, timerOverride, setTimerOverride, retry } = useEvacWalk();
  const { mode, home, shelter, walk, decisions, timerSeconds, update } = evac;
  const [observingStepId, setObservingStepId] = useState<string | null>(null);

  useEffect(() => {
    const current = getEvac();
    if (!current.startRouteId || !current.shelter) router.replace("/evac");
    else if (current.finishedAt) router.replace("/evac/report");
  }, [router]);

  if (!route || !step || !walk || !home || !shelter) return <Screen><main className="flex flex-col gap-4 p-6">
    <h1 className="font-display text-xl font-bold text-ink">体験を準備しています</h1>
    <p role={error ? "alert" : "status"} className="text-13 leading-relaxed text-ink-muted">{error ?? (mode === "api" && evac.analysisMode !== "sample" ? "収録した地理データをAIが読み、注意を考える地点を選んでいます…" : "地図の体験を準備しています…")}</p>
    {error ? <><Button onClick={retry}>もう一度解析する</Button><Button variant="outline" onClick={() => { update({ analysisMode: "sample", walk: null }); retry(); }}>実地図と固定の練習問題で体験する</Button></> : null}
    <Button variant="quiet" onClick={() => router.push("/evac")}>地域・出題方法を選び直す</Button>
  </main></Screen>;

  const observing = observingStepId === step.id;
  const moving = walking && !pending && !notice && !arrived && !busy;
  const observe = (on: boolean) => {
    if (on) setWalking(false);
    setObservingStepId(on ? step.id : null);
  };
  const events = walk.steps.filter((s) => s.event);
  const traveled = walkedPath(walk);
  const distance = walkDistance(walk);
  const progress = arrived ? 1 : distance / Math.max(1, distance + step.remainingM);
  const currentEventNo = events.findIndex((s) => s.pointId === step.pointId);
  const markers = events.map((s, i) => ({
    id: s.pointId!, position: s.position, label: String(i + 1),
    color: decisions.some((d) => d.pointId === s.pointId) ? "#eee6cf" : "#ffcc00",
    title: `判断ポイント${i + 1}（練習用）`,
  }));

  return (
    <Screen>
      <main className="flex flex-1 flex-col gap-4 pt-4 pb-5">
        <header className="px-5">
          <EvacModeBadge mode={mode} />
          <p className="mb-2 text-11 text-primary-ink">{walk.source === "geo-ai" ? "地理データ＋AIで選んだ注意候補" : "固定の練習問題"}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-chip bg-primary-soft px-2 py-1 font-display text-11 font-bold text-primary-ink">フェーズ2 · 地図と風景</span>
            <button type="button" onClick={() => router.push("/evac/routes")} className="min-h-10 text-11 text-ink-muted underline underline-offset-4"><Furigana text="ルートを選[えら]び直[なお]す" /></button>
          </div>
          <h1 className="mt-2 font-display text-[1.6rem] leading-snug font-bold text-ink"><Furigana text={arrived ? "避難場所[ひなんばしょ]に到着[とうちゃく]" : pending ? "この先[さき]、どう進[すす]む？" : "もしもの道[みち]を、歩[ある]こう。"} /></h1>
          <p className="mt-1 truncate text-13 text-ink-muted"><Furigana text="目指[めざ]す場所[ばしょ]" />：<Furigana text={shelter.name} /></p>
        </header>

        <section className="mx-4 overflow-hidden rounded-panel border border-border bg-surface shadow-sm" aria-label="地図とStreet Viewの同時表示">
          <StreetViewPanel position={step.position} heading={step.heading} demo={!!route.demo} moving={moving} observing={observing} disabled={busy} onObservingChange={observe} />
          <div className="flex items-center justify-between gap-2 bg-primary-soft px-4 py-2.5">
            <span className="flex items-center gap-2 text-11 font-bold text-primary-ink"><span className="size-2 rounded-full bg-primary-mid" /><Furigana text={SCENARIO_BADGE} /></span>
            <span className="text-11 text-ink-muted">{decisions.length} / {events.length} <Furigana text="地点[ちてん]を体験[たいけん]" /></span>
          </div>
          <EvacMap mode={mode} center={home} home={home} shelters={[shelter]} selectedShelterId={shelter.id} routes={[route]} activeRouteId={route.id} markers={markers} walker={step.position} walkerHeading={step.heading} traveledPath={traveled} height={210} className="!rounded-none" />
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
            <RouteLegend />
            <Meter value={progress} color="var(--color-primary-mid)" track="var(--color-primary-soft)" height={5} />
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-11 text-ink-muted"><Furigana text="ゴールまで" /> <strong className="font-display text-lg text-ink">{formatDistance(arrived ? 0 : step.remainingM)}</strong></p>
              <span className="text-11 text-ink-muted">{formatDuration(step.remainingS)} <Furigana text="の想定[そうてい]" /></span>
            </div>
            {route.demo ? <p className="text-11 text-primary-ink"><Furigana text="練習用[れんしゅうよう]の経路[けいろ]です。実際[じっさい]の道路[どうろ]とは異[こと]なります。" /></p> : null}
          </div>
        </section>

        {walk.source === "geo-ai" && events.length === 0 ? <p className="mx-5 rounded-field bg-primary-soft p-3 text-13 text-ink-muted">今回の地形データから出題できる候補は見つかりませんでした。安全を確認した意味ではありません。地図と風景の確認は続けられます。</p> : null}

        {error ? <p role="alert" className="mx-5 rounded-tile bg-warn-soft p-3 text-13 text-ink">{error}</p> : null}

        {pending ? (
          <EventSheet key={`${step.pointId}:${timerOverride}`} event={pending} viewingStreet={observing} index={currentEventNo} total={events.length} seconds={timerOverride ?? timerSeconds} busy={busy} onExtend={() => setTimerOverride((timerOverride ?? timerSeconds) + 10)} onDisableTimer={() => setTimerOverride(0)} onChoose={choose} />
        ) : arrived ? (
          <section className="mx-5 rounded-panel bg-primary-soft p-5">
            <p className="font-display text-lg font-bold text-ink"><Furigana text="ひとつの道[みち]を、最後[さいご]まで。" /></p>
            <p className="mt-2 mb-4 text-13 leading-relaxed text-ink-muted"><Furigana text="選[えら]んだ行動[こうどう]と通[とお]った道[みち]を、まとめてふりかえりましょう。" /></p>
            <Button onClick={() => { update({ finishedAt: Date.now() }); router.push("/evac/report"); }}><Furigana text="地図[ちず]でふりかえる" /></Button>
          </section>
        ) : (
          <section className="mx-5 flex flex-col gap-3">
            <div aria-live="polite" className="rounded-tile bg-surface p-4">
              <p className="font-display text-15 font-bold text-ink"><Furigana text={notice ?? (walking ? "地図[ちず]の上[うえ]を移動中[いどうちゅう]…" : "周[まわ]りの道[みち]を見渡[みわた]してみよう" )} /></p>
              <p className="mt-1 text-13 leading-relaxed text-ink-muted"><Furigana text={notice ? "行動[こうどう]のふりかえりは、すべての地点[ちてん]を体験[たいけん]したあとに。" : "番号[ばんごう]の地点[ちてん]に着[つ]くと、自動[じどう]で止[と]まります。実際[じっさい]に外[そと]を歩[ある]く必要[ひつよう]はありません。"} /></p>
            </div>
            <Button disabled={observing} onClick={() => { if (notice) advance(); setWalking(!walking); }}><Furigana text={walking ? "一時停止[いちじていし]" : notice ? "続[つづ]きを歩[ある]く" : "コマを進[すす]める"} /></Button>
            <Button disabled={observing} variant="outline" size="md" onClick={() => { setWalking(false); advance(true); }}><Furigana text="次[つぎ]の判断[はんだん]ポイントへ" /></Button>
          </section>
        )}
      </main>
    </Screen>
  );
}
