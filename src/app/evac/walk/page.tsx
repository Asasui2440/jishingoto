"use client";

import { EVAC_SCENARIOS } from "@/lib/evac-scenario";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EventSheet } from "@/components/evac/EventSheet";
import { StreetStage } from "@/components/evac/StreetStage";
import { EvacMap } from "@/components/evac/EvacMap";
import { BottomSheet, GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { Button } from "@/components/ui/Button";
import { plain } from "@/components/ui/Furigana";
import { formatDistance, formatDuration, getEvac } from "@/lib/evac";
import { walkedPath } from "@/lib/evac-walk";
import { useEvacWalk } from "@/lib/use-evac-walk";
import { angleDifference, type StreetControls, type StreetSnapshot } from "@/lib/street-navigation";
import { useStreetRoutePlan } from "@/lib/use-street-route-plan";
import { plannedStreetLink, plannedReturnLink } from "@/lib/street-route-plan";
import styles from "./walk.module.css";

export default function EvacWalkPage() {
  const router = useRouter();
  const navigation = useRef<StreetControls>(null);
  const [street, setStreet] = useState<StreetSnapshot | null>(null);
  const [sheet, setSheet] = useState<"map" | "help" | null>(null);
  const [readyStepId, setReadyStepId] = useState<string | null>(null);
  const [announcedPointId, setAnnouncedPointId] = useState<string | null>(null);
  const game = useEvacWalk({ readyStepId, paused: sheet !== null });
  const { observeStreet, evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, advance, choose, timerOverride, setTimerOverride, retry } = game;
  const { mode, home, shelter, walk, decisions, timerSeconds, update } = evac;
  const { preparation, retry: retryPlan } = useStreetRoutePlan(route, street, mode === "api");
  const plan = preparation?.plan ?? null;
  const arrivalNode = plan?.nodes.at(-1) ?? street?.arrivalNode;
  const ready = mode === "api" ? preparation?.status === "ready" && !!street?.ready && !street.busy && !street.error : !!step && readyStepId === step.id;
  const onNavigation = useCallback((snapshot: StreetSnapshot) => {
    setStreet(snapshot);
    observeStreet({ ...snapshot, arrivalNode: plan?.nodes.at(-1) ?? snapshot.arrivalNode });
  }, [observeStreet, plan]);
  const offRoute = !!plan && !!street && !plan.nodes.some(node => node.pano === street.pano);
  const returnPano = !arrived ? plannedReturnLink(street, plan)?.pano ?? null : null;
  const automaticPano = !arrived ? plannedStreetLink(street, plan)?.pano ?? null : null;
  useEffect(() => {
    if (mode !== "api" || !walking || !ready || pending || notice || arrived || busy || sheet) return;
    if (!automaticPano) return;
    const timer = setTimeout(() => {
      if (!getEvac().walk?.street?.arrived) navigation.current?.move(automaticPano);
    }, 1600);
    return () => clearTimeout(timer);
  }, [mode, walking, ready, pending, notice, arrived, busy, sheet, automaticPano, street?.pano, setWalking]);
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

  const connectionChanged = ready && mode === "api" && !!plan && !offRoute && !arrived && !automaticPano;
  const decisionBlocking = !!pending && preparation?.status !== "error";
  const moving = (mode === "mock" || !!automaticPano) && walking && ready && !pending && !notice && !arrived && !busy && !sheet;
  const events = walk.steps.filter(s => s.event);
  const decisionIndex = events.findIndex(s => s.pointId === step.pointId);
  const next = walk.steps[walk.index + 1];
  const turn = next ? ((next.heading - step.heading + 540) % 360) - 180 : 0;
  const facingLink = street?.links.slice().sort((a, b) => Math.abs(angleDifference(a.heading, street.heading)) - Math.abs(angleDifference(b.heading, street.heading)))[0];
  const canForward = mode === "mock" || !!facingLink && !!street && Math.abs(angleDifference(facingLink.heading, street.heading)) < 60;
  const forward = () => {
    if (!ready || busy || pending || sheet) return;
    advance(); // Clears the notice; only mock mode changes the planned step here.
    if (mode === "api" && facingLink && canForward) navigation.current?.move(facingLink.pano);
  };
  const actualPosition = street?.position ?? walk.street?.position;
  const currentPosition = mode === "api" ? actualPosition ?? home : step.position;
  const remainingM = mode === "api" ? walk.street?.remainingM : step.remainingM;
  const remainingS = mode === "api" ? walk.street?.remainingS : step.remainingS;
  const remainingLabel = remainingM === undefined ? "現在地を確認しています" : `残り ${formatDistance(remainingM)}`;
  const timeLabel = remainingS === undefined ? "" : formatDuration(remainingS);
  const showSheet = (next: "map" | "help") => { setSheet(next); };

  return <GameShell className={styles.shell}>
    <GameHeader title={arrived ? "避難先付近に到着" : "道を歩いてみよう"} subtitle={`${EVAC_SCENARIOS[evac.scenario ?? "earthquake"].label}｜${plain(shelter.name)}`} step={2}
      onBack={() => { setWalking(false); router.push("/evac/routes"); }} onHelp={() => showSheet("help")} />
    <main className={styles.main} aria-label="避難ルートの体験">
      <div className={styles.status}>
        <span className="rounded-md bg-blue-50 px-2 py-1 text-11 font-bold text-blue-800">想定シナリオ</span>
        {mode === "api" && walk.source === "sample" ? <span className="text-11 text-ink-muted">固定の練習問題</span> : null}
        <span className="text-11 text-ink-muted">判断 {decisions.length} / {events.length}</span>
      </div>
      <div className={styles.scene}>
        <StreetStage initialPosition={walk.street?.position ?? walk.steps[0].position} demoPosition={step.position}
          navigationRef={navigation} onNavigation={onNavigation} recommendedPano={automaticPano} returnPano={returnPano} heading={step.heading} destination={shelter.position} arrivalEndpoint={route.path[route.path.length - 1]} kind={pending?.kind ?? null}
          zone={ready ? pending?.zone : null} zoneNumber={decisionIndex + 1} height="100%" demo={mode === "mock"}
          sceneKey={step.id} onSettled={setReadyStepId} showArrow={ready && !pending && !arrived && !sheet}
          walking={moving} onAdvance={(!walking || !automaticPano) && ready && !pending && !arrived && !sheet ? forward : undefined}
          arrived={arrived && ready} turn={Math.abs(turn) >= 25 ? turn : null}>
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className="rounded-xl bg-black/70 px-3 py-2 text-11 font-bold text-white">{remainingLabel}<br />{timeLabel}</span>
            <button type="button" onClick={() => showSheet("map")} className="pointer-events-auto inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-white px-3 text-11 font-bold text-ink"><GameIcon name="map" className="size-4" />地図</button>
          </div>
        </StreetStage>
      </div>
      {error ? <p role="alert" className="mx-4 rounded-xl bg-warn-soft p-3 text-11">{error}</p> : null}
      {decisionBlocking ? <div className={styles.decisionSlot}>
        <div aria-hidden={!decisionVisible} className={`${styles.decisionContent} ${decisionVisible ? "" : styles.decisionHidden}`}>
          <EventSheet key={step.pointId} event={pending!} index={decisionIndex} total={events.length}
            seconds={timerOverride ?? timerSeconds} viewingStreet={sheet !== null || !ready || announcingPoint} busy={busy}
            onExtend={remaining => setTimerOverride(remaining + 10)} onDisableTimer={() => setTimerOverride(0)} onChoose={choose} />
        </div>
        {!decisionVisible ? <div role="status" data-testid="attention-toast" className={styles.attentionNotice}>
          {announcingPoint ? <><span aria-hidden>⚠</span><span>注意ポイントだよ</span></> : <span>風景を読み込んでいます…</span>}
        </div> : null}
      </div> : null}
        <section className={styles.actions} aria-label="歩行の操作" inert={decisionBlocking} style={{ visibility: decisionBlocking ? "hidden" : "visible" }}>
          <p role="status" className="text-11 leading-relaxed text-ink-muted">{street?.error ? "移動を停止しました。地図で現在地を確認できます。" : mode === "api" && preparation?.status === "error" ? preparation.error : mode === "api" && preparation?.status === "loading" ? `道のつながりを確認しています（${preparation.count}地点）…` : !ready ? street?.arrivalError ?? "風景と道を準備しています…" : notice ?? (mode === "api" && !street?.arrivalNode ? street?.arrivalError ?? "避難先に隣接する到着地点を確認しています…" : returnPano ? "青い「ルートに戻る」を選ぶと、通った道をたどって戻れます。" : connectionChanged ? "道の接続が変わりました。道を再確認してください。" : offRoute && !arrived ? "選んだルートから外れています。地図で道を確認してください。" : arrived ? "通った道と選んだ行動をふりかえろう." : moving ? "選んだルートに沿って歩いています。判断地点と避難先付近で止まります。" : "ドラッグで周りを見回せます。")}</p>
          {mode === "api" && (preparation?.status === "error" || connectionChanged) ? <div className="flex gap-2"><Button size="md" onClick={retryPlan}>道を再確認する</Button><Button size="md" variant="outline" onClick={() => router.push("/evac/routes")}>ルートを選び直す</Button></div> : null}
          {arrived ? <Button disabled={!ready} onClick={() => { update({ finishedAt: Date.now() }); router.push("/evac/report"); }}>ふりかえる</Button>
            : <div className="flex gap-2">
              <Button size="md" disabled={!ready || busy || !canForward} onClick={forward}><GameIcon name="walk" />{mode === "api" ? "向いている道へ進む" : notice ? "先へ進む" : "進む"}</Button>
              <Button size="md" variant="outline" disabled={!walking && (!ready || busy || (mode === "api" && !automaticPano))} onClick={() => { if (notice) advance(); setWalking(!walking); }}><GameIcon name={walking ? "pause" : "play"} />{walking ? "一時停止" : "自動で歩く"}</Button>
            </div>}
        </section>
    </main>
    <BottomSheet open={sheet === "map"} title="いまいる場所と通った道" onClose={() => setSheet(null)}>
      <EvacMap floodHazard={evac.scenario === "flood"} mode={mode} center={currentPosition} home={home} shelters={[shelter]} selectedShelterId={shelter.id} routes={[route]} activeRouteId={route.id}
        markers={arrivalNode ? [{ id: "arrival", position: arrivalNode.position, label: "着", color: "#bfdbfe", title: "体験の到着地点" }] : []}
        walker={mode === "api" ? actualPosition ?? null : step.position} walkerHeading={mode === "api" ? street?.heading ?? walk.street?.heading ?? step.heading : step.heading} traveledPath={walkedPath(walk)} height={250} />
      <p className="my-3 text-13 text-ink-muted">{remainingLabel} {timeLabel}。地図を動かしても現在地は変わりません。</p>
      <Button size="md" onClick={() => setSheet(null)}>Street Viewに戻る</Button>
    </BottomSheet>
    <BottomSheet open={sheet === "help"} title="歩き方・設定" onClose={() => setSheet(null)}>
      <div className="space-y-4 text-13 leading-relaxed text-ink-muted">
        <p>風景をドラッグすると、その場で周囲を見回せます。API版では画面に表示された道を選び、隣の撮影地点へ一歩ずつ進みます。歩き始める前に、選んだルートを最後まで歩ける道のつながりを確認します。「自動で歩く」は確認済みの道を進みます。判断や地図の表示中は待機し、回答・閉じる操作のあと自動で再開します。避難先側の経路終点に近いStreet Viewの撮影地点を到着地点にしています。地図の「着」が目印です。</p>
        <p>途中で起こる場面を想定して、行動を選びましょう。説明や地図を開いている間、判断のタイマーは停止します。</p>
        <p>風景はGoogle Street Viewです。枠やイラストは練習用の想定で、実際の被害や画像解析の結果ではありません。API版で風景が利用できない場合は移動を停止します。地図はいつでも確認できます。</p>
        {mode === "mock" ? <Button size="md" variant="outline" disabled={!ready || busy || !!pending || arrived} onClick={() => { setSheet(null); advance(true); }}>次の判断ポイントへ進む</Button> : null}
      </div>
    </BottomSheet>
  </GameShell>;
}
