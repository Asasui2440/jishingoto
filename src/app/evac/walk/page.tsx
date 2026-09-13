"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EventSheet } from "@/components/evac/EventSheet";
import { StreetStage } from "@/components/evac/StreetStage";
import { EvacMap } from "@/components/evac/EvacMap";
import { BottomSheet, GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { Button } from "@/components/ui/Button";
import { plain } from "@/components/ui/Furigana";
import { formatDistance, formatDuration, getEvac } from "@/lib/evac";
import { walkedPath } from "@/lib/evac-walk";
import { useEvacWalk } from "@/lib/use-evac-walk";
import styles from "./walk.module.css";

export default function EvacWalkPage() {
  const router = useRouter();
  const [sheet, setSheet] = useState<"map" | "help" | null>(null);
  const [readyStepId, setReadyStepId] = useState<string | null>(null);
  const [announcedPointId, setAnnouncedPointId] = useState<string | null>(null);
  const game = useEvacWalk({ readyStepId, paused: sheet !== null });
  const { evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, advance, choose, timerOverride, setTimerOverride, retry } = game;
  const { mode, home, shelter, walk, decisions, timerSeconds, update } = evac;
  const ready = !!step && readyStepId === step.id;
  const announcingPoint = !!pending && ready && announcedPointId !== step?.pointId;
  const decisionVisible = !!pending && ready && !announcingPoint;
  useEffect(() => {
    const state = getEvac();
    if (!state.startRouteId || !state.shelter) router.replace("/evac");
    else if (state.finishedAt) router.replace("/evac/report");
  }, [router]);
  useEffect(() => {
    if (!announcingPoint || !step?.pointId) return;
    const pointId = step.pointId;
    const timer = setTimeout(() => setAnnouncedPointId(pointId), 1000);
    return () => clearTimeout(timer);
  }, [announcingPoint, step?.pointId]);

  if (!route || !step || !walk || !home || !shelter) return <GameShell>
    <GameHeader title="道を準備しています" step={2} onBack={() => router.push("/evac/routes")} />
    <main className="m-auto flex flex-col gap-4 p-6 text-center">
      <p role={error ? "alert" : "status"}>{error ?? "途中の判断ポイントを確認しています…"}</p>
      {error ? <><Button onClick={retry}>もう一度試す</Button><Button variant="outline" onClick={() => { update({ analysisMode: "sample", walk: null }); retry(); }}>固定の練習問題で始める</Button></> : null}
    </main>
  </GameShell>;

  const moving = walking && ready && !pending && !notice && !arrived && !busy && !sheet;
  const events = walk.steps.filter(s => s.event);
  const decisionIndex = events.findIndex(s => s.pointId === step.pointId);
  const next = walk.steps[walk.index + 1];
  const turn = next ? ((next.heading - step.heading + 540) % 360) - 180 : 0;
  const forward = () => { if (ready && !busy && !pending) advance(); };
  const showSheet = (next: "map" | "help") => { setWalking(false); setSheet(next); };

  return <GameShell className={styles.shell}>
    <GameHeader title={arrived ? "避難先に到着" : "道を歩いてみよう"} subtitle={plain(shelter.name)} step={2}
      onBack={() => { setWalking(false); router.push("/evac/routes"); }} onHelp={() => showSheet("help")} />
    <main className={styles.main} aria-label="避難ルートの体験">
      <div className={styles.status}>
        <span className="rounded-full bg-primary-soft px-2 py-1 text-11 font-bold text-primary-ink">想定シナリオ</span>
        <span className="text-11 text-ink-muted">判断 {decisions.length} / {events.length}</span>
      </div>
      <div className={styles.scene}>
        <StreetStage position={step.position} heading={step.heading} kind={pending?.kind ?? null}
          zone={ready ? pending?.zone : null} zoneNumber={decisionIndex + 1} height="100%" demo={mode === "mock"}
          sceneKey={step.id} onSettled={setReadyStepId} showArrow={ready && !pending && !notice && !arrived}
          walking={moving} onAdvance={!walking && ready && !pending && !notice && !arrived ? forward : undefined}
          arrived={arrived && ready} turn={Math.abs(turn) >= 25 ? turn : null}>
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className="rounded-xl bg-black/70 px-3 py-2 text-11 font-bold text-white">残り {formatDistance(arrived ? 0 : step.remainingM)}<br />{formatDuration(arrived ? 0 : step.remainingS)}</span>
            <button type="button" onClick={() => showSheet("map")} className="pointer-events-auto inline-flex min-h-11 items-center gap-1 rounded-full bg-white px-3 text-11 font-bold text-ink"><GameIcon name="route" className="size-4" />地図</button>
          </div>
          {announcingPoint ? <div role="status" data-testid="attention-toast" className={styles.attentionToast}><span aria-hidden>⚠</span><span>注意ポイントだよ</span></div> : null}
        </StreetStage>
      </div>
      {error ? <p role="alert" className="mx-4 rounded-xl bg-warn-soft p-3 text-11">{error}</p> : null}
      {decisionVisible ? <EventSheet key={step.pointId} event={pending} index={decisionIndex} total={events.length}
        seconds={timerOverride ?? timerSeconds} viewingStreet={sheet !== null || !ready} busy={busy}
        onExtend={remaining => setTimerOverride(remaining + 10)} onDisableTimer={() => setTimerOverride(0)} onChoose={choose} />
        : <section className={styles.actions} aria-label="歩行の操作">
          <p role="status" className="text-11 leading-relaxed text-ink-muted">{!ready ? "風景を読み込んでいます…" : announcingPoint ? "注意ポイントを確認しています…" : notice ?? (arrived ? "通った道と選んだ行動をふりかえろう。" : moving ? "歩いています。判断地点で止まります。" : "ドラッグで周りを見回せます。")}</p>
          {pending ? null : arrived ? <Button disabled={!ready} onClick={() => { update({ finishedAt: Date.now() }); router.push("/evac/report"); }}>ふりかえる</Button>
            : <div className="flex gap-2">
              <Button size="md" disabled={!ready || busy} onClick={forward}><GameIcon name="walk" />{notice ? "先へ進む" : "進む"}</Button>
              <Button size="md" variant="outline" disabled={!ready || busy} onClick={() => { if (notice) advance(); setWalking(!walking); }}><GameIcon name={walking ? "pause" : "play"} />{walking ? "一時停止" : "自動で歩く"}</Button>
            </div>}
        </section>}
    </main>
    <BottomSheet open={sheet === "map"} title="いまいる場所と通った道" onClose={() => setSheet(null)}>
      <EvacMap mode={mode} center={step.position} home={home} shelters={[shelter]} selectedShelterId={shelter.id} routes={[route]} activeRouteId={route.id}
        walker={step.position} walkerHeading={step.heading} traveledPath={walkedPath(walk)} height={250} />
      <p className="my-3 text-13 text-ink-muted">残り {formatDistance(step.remainingM)}・{formatDuration(step.remainingS)}。風景に戻って進めます。</p>
      <Button size="md" onClick={() => setSheet(null)}>Street Viewに戻る</Button>
    </BottomSheet>
    <BottomSheet open={sheet === "help"} title="歩き方・設定" onClose={() => setSheet(null)}>
      <div className="space-y-4 text-13 leading-relaxed text-ink-muted">
        <p>風景をドラッグして見回し、「進む」か白い矢印で前に進みます。「自動で歩く」でも判断地点で止まります。</p>
        <p>途中で起こる場面を想定して、行動を選びましょう。説明や地図を開いている間、判断のタイマーは停止します。</p>
        <p>風景はGoogle Street Viewです。枠やイラストは練習用の想定で、実際の被害や画像解析の結果ではありません。風景が利用できない場合は想定図を表示します。</p>
        <Button size="md" variant="outline" disabled={!ready || busy || !!pending || arrived} onClick={() => { setSheet(null); advance(true); }}>次の判断ポイントへ進む</Button>
      </div>
    </BottomSheet>
  </GameShell>;
}
