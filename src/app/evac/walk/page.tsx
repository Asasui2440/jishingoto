"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { EventSheet } from "@/components/evac/EventSheet";
import { StreetViewPanel } from "@/components/evac/StreetViewPanel";
import { EvacMap } from "@/components/evac/EvacMap";
import { RouteLegend } from "@/components/evac/RouteLegend";
import { BottomSheet, GameHeader, GameIcon, GameShell, Toast } from "@/components/evac/GameUI";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Furigana, plain } from "@/components/ui/Furigana";
import { MAP_NOTE, SCENARIO_NOTE } from "@/lib/evac-content";
import { formatDistance, formatDuration, getEvac } from "@/lib/evac";
import { walkedPath, walkDistance } from "@/lib/evac-walk";
import { useEvacWalk } from "@/lib/use-evac-walk";
import styles from "./walk.module.css";

export default function EvacWalkPage() {
  const router = useRouter();
  const { evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, advance, choose, timerOverride, setTimerOverride, retry } = useEvacWalk();
  const { mode, home, shelter, walk, decisions, timerSeconds, update } = evac;
  const [observingStepId, setObservingStepId] = useState<string | null>(null);
  const [streetViewMounted, setStreetViewMounted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);

  useEffect(() => {
    const current = getEvac();
    if (!current.startRouteId || !current.shelter) router.replace("/evac");
    else if (current.finishedAt) router.replace("/evac/report");
  }, [router]);

  if (!route || !step || !walk || !home || !shelter) return <GameShell>
    <GameHeader title="体験を準備中" step={2} onBack={() => router.push("/evac/routes")} />
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-primary-soft"><GameIcon name="walk" className="size-9 text-primary-ink" /></span>
      <p role={error ? "alert" : "status"} className="text-13 leading-relaxed text-ink-muted">{error ?? "ルート上の判断ポイントを準備しています…"}</p>
      {error ? <div className="flex w-full flex-col gap-2"><Button size="md" onClick={retry}>もう一度試す</Button><Button size="md" variant="outline" onClick={() => { update({ analysisMode: "sample", walk: null }); retry(); }}>固定の練習問題で始める</Button></div> : <span className="h-1.5 w-24 animate-pulse rounded-full bg-primary" />}
      <Button size="md" variant="quiet" onClick={() => router.push("/evac")}>設定を見直す</Button>
    </main>
  </GameShell>;

  const observing = observingStepId === step.id;
  const moving = walking && !pending && !notice && !arrived && !busy;
  const observe = (on: boolean) => {
    if (on) { setWalking(false); setStreetViewMounted(true); }
    setObservingStepId(on ? step.id : null);
  };
  const events = walk.steps.filter((s) => s.event);
  const traveled = walkedPath(walk);
  const distance = walkDistance(walk);
  const progress = arrived ? 1 : distance / Math.max(1, distance + step.remainingM);
  const currentEventNo = events.findIndex((s) => s.pointId === step.pointId);
  const noticeId = `${step.id}:${notice}`;
  const markers = events.map((s, i) => ({
    id: s.pointId!, position: s.position, label: String(i + 1),
    color: decisions.some((d) => d.pointId === s.pointId) ? "#eee6cf" : "#ffcc00",
    title: `判断ポイント${i + 1}（練習用）`,
  }));

  return <GameShell className={styles.shell}>
    <GameHeader title={arrived ? "ゴール！" : pending ? "どう進む？" : "もしもの道を歩こう"} subtitle={plain(shelter.name)} step={2} onBack={() => { setWalking(false); router.push("/evac/routes"); }} onHelp={() => { setWalking(false); setShowHelp(true); }} />
    <main className="flex min-h-0 flex-1 flex-col" aria-label="避難ルートの体験">
      <div className={`${styles.status} flex shrink-0 items-center gap-3 px-4 pb-2`}>
        <span className="rounded-full bg-primary-soft px-2 py-1 text-[10px] font-bold text-primary-ink">想定シナリオ</span>
        <div className="flex flex-1 items-center justify-end gap-1.5" aria-label={`${decisions.length}地点を体験済み`}>
          {events.map((event, i) => <span key={event.pointId} className={`grid size-6 place-items-center rounded-full text-[10px] font-bold ${decisions.some((d) => d.pointId === event.pointId) ? "bg-ink text-white" : event.pointId === step.pointId ? "bg-primary text-ink ring-2 ring-primary-soft" : "bg-canvas text-ink-muted"}`}>
            {decisions.some((d) => d.pointId === event.pointId) ? <GameIcon name="check" className="size-3.5" /> : i + 1}
          </span>)}
        </div>
      </div>
      <section className={`${styles.map} relative mx-3 flex flex-1 flex-col overflow-hidden rounded-[24px] border border-border bg-canvas`} aria-label="体験中の地図">
        <WalkMap mode={mode} center={home} home={home} shelters={[shelter]} selectedShelterId={shelter.id} routes={[route]} activeRouteId={route.id} markers={markers} walker={step.position} walkerHeading={step.heading} traveledPath={traveled} />
      </section>
      <div className={`${styles.progress} shrink-0 px-4 py-2`}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-11 text-ink-muted"><GameIcon name="flag" className="size-4" /><strong className="font-display text-15 text-ink">{formatDistance(arrived ? 0 : step.remainingM)}</strong><span>・{formatDuration(arrived ? 0 : step.remainingS)}</span></span>
          <button type="button" disabled={busy} onClick={() => observe(!observing)} aria-pressed={observing} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-11 font-bold text-primary-ink disabled:opacity-50"><GameIcon name={observing ? "back" : "eye"} className="size-4" />{observing ? "体験に戻る" : "周りを見る"}</button>
        </div>
        <Meter value={progress} color="var(--color-primary-mid)" track="var(--color-primary-soft)" height={4} />
      </div>
      {error ? <p role="alert" className="mx-4 mb-2 max-h-20 shrink-0 overflow-y-auto rounded-xl bg-warn-soft px-3 py-2 text-11 leading-relaxed text-ink">{error}</p> : null}
      {streetViewMounted ? <div className={observing ? "mx-3 mb-2 shrink-0 overflow-hidden rounded-[20px] border border-border" : "hidden"}><StreetViewPanel position={step.position} heading={step.heading} demo={!!route.demo} moving={moving} observing={observing} disabled={busy} onObservingChange={observe} /></div> : null}
      <div className={observing ? "hidden" : "contents"}>
        {pending ? <EventSheet key={step.pointId} event={pending} viewingStreet={observing || showHelp} index={currentEventNo} total={events.length} seconds={timerOverride ?? timerSeconds} busy={busy} onExtend={(remaining) => setTimerOverride(remaining + 10)} onDisableTimer={() => setTimerOverride(0)} onChoose={choose} /> : arrived ? <section className="shrink-0 px-4 pb-3">
          <Button size="md" onClick={() => { update({ finishedAt: Date.now() }); router.push("/evac/report"); }}><GameIcon name="flag" className="size-5" />ふりかえる</Button>
        </section> : <section className="shrink-0 px-4 pb-3">
          {walk.source === "geo-ai" && events.length === 0 ? <p className="mb-2 rounded-xl bg-primary-soft px-3 py-2 text-11 leading-relaxed text-ink-muted">出題できる地点はありませんでした。安全を確認した意味ではありません。</p> : null}
          <div className="mb-2 flex items-center justify-between gap-2 text-11 text-ink-muted" aria-live="polite"><span>{notice ? "選んだ行動を記録しました" : moving ? "次のポイントで自動停止" : "地図のコマを動かして体験"}</span><span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${moving ? "animate-pulse bg-primary-mid" : "bg-ink-muted"}`} />{moving ? "移動中" : "停止中"}</span></div>
          <div className="flex gap-2">
            <Button size="md" disabled={observing} onClick={() => { if (notice) advance(); setWalking(!walking); }}><GameIcon name={walking ? "pause" : "play"} className="size-5" /><Furigana text={walking ? "一時停止[いちじていし]" : notice ? "続[つづ]きを歩[ある]く" : "歩[ある]き始[はじ]める"} /></Button>
            <button type="button" disabled={observing} onClick={() => { setWalking(false); advance(true); }} className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-11 font-bold text-primary-ink disabled:opacity-50" aria-label="次の判断ポイントへ進む">次の地点<GameIcon name="chevron" className="size-4" /></button>
          </div>
        </section>}
      </div>
    </main>
    <BottomSheet open={showHelp} title="歩き方と地図" onClose={() => setShowHelp(false)}>
      <div className="flex flex-col gap-5 pb-2 text-13 leading-relaxed text-ink-muted">
        <div className="grid grid-cols-3 gap-2 text-center text-11 font-bold text-ink"><div className="rounded-2xl bg-primary-soft p-3"><GameIcon name="play" className="mx-auto mb-2 size-6" />コマを進める</div><div className="rounded-2xl bg-primary-soft p-3"><GameIcon name="eye" className="mx-auto mb-2 size-6" />周りを見る</div><div className="rounded-2xl bg-primary-soft p-3"><GameIcon name="route" className="mx-auto mb-2 size-6" />行動を選ぶ</div></div>
        <p>番号の地点で自動停止します。外を歩く必要はありません。風景や説明を見ている間はタイマーも停止します。</p>
        <RouteLegend />
        <p><Furigana text={MAP_NOTE} /></p>
        <p><Furigana text={SCENARIO_NOTE} /></p>
        <p className="text-11">{mode === "mock" ? "模式図・サンプルの風景" : "Google マップ・Street View"} / {walk.source === "geo-ai" ? "地理データから選んだ練習問題" : "固定の練習問題"}</p>
        {route.demo ? <p>この経路は練習用です。実際の道路とは異なります。</p> : null}
        <Button size="md" variant="outline" onClick={() => router.push("/evac/routes")}>ルートを選び直す</Button>
      </div>
    </BottomSheet>
    <Toast message={notice && noticeId !== dismissedNotice ? notice : null} onDismiss={() => setDismissedNotice(noticeId)} />
  </GameShell>;
}

/** Keep map controls and attribution in view as the action panel changes height. */
function WalkMap(props: ComponentProps<typeof EvacMap>) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(220);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setHeight(Math.max(52, entry.contentRect.height - (props.mode === "mock" ? 27 : 0))));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [props.mode]);
  return <div ref={box} className="absolute inset-0"><EvacMap {...props} height={height} className="!rounded-none" /></div>;
}
