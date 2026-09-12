"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet, GameHeader, GameIcon, GameShell, Toast } from "./GameUI";
import { EvacApiGate, EvacModeSelector } from "./EvacMode";
import { EvacMap } from "./EvacMap";
import { GeoAnalysisSettings } from "./GeoAnalysisSettings";
import { RoomConnectionSummary } from "./RoomConnectionSummary";
import { Furigana } from "@/components/ui/Furigana";
import { distanceM, fetchRoutes, fetchShelters, geocodeAddress, TIMER_PRESETS } from "@/lib/evac-api";
import { DEMO_HOME, DEMO_AREA_LABEL, LOCATION_NOTICE, SIM_CONDITIONS, SHELTER_SOURCE_LINK, type LatLng, type Shelter } from "@/lib/evac-content";
import { formatDistance, formatDuration, getEvac, useEvac } from "@/lib/evac";
import { parseEvacMode, type EvacMode } from "@/lib/evac-mode";
import { hasMapsKey } from "@/lib/gmaps";
import { getSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";

const button = "flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-13 font-bold disabled:opacity-40";

export function EvacSetup({ initialRoutes = false }: { initialRoutes?: boolean }) {
  const { mode, setMode, linkRoom } = useEvac();
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = parseEvacMode(params.get("mode"));
    if (requested) setMode(requested);
    else if (!getEvac().startedAt && hasMapsKey()) setMode("api");
    if (params.get("from") === "room") linkRoom(getSession().finishedAt);
    else if (params.get("from") === "standalone") linkRoom(null);
    // External requests only mount after URL/session hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [setMode, linkRoom]);
  const selectMode = (next: EvacMode) => {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
    setSettingsOpen(false);
  };
  return <GameShell>
    {ready ? <EvacApiGate mode={mode}><SetupMap key={mode} mode={mode} initialRoutes={initialRoutes} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} selectMode={selectMode} /></EvacApiGate> : <p role="status" className="m-auto text-13">準備しています…</p>}
    {ready && mode === "api" && !hasMapsKey() ? <button className={button + " m-4 bg-primary"} onClick={() => selectMode("mock")}>サンプルで試す</button> : null}
  </GameShell>;
}

function SetupMap({ mode, initialRoutes, settingsOpen, setSettingsOpen, selectMode }: {
  mode: EvacMode; initialRoutes: boolean; settingsOpen: boolean; setSettingsOpen: (open: boolean) => void; selectMode: (mode: EvacMode) => void;
}) {
  const router = useRouter();
  const evac = useEvac();
  const { home, homeLabel, shelter, routes, startRouteId, timerSeconds, update, analysisMode } = evac;
  const settings = useSettings();
  const [stage, setStage] = useState<"place" | "routes">("place");
  const [sheet, setSheet] = useState<"shelters" | "place" | "route" | null>(null);
  const [found, setFound] = useState<{key: string; list: Shelter[]; error?: string} | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const alive = useRef(false);
  const routeRequest = useRef(0);
  const locationRequest = useRef(0);
  const mapBox = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState(260);
  const spot = home ?? DEMO_HOME;
  const spotKey = mode + ":" + spot.lat + "," + spot.lng + ":" + attempt;
  const shelters = found?.key === spotKey ? found.list : null;
  const active = routes.find(r => r.id === startRouteId) ?? null;
  const validShelter = !!shelter && !!shelters?.some(s => s.id === shelter.id);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!getEvac().home) update({home: DEMO_HOME, homeLabel: mode === "mock" ? DEMO_AREA_LABEL : "文京区の周辺", startedAt: Date.now()});
    const box = mapBox.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setMapHeight(Math.max(140, Math.floor(entry.contentRect.height) - (mode === "mock" ? 28 : 0))));
    observer.observe(box);
    return () => observer.disconnect();
  }, [update, mode]);
  useEffect(() => {
    let current = true;
    void fetchShelters(spot, mode).then(list => { if(current) setFound({key: spotKey, list}); }).catch(error => { if(current) setFound({key: spotKey, list: [], error: error instanceof Error ? error.message : "避難先を取得できませんでした。"}); });
    return () => { current = false; };
  // Stable coordinate key covers requests, not object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotKey]);

  const changeStage = useCallback((next: "place" | "routes") => {
    setStage(next);
    const url = new URL(window.location.href);
    url.pathname = "/evac";
    if (next === "routes") url.searchParams.set("view", "routes"); else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, []);
  const loadRoutes = useCallback(async () => {
    const state = getEvac();
    if (!state.home || !state.shelter) return;
    const request = ++routeRequest.current;
    setBusy(true); setRouteError(null); changeStage("routes");
    try {
      const list = await fetchRoutes(state.home, state.shelter, state.mode);
      if (!alive.current || routeRequest.current !== request) return;
      if (!list.length) throw new Error("徒歩ルートが見つかりませんでした。避難先を選び直してください。");
      update({routes: list, startRouteId: list[0].id, walk: null, decisions: [], takenRouteIds: [], followUp: null, finishedAt: null});
      setOpenedIds([list[0].id]);
    } catch (error) {
      if (alive.current && routeRequest.current === request) setRouteError(error instanceof Error ? error.message : "経路を取得できませんでした。");
    } finally { if (alive.current && routeRequest.current === request) setBusy(false); }
  }, [changeStage, update]);
  useEffect(() => {
    // Restore a persisted comparison/replay by fetching its external route data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialRoutes || new URLSearchParams(window.location.search).get("view") === "routes") void loadRoutes();
  }, [initialRoutes, loadRoutes]);

  const pickHome = (point: LatLng, label: string) => {
    locationRequest.current++; routeRequest.current++;
    setBusy(false); setGeoBusy(false); setSearchBusy(false); setLocationError(null); setRouteError(null);
    update({home: point, homeLabel: label, shelter: null, routes: [], startRouteId: null, walk: null, decisions: [], takenRouteIds: [], finishedAt: null, followUp: null});
    changeStage("place");
  };
  const requestMyLocation = () => {
    if (!navigator.geolocation) { setLocationError("現在地を取得できません。住所検索か地図で指定してください。"); return; }
    const request = ++locationRequest.current;
    setSearchBusy(false); setGeoBusy(true); setLocationError(null);
    navigator.geolocation.getCurrentPosition(pos => {
      if (!alive.current || request !== locationRequest.current) return;
      pickHome({lat: pos.coords.latitude, lng: pos.coords.longitude}, "いまいる場所"); setToast("現在地を設定しました");
    }, () => { if(alive.current && request === locationRequest.current) { setGeoBusy(false); setLocationError("現在地を取得できません。住所検索か地図で指定してください。"); } }, {enableHighAccuracy: true, timeout: 8000});
  };
  const search = async () => {
    if (!address.trim()) return;
    const request = ++locationRequest.current;
    setGeoBusy(false); setSearchBusy(true); setLocationError(null);
    try {
      const hit = await geocodeAddress(address.trim());
      if (!alive.current || request !== locationRequest.current) return;
      if (hit.ok) { pickHome(hit.position, hit.label); setToast("出発地点を設定しました"); }
      else setLocationError(hit.reason === "too-coarse" ? "町名や駅名まで入力してください。" : "見つかりませんでした。地図でも指定できます。");
    } catch { if(alive.current && request === locationRequest.current) setLocationError("検索できませんでした。通信・地図の設定を確認してください。"); }
    finally { if(alive.current && request === locationRequest.current) setSearchBusy(false); }
  };
  const pickShelter = (selected: Shelter) => { update({shelter: selected}); setSheet(null); };
  const chooseRoute = (id: string) => { update({startRouteId: id}); setOpenedIds(prev => prev.includes(id) ? prev : [...prev, id]); };
  const start = () => {
    if (!active || busy || routeError) return;
    update({takenRouteIds: [active.id], decisions: [], walk: null, followUp: null, startedAt: Date.now(), finishedAt: null});
    router.push("/evac/walk");
  };
  const listItem = (s: Shelter) => <button type="button" key={s.id} onClick={() => pickShelter(s)} aria-pressed={shelter?.id === s.id} className={"flex min-h-12 w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left " + (shelter?.id === s.id ? "border-primary-mid bg-primary-soft" : "border-border bg-white")}><span className={"grid size-8 shrink-0 place-items-center rounded-full " + (shelter?.id === s.id ? "bg-primary" : "bg-canvas")}><GameIcon name={shelter?.id === s.id ? "check" : "flag"} className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-13 font-bold"><Furigana text={s.name} /></span><span className="block text-[10px] text-ink-muted">{s.kind}</span></span><span className="shrink-0 text-11 font-bold">{formatDistance(distanceM(spot, s.position))}</span></button>;
  const visibleShelters = shelters?.slice(0, 2) ?? [];
  if (shelter && shelters?.some(s => s.id === shelter.id) && !visibleShelters.some(s => s.id === shelter.id)) visibleShelters[1] = shelter;

  return <>
    <GameHeader title={stage === "routes" ? "どの道で行こう？" : "ひなんルート"} subtitle={mode === "api" ? "Googleマップで、もしもの練習" : "サンプルの街で、もしもの練習"} step={1} onBack={stage === "routes" ? () => { routeRequest.current++; setBusy(false); changeStage("place"); } : undefined} onHelp={() => setSettingsOpen(true)} />
    <main className="flex min-h-0 flex-1 flex-col">
      {stage === "place" ? <div className="shrink-0 px-4 pb-2">
        {mode === "api" ? <form onSubmit={event => {event.preventDefault(); void search();}} className="flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-white px-3"><GameIcon name="search" className="size-4 shrink-0 text-ink-muted" /><input aria-label="住所・駅名で出発地点を検索" placeholder="住所・駅名を入力" value={address} onChange={event => setAddress(event.target.value)} className="h-11 min-w-0 w-full bg-transparent text-base" /></label><button type="submit" disabled={searchBusy || !address.trim()} className="min-h-11 rounded-2xl bg-white px-3 text-13 font-bold disabled:opacity-40">{searchBusy ? "検索中" : "検索"}</button><button type="button" onClick={requestMyLocation} disabled={geoBusy} aria-label="現在地を使う" title="現在地を使う" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary disabled:opacity-40"><GameIcon name="locate" className={"size-5 " + (geoBusy ? "animate-pulse" : "")} /></button></form> : null}
        <button type="button" onClick={() => setSheet("place")} className="mt-1 flex min-h-9 w-full items-center gap-1.5 text-left text-11 text-ink-muted"><GameIcon name="pin" className="size-3.5 shrink-0" /><span className="truncate"><Furigana text={homeLabel ?? "出発地点"} /></span><GameIcon name="info" className="ml-auto size-3.5 shrink-0" /></button>
        {locationError ? <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-11">{locationError}</p> : null}
      </div> : null}
      <div ref={mapBox} className="relative mx-3 min-h-[160px] flex-1 overflow-hidden rounded-3xl border border-border bg-white">
        <EvacMap mode={mode} center={spot} home={home} shelters={stage === "routes" ? shelter ? [shelter] : [] : shelters ?? []} selectedShelterId={shelter?.id} routes={stage === "routes" && !busy && !routeError ? routes : []} activeRouteId={startRouteId} onSelectRoute={stage === "routes" ? chooseRoute : undefined} onPickHome={stage === "place" ? p => pickHome(p, "地図で指定した地点") : undefined} onSelectShelter={stage === "place" ? id => { const selected = shelters?.find(s => s.id === id); if(selected) pickShelter(selected); } : undefined} height={mapHeight} className="!rounded-none" />
      </div>
      <section aria-label={stage === "place" ? "避難先を選ぶ" : "ルートを比較する"} className="mt-2 flex min-h-0 shrink flex-col rounded-t-3xl border-t border-border bg-white px-4 pt-3 pb-2">
        <div className="min-h-0 overflow-y-auto">
        {stage === "place" ? <>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">避難先を選ぼう</h2><button type="button" onClick={() => setSheet("shelters")} className="min-h-9 text-11 font-bold text-primary-ink">一覧・詳細 <span aria-hidden>↗</span></button></div>
          {shelters === null ? <p role="status" className="py-4 text-13 text-ink-muted">近くの避難先を探しています…</p> : found?.error || !shelters.length ? <div className="rounded-2xl bg-canvas p-3"><p role="alert" className="text-13">{found?.error ?? "近くに候補がありません。場所を変えて試してください。"}</p><button onClick={() => setAttempt(n => n + 1)} className="min-h-11 text-13 font-bold text-primary-ink">もう一度探す</button></div> : <div className="space-y-1.5">{visibleShelters.map(listItem)}</div>}
        </> : busy ? <div role="status" className="py-6 text-center"><span className="mx-auto mb-2 block size-7 animate-spin rounded-full border-2 border-border border-t-primary-mid" /><p className="text-13 font-bold">歩ける道を探しています…</p></div> : routeError ? <div><p role="alert" className="rounded-2xl bg-warn-soft p-3 text-13">{routeError}</p><button type="button" onClick={() => void loadRoutes()} className={button + " mt-2 w-full bg-primary"}>もう一度探す</button></div> : <>
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="truncate text-13 font-bold"><GameIcon name="flag" className="mr-1 inline size-4" /><Furigana text={shelter?.name ?? "避難先"} /></h2><button type="button" onClick={() => setSheet("route")} className="min-h-9 shrink-0 text-11 font-bold text-primary-ink">経路の詳細 ↗</button></div>
          <div className="grid grid-cols-2 gap-2">{routes.map((r, i) => <button type="button" key={r.id} onClick={() => chooseRoute(r.id)} aria-pressed={r.id === startRouteId} className={"rounded-2xl border-2 px-3 py-2 text-left " + (r.id === startRouteId ? "border-primary-mid bg-primary-soft" : "border-border bg-white")}><span className="flex items-center justify-between text-11 font-bold"><span><span aria-hidden className={"mr-1.5 inline-block size-2 rounded-full " + (r.kind === "short" ? "bg-primary-mid" : "bg-safe")} />ルート {String.fromCharCode(65+i)}</span>{openedIds.includes(r.id) ? <GameIcon name="check" className="size-3.5" /> : <span className="text-primary-ink">見る</span>}</span><span className="mt-1 block font-display text-xl font-bold">{formatDuration(r.durationS)}</span><span className="block text-11 text-ink-muted">{formatDistance(r.distanceM)}{mode === "mock" || analysisMode === "sample" ? " · " + r.eventCount + "場面" : ""}</span></button>)}</div>
          <p className="mt-2 text-11 text-ink-muted">{routes.length === 1 ? "取得できた候補は1本です。" : openedIds.length < 2 ? "もう1本もタップして、道を見比べよう。" : "道を見比べました。どちらで進む？"}</p>
          <div className="mt-1 flex items-center gap-1 text-11"><GameIcon name="clock" className="mr-1 size-4" /><span className="mr-auto">考える時間</span>{TIMER_PRESETS.map(t => <button key={t.seconds} type="button" aria-pressed={timerSeconds === t.seconds} onClick={() => update({timerSeconds: t.seconds})} className={"min-h-11 min-w-11 rounded-xl px-2 font-bold " + (timerSeconds === t.seconds ? "bg-primary-soft text-primary-ink" : "text-ink-muted")}>{t.seconds ? t.seconds + "秒" : "なし"}</button>)}</div>
        </>}
        </div>
        {stage === "place" ? <button disabled={!validShelter} type="button" onClick={() => void loadRoutes()} className={button + " mt-3 w-full shrink-0 bg-primary"}>ルートを比べる<GameIcon name="route" className="size-4" /></button> : !busy && !routeError ? <button type="button" onClick={start} disabled={!active} className={button + " w-full shrink-0 bg-primary"}>この道でスタート<GameIcon name="play" className="size-4" /></button> : null}
      </section>
    </main>
    <Toast message={toast} onDismiss={() => setToast(null)} />
    <BottomSheet open={settingsOpen} title="遊び方・設定" onClose={() => setSettingsOpen(false)}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center text-11 font-bold">{(["pin", "walk", "flag"] as const).map((name, i) => <div key={name} className="rounded-2xl bg-primary-soft p-3"><GameIcon name={name} className="mx-auto mb-2 size-6" />{["場所を選ぶ", "道で判断する", "ふりかえる"][i]}</div>)}</div>
        <p className="text-13 text-ink-muted">地図のコマを進める練習です。その場にいながら体験できます。</p>
        <div className="rounded-2xl bg-canvas p-3">{SIM_CONDITIONS.map(c => <p key={c} className="text-13"><Furigana text={c} /></p>)}</div>
        <RoomConnectionSummary />
        <EvacModeSelector mode={mode} onChange={selectMode} />
        {mode === "api" ? <GeoAnalysisSettings onPickRegion={(p, name) => {pickHome(p,name); setSettingsOpen(false);}} /> : null}
        <div className="flex flex-wrap items-center gap-2 text-13"><button aria-pressed={settings.furigana} onClick={() => settings.update({furigana: !settings.furigana})} className={button + " border border-border"}>ふりがな {settings.furigana ? "あり" : "なし"}</button><label>文字サイズ <select value={settings.uiScale} onChange={e => settings.update({uiScale: e.target.value as "normal" | "large" | "xlarge"})} className="min-h-11 rounded-xl border border-border px-2"><option value="normal">標準</option><option value="large">大</option><option value="xlarge">特大</option></select></label></div>
        <details className="text-13"><summary className="min-h-11 cursor-pointer font-bold">位置情報・データについて</summary><div className="space-y-2">{LOCATION_NOTICE.map(t => <p key={t}><Furigana text={t} /></p>)}</div></details>
      </div>
    </BottomSheet>
    <BottomSheet open={sheet === "place"} title="出発地点" onClose={() => setSheet(null)}>
      <p className="text-base font-bold"><Furigana text={homeLabel ?? "未指定"} /></p><p className="mt-2 text-13 text-ink-muted">指定地点は、近くの避難先とルートの検索に使います。住所・現在地・地図のタップで変更できます。</p>
      {mode === "api" ? <button onClick={() => {setSheet(null); requestMyLocation();}} className={button + " mt-3 w-full bg-primary"}><GameIcon name="locate" />現在地を使う</button> : null}
      <button onClick={() => {pickHome(DEMO_HOME, mode === "mock" ? DEMO_AREA_LABEL : "文京区の周辺"); setSheet(null);}} className={button + " mt-2 w-full border border-border"}>開始地点に戻す</button>
      <div className="mt-4 space-y-2 text-11 text-ink-muted">{LOCATION_NOTICE.map(t => <p key={t}><Furigana text={t} /></p>)}</div>
    </BottomSheet>
    <BottomSheet open={sheet === "shelters"} title="近くの避難先" onClose={() => setSheet(null)}>
      <p className="mb-3 text-11 text-ink-muted">実際の指定・開設状況は自治体の情報で確認してください。</p>
      <div className="space-y-3">{shelters?.map(s => <div key={s.id}>{listItem(s)}<p className="mt-1 px-2 text-11 text-ink-muted">{s.address}</p>{s.note ? <p className="px-2 text-11 text-ink-muted"><Furigana text={s.note} /></p> : null}<p className="px-2 text-11 text-ink-muted">出典：{s.source}</p></div>)}</div>
      <a href={SHELTER_SOURCE_LINK.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-11 text-primary-ink underline">{SHELTER_SOURCE_LINK.label}</a>
    </BottomSheet>
    <BottomSheet open={sheet === "route"} title="経路の詳細" onClose={() => setSheet(null)}>
      {active ? <div className="space-y-3"><p className="text-base font-bold"><Furigana text={active.label} /></p><p>{formatDistance(active.distanceM)} · {formatDuration(active.durationS)}</p><div className="space-y-2">{active.notes.map(n => <p key={n} className="text-13 text-ink-muted"><Furigana text={n} /></p>)}</div><p className="rounded-2xl bg-primary-soft p-3 text-11">{active.demo ? "練習用の経路です。実際の道路とは異なります。" : "距離や地形の比較は学習用です。安全性や現在の通行状況を保証するものではありません。"}</p>{mode === "api" ? <p className="text-13 text-ink-muted">{analysisMode === "sample" ? "実際の道で固定の練習問題を体験します。" : "収録済みの地形データからAIが出題します。範囲外では解析を始めません。"}</p> : null}</div> : null}
    </BottomSheet>
  </>;
}
