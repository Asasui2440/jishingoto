"use client";

import { EVAC_SCENARIOS } from "@/lib/evac-scenario";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerFeedback } from "@/components/evac/AnswerFeedback";
import { EventSheet } from "@/components/evac/EventSheet";
import { StreetStage } from "@/components/evac/StreetStage";
import { EvacMap } from "@/components/evac/EvacMap";
import { BottomSheet, GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { Button } from "@/components/ui/Button";
import { plain } from "@/components/ui/Furigana";
import { formatDistance, formatDuration, getEvac } from "@/lib/evac";
import { alignWalkQuestions, questionIdsAtNode, walkedPath } from "@/lib/evac-walk";
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
  const [initialReady, setInitialReady] = useState(() => {
    const saved = getEvac();
    return saved.decisions.length > 0 || (saved.walk?.street?.path.length ?? 0) > 1;
  });
  const [readyStepId, setReadyStepId] = useState<string | null>(null);
  const [streetPointId, setStreetPointId] = useState<string | null>(null);
  const [announcedPointId, setAnnouncedPointId] = useState<string | null>(null);
  const game = useEvacWalk({ readyStepId, paused: sheet !== null });
  const { observeStreet, evac, route, step, pending, arrived, walking, setWalking, busy, error, notice, feedback, closeFeedback, advance, choose, timerOverride, setTimerOverride, retry } = game;
  const { mode, home, shelter, walk, decisions, timerSeconds, update } = evac;
  const { preparation, retry: retryPlan } = useStreetRoutePlan(route, street, mode === "api");
  const plan = preparation?.plan ?? null;
  useEffect(() => {
    if (!plan || !route) return;
    update(prev => {
      if (!prev.walk || prev.walk.routeId !== route.id) return prev;
      const aligned = alignWalkQuestions(prev.walk,route,plan.nodes,prev.decisions.map(d => d.eventId));
      return aligned === prev.walk ? prev : {...prev,walk:aligned};
    });
  }, [plan,route,update]);
  const arrivalNode = plan?.nodes.at(-1) ?? street?.arrivalNode;
  const ready = mode === "api" ? preparation?.status === "ready" && (walk?.source !== "context" || walk.questionSpacingVersion === 4) && !!street?.ready && !street.busy && !street.error : !!step && readyStepId === step.id;
  if (ready && !initialReady) setInitialReady(true);
  const questionSteps = walk?.steps;
  const onNavigation = useCallback((snapshot: StreetSnapshot) => {
    setStreet(snapshot);
    const node = plan?.nodes.find(node => node.pano === snapshot.pano);
    observeStreet({ ...snapshot, arrivalNode: plan?.nodes.at(-1) ?? snapshot.arrivalNode }, node ? questionIdsAtNode(questionSteps ? {steps:questionSteps} : null, node.position) : plan ? [] : undefined);
  }, [observeStreet, plan, questionSteps]);
  const offRoute = !!plan && !!street && !plan.nodes.some(node => node.pano === street.pano);
  const returnPano = !arrived ? plannedReturnLink(street, plan)?.pano ?? null : null;
  const automaticPano = !arrived ? plannedStreetLink(street, plan)?.pano ?? null : null;
  useEffect(() => {
    if (mode !== "api" || !walking || !ready || pending || feedback || notice || arrived || busy || sheet) return;
    if (!automaticPano) return;
    const timer = setTimeout(() => {
      if (!getEvac().walk?.street?.arrived) navigation.current?.move(automaticPano);
    }, 1600);
    return () => clearTimeout(timer);
  }, [mode, walking, ready, pending, feedback, notice, arrived, busy, sheet, automaticPano, street?.pano, setWalking]);
  const announcingPoint = !!pending && !feedback && ready && announcedPointId !== step?.pointId;
  const viewingStreet = !!pending && streetPointId === (step?.pointId ?? step?.id);
  const decisionVisible = !!pending && !feedback && ready && !announcingPoint && !viewingStreet;
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
  const routeRecovery = mode === "api" && (preparation?.status === "error" || connectionChanged);
  const navigationAlert = routeRecovery
    ? preparation?.error ?? "道の接続が変わりました。道を再確認してください。"
    : error;
  const decisionBlocking = !!feedback || !!pending && preparation?.status !== "error";
  const moving = (mode === "mock" || !!automaticPano) && walking && ready && !pending && !feedback && !notice && !arrived && !busy && !sheet;
  const events = walk.steps.filter(s => s.event);
  const decisionIndex = events.findIndex(s => s.pointId === step.pointId);
  const next = walk.steps[walk.index + 1];
  const turn = next ? ((next.heading - step.heading + 540) % 360) - 180 : 0;
  const facingLink = street?.links.slice().sort((a, b) => Math.abs(angleDifference(a.heading, street.heading)) - Math.abs(angleDifference(b.heading, street.heading)))[0];
  const canForward = mode === "mock" || !!facingLink && !!street && Math.abs(angleDifference(facingLink.heading, street.heading)) < 60;
  const forward = () => {
    if (!ready || busy || pending || feedback || sheet) return;
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
        {mode === "api" && walk.source === "sample" ? <span className="text-11 text-ink-muted">固定の練習問題</span> : null}
        <span className="text-11 text-ink-muted">判断 {decisions.length} / {events.length}</span>
      </div>
      <div className={styles.scene}>
        <StreetStage initialPosition={walk.street?.position ?? walk.steps[0].position} demoPosition={step.position}
          navigationRef={navigation} onNavigation={onNavigation} onChangeStart={() => { setWalking(false); router.push("/evac"); }} recommendedPano={automaticPano} returnPano={returnPano} heading={step.heading} destination={shelter.position} arrivalEndpoint={route.path[route.path.length - 1]} kind={pending?.kind ?? null}
          zone={ready ? pending?.zone : null} zoneNumber={decisionIndex + 1} height="100%" demo={mode === "mock"}
          sceneKey={step.id} onSettled={setReadyStepId} showArrow={ready && !pending && !feedback && !arrived && !sheet}
          walking={moving} onAdvance={(!walking || !automaticPano) && ready && !pending && !feedback && !arrived && !sheet ? forward : undefined}
          arrived={arrived && ready} onReflect={() => { update({finishedAt:Date.now()}); router.push("/evac/report"); }} turn={Math.abs(turn) >= 25 ? turn : null}>
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <div className="flex flex-col items-start gap-2">
              <span className="rounded-xl bg-black/70 px-3 py-2 text-11 font-bold text-white">{remainingLabel}<br />{timeLabel}</span>
              {walking && !arrived ? <span role="status" className="inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-11 font-bold text-white"><GameIcon name="walk" className="size-4" />自動走行中</span> : null}
            </div>
            <button type="button" onClick={() => showSheet("map")} className="pointer-events-auto inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-white px-3 text-11 font-bold text-ink"><GameIcon name="map" className="size-4" />地図</button>
          </div>
          {navigationAlert && !street?.error ? <p role="alert" className={styles.navigationAlert}>{navigationAlert}</p> : null}
        </StreetStage>
      </div>
      {pending && preparation?.status !== "error" ? <div className={`${styles.decisionSlot} ${styles.illustratedSlot} ${decisionVisible ? "" : styles.decisionHidden}`}>
        <div aria-hidden={!decisionVisible} inert={!decisionVisible} className={styles.decisionContent}>
          <EventSheet key={step.pointId} event={pending!} index={decisionIndex} total={events.length}
            seconds={timerOverride ?? timerSeconds} viewingStreet={sheet !== null || !decisionVisible || !!feedback} busy={busy}
            onViewStreet={() => setStreetPointId(step.pointId ?? step.id)}
            onTimerChange={seconds => { update({ timerSeconds: seconds }); setTimerOverride(seconds); }} onChoose={choose} />
        </div>
      </div> : null}
      {(!initialReady && !ready && !error && !street?.error && preparation?.status !== "error") || announcingPoint ? <div role="status" data-testid="attention-toast" className={announcingPoint ? styles.attentionNotice : styles.loadingNotice}>
        {announcingPoint ? <><span aria-hidden>⚠</span><span>注意ポイント</span></> : <>
          <span>地点を確認しています…</span>
          <progress className={styles.preparationProgress} aria-label="地点確認の進捗" max={3} value={preparation?.status === "ready" ? 2 : street?.ready ? 1 : 0} aria-valuetext={preparation?.status === "ready" ? "3段階中3：出題を準備中" : street?.ready ? `3段階中2：道の接続を確認中、${preparation?.count ?? 0}地点取得済み` : "3段階中1：風景を取得中"} />
          <span className="text-11">{preparation?.status === "ready" ? "3 / 3　出題を準備中" : street?.ready ? `2 / 3　道の接続を確認中（${preparation?.count ?? 0}地点）` : "1 / 3　風景を取得中"}</span>
        </>}
      </div> : null}
      {viewingStreet && ready && !announcingPoint ? <div className={styles.streetReturn}>
        <p>その場で周りを見回せます。制限時間は停止中です。</p>
        <button type="button" autoFocus onClick={() => setStreetPointId(null)}>クイズに戻る</button>
      </div> : null}
        <section className={styles.actions} aria-label="歩行の操作" inert={decisionBlocking} style={{ visibility: decisionBlocking ? "hidden" : "visible" }}>

          {!arrived ? <div className="flex gap-2">
            {routeRecovery ? <>
              <Button size="md" onClick={() => { setWalking(false); retryPlan(); }}>道を再確認する</Button>
              <Button size="md" variant="outline" onClick={() => { setWalking(false); router.push("/evac/routes"); }}>ルートを選び直す</Button>
            </> : <>
              <Button size="md" disabled={!ready || busy || !canForward} onClick={forward}><GameIcon name="walk" />{mode === "api" ? "向いている道へ進む" : notice ? "先へ進む" : "進む"}</Button>
              <Button size="md" variant="outline" disabled={!walking && (!ready || busy || (mode === "api" && !automaticPano))} onClick={() => { if (notice) advance(); setWalking(!walking); }}><GameIcon name={walking ? "pause" : "play"} />{walking ? "一時停止" : "自動で歩く"}</Button>
            </>}
            </div> : null}
        </section>
    </main>
    <AnswerFeedback feedback={feedback} busy={busy} error={error} onContinue={closeFeedback} />
    <BottomSheet open={sheet === "map"} title="いまいる場所と通った道" onClose={() => setSheet(null)}>
      <EvacMap floodHazard={evac.scenario === "flood"} mode={mode} center={currentPosition} home={home} shelters={[shelter]} selectedShelterId={shelter.id} routes={[route]} activeRouteId={route.id}
        markers={arrivalNode ? [{ id: "arrival", position: arrivalNode.position, label: "着", color: "#bfdbfe", title: "体験の到着地点" }] : []}
        walker={mode === "api" ? actualPosition ?? null : step.position} walkerHeading={mode === "api" ? street?.heading ?? walk.street?.heading ?? step.heading : step.heading} traveledPath={walkedPath(walk)} height={250} />
      <p className="my-3 text-13 text-ink-muted">{remainingLabel} {timeLabel}。地図を動かしても現在地は変わりません。</p>
      <Button size="md" onClick={() => setSheet(null)}>Street Viewに戻る</Button>
    </BottomSheet>
    <BottomSheet open={sheet === "help"} title="歩き方・設定" onClose={() => setSheet(null)}>
      <div className="space-y-4 text-13 leading-relaxed text-ink-muted">
        <p>風景をドラッグすると、その場で周囲を見回せます。API版では画面に表示された道を選び、隣の撮影地点へ一歩ずつ進みます。歩き始める前に、選んだルートを最後まで歩ける道のつながりを確認します。「自動で歩く」は確認済みの道を進みます。問題・回答の解説・地図の表示中は待機し、解説を確認して「歩行を続ける」を押すか、地図を閉じると自動で再開します。避難先側の経路終点に近いStreet Viewの撮影地点を到着地点にしています。地図の「着」が目印です。</p>
        <p>途中で起こる場面を想定して、行動を選びましょう。説明や地図を開いている間、判断のタイマーは停止します。</p>
        <p>風景はGoogle Street Viewです。枠やイラストは練習用の想定で、実際の被害や画像解析の結果ではありません。API版で風景が利用できない場合は移動を停止します。地図はいつでも確認できます。</p>
        {mode === "mock" ? <Button size="md" variant="outline" disabled={!ready || busy || !!pending || arrived} onClick={() => { setSheet(null); advance(true); }}>次の判断ポイントへ進む</Button> : null}
      </div>
    </BottomSheet>
  </GameShell>;
}
