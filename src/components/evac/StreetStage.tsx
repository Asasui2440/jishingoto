"use client";

import { Furigana } from "@/components/ui/Furigana";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { HazardSketch } from "./HazardSketch";
import type { EventKind, LatLng } from "@/lib/evac-content";
import { hasMapsKey, loadMaps, onMapsAuthError } from "@/lib/gmaps";

import { streetController, findStreetArrivalNode, angleDifference, type StreetNode, type StreetSnapshot, type StreetControls } from "@/lib/street-navigation";

const ZONE_LABELS: Record<EventKind, string> = {
  wall: "想定：塀・ブロック",
  fall: "想定：落下物",
  closed: "想定：通行止め",
  terrain: "想定：地形の注意点",
};

type Props = {
  /** Used only to find the first panorama. Never a movement target. */
  initialPosition: LatLng;
  demoPosition: LatLng;
  navigationRef?: Ref<StreetControls>;
  returnPano?: string | null;
  recommendedPano?: string | null;
  onNavigation?: (state: StreetSnapshot) => void;
  onChangeStart?: () => void;
  destination?: LatLng;
  arrivalEndpoint?: LatLng;

  /** 進行方向（度）。パノラマの初期の向きに使う */
  heading: number;
  /** イベント発生中なら、その種類。デモ表示のイラストにも使う */
  kind?: EventKind | null;
  /** 想定の危険範囲（％）。検知枠を重ねる */
  zone?: { x: number; y: number; w: number; h: number } | null;
  zoneNumber?: number;
  /** 進行方向の案内矢印を出すか */
  showArrow?: boolean;
  /** この先の曲がり（度。＋が右）。null なら曲がりの案内は出さない */
  turn?: number | null;
  /** 自動で歩いている最中か。矢印の見せかたを変える */
  walking?: boolean;
  /** 矢印をタップしたとき。渡すと矢印が押せるようになる（自分で進む） */
  onAdvance?: () => void;
  /** 避難場所に着いたか。着いたときの演出に使う */
  arrived?: boolean;
  onReflect?: () => void;
  height?: number | string;
  demo?: boolean;
  sceneKey?: string;
  onSettled?: (key: string) => void;
  children?: React.ReactNode;
};

/** 進む向きが画面のどこに見えるか。これを超えると画面の端に寄せる（度） */
const HALF_FOV_DEG = 45;

/**
 * ストリートビュー（現実の場所を理解するための背景）。
 *
 * ■ 守っていること（仕様 7・9・11）
 *   - パノラマ ID は体験中だけ使い、隣接リンクに沿って移動する
 *   - 画像をアプリ側で保存・キャッシュしない
 *   - Google の帰属表示にオーバーレイを重ねない
 *     （下端は空けて、下部シートはパノラマの外に置く）
 *   - 実在の建物が壊れて見える加工はしない。
 *     重ねるのは半透明の「想定範囲」と番号だけ。
 */
export function StreetStage({
  initialPosition,
  demoPosition: position,
  navigationRef,
  onNavigation,
  onChangeStart,
  recommendedPano,
  returnPano,
  destination,
  arrivalEndpoint,
  heading,
  kind = null,
  zone = null,
  zoneNumber,
  showArrow = false,
  turn = null,
  walking = false,
  onAdvance,
  arrived = false,
  onReflect,
  height = 260,
  demo = false,
  sceneKey = "",
  onSettled,
  children,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const start = useRef({ position: initialPosition, heading });
  const controls = useRef<ReturnType<typeof streetController> | null>(null);
  const [snapshot, setSnapshot] = useState<StreetSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryPano = useRef<string | null>(null);
  useImperativeHandle(navigationRef, () => ({ move: id => controls.current?.move(id) }), []);
  const endpointLat = (arrivalEndpoint ?? destination)?.lat;
  const endpointLng = (arrivalEndpoint ?? destination)?.lng;
  const endpointKey = `${endpointLat}:${endpointLng}`;
  const [arrival, setArrival] = useState<{ key: string; node: StreetNode | null; error: string | null } | null>(null);
  const arrivalNode = arrival?.key === endpointKey ? arrival.node : null;
  const arrivalError = arrival?.key === endpointKey ? arrival.error : null;
  useEffect(() => {
    if (snapshot) onNavigation?.({ ...snapshot, arrivalNode, arrivalError });
  }, [snapshot, onNavigation, arrivalNode, arrivalError]);
  useEffect(() => {
    if (demo || endpointLat === undefined || endpointLng === undefined) return;
    let alive = true;
    const fail = () => {
      if (!alive) return;
      setArrival({ key: endpointKey, node: null, error: "避難先に隣接するStreet Viewを確認できません。地図を確認してください。" });
      alive = false;
    };
    const timeout = setTimeout(fail, 15000);
    void loadMaps().then(maps => findStreetArrivalNode(maps, { lat: endpointLat, lng: endpointLng }))
      .then(node => { if (alive) setArrival({ key: endpointKey, node, error: null }); })
      .catch(fail).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); };
  }, [demo, endpointLat, endpointLng, endpointKey]);
  const mode = demo ? "sketch" : snapshot?.position ? "pano" : "loading";
  const pov = demo ? heading : snapshot?.heading ?? heading;
  const navigationHeading = heading;
  const here = snapshot?.position ?? position;
  const destinationHeading = destination
    ? Math.atan2((destination.lng - here.lng) * Math.cos(here.lat * Math.PI / 180), destination.lat - here.lat) * 180 / Math.PI : heading;
  const zoneKey = `${kind}:${zoneNumber}:${sceneKey}`;
  useEffect(() => {
    if (demo || snapshot?.ready) onSettled?.(sceneKey);
  }, [demo, snapshot?.ready, sceneKey, onSettled]);

  useEffect(() => {
    if (demo) return;
    const box = boxRef.current;
    let alive = true;
    let panorama: google.maps.StreetViewPanorama | null = null;
    let observer: ResizeObserver | null = null;
    let controller: ReturnType<typeof streetController> | null = null;
    const fail = (error?: unknown) => {
      if (!alive) return;
      controller?.dispose();
      alive = false;
      const code = error instanceof Error ? error.message : typeof error === "object" && error !== null && "code" in error ? String(error.code) : String(error ?? "");
      const message = /ZERO_RESULTS|no-pano/.test(code) ? "出発地点の近くに屋外のStreet Viewが見つかりませんでした。出発地点を近くの道路に変更してください。"
        : /missing-key|auth|REQUEST_DENIED/.test(code) ? "Google Mapsの認証を確認できませんでした。APIキーとこのサイトでの利用設定を確認してください。"
        : /timeout/.test(code) ? "Street Viewの読み込みがタイムアウトしました。通信を確認して再試行してください。"
        : "この地点のStreet Viewを取得できませんでした。";
      setLoadError(message);
      setSnapshot(prev => prev ? { ...prev, ready: false, busy: false, error: message } : {
        pano: "", position: null, heading: start.current.heading, links: [], previousPano: null,
        travelHeading: null, ready: false, busy: false, error: message,
      });
    };
    const unsubscribe = onMapsAuthError(() => fail(new Error("maps-auth-failed")));
    const timeout = setTimeout(() => fail(new Error("street-timeout")), 20000);
    void (async () => {
      if (!hasMapsKey()) throw new Error("missing-key");
      const maps = await loadMaps();
      const { data } = await new maps.StreetViewService().getPanorama(retryPano.current ? {pano:retryPano.current} : {
        location: start.current.position, radius: 40,
        preference: maps.StreetViewPreference.NEAREST,
        sources: [maps.StreetViewSource.OUTDOOR, maps.StreetViewSource.GOOGLE],
      });
      if (!alive || !boxRef.current) return;
      if (!data.location?.pano) throw new Error("no-pano");
      panorama = new maps.StreetViewPanorama(boxRef.current, {
        pano: data.location.pano, pov: { heading: start.current.heading, pitch: 0 }, zoom: 0,
        addressControl: false, linksControl: false, panControl: false, zoomControl: false,
        fullscreenControl: false, motionTracking: false, motionTrackingControl: false,
        enableCloseButton: false, showRoadLabels: false, clickToGo: false,
      });
      controller = streetController(panorama, state => { if (alive) setSnapshot(state); });
      controls.current = controller;
      observer = new ResizeObserver(() => { if (panorama) maps.event.trigger(panorama, "resize"); });
      observer.observe(boxRef.current);
      clearTimeout(timeout);
    })().catch(fail);
    return () => {
      alive = false; clearTimeout(timeout); unsubscribe(); controller?.dispose();
      controls.current = null; observer?.disconnect(); panorama?.setVisible(false);
      box?.replaceChildren();
    };
  }, [demo, loadAttempt]);

  const retryLoad = () => {
    retryPano.current = snapshot?.pano || null;
    if (snapshot?.position) start.current = {position:snapshot.position,heading:snapshot.heading};
    setLoadError(null);
    setSnapshot(null);
    setLoadAttempt(n => n + 1);
  };

  return (
    <div
      role="region"
      aria-label="Street Viewで進む体験"
      data-scene-state={loadError || snapshot?.error ? "error" : mode}
      data-pano-id={snapshot?.pano ?? ""}
      data-route-heading={Math.round((heading + 360) % 360)}
      data-pov-heading={Math.round((pov + 360) % 360)}
      data-navigation-heading={Math.round((navigationHeading + 360) % 360)}
      className="relative w-full overflow-hidden rounded-panel bg-ink"
      style={{ height }}
    >
      {/* パノラマの器。sketch のときは隠す（画像は保存もキャッシュもしない） */}
      <div
        ref={boxRef}
        onKeyDownCapture={event => {
          // Native keyboard navigation bypasses the adjacent-link command boundary.
          if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(event.key.toLowerCase())) {
            event.preventDefault(); event.stopPropagation();
          }
        }}
        className={["absolute inset-0", mode === "pano" ? "" : "invisible"].join(" ")}
      />

      {demo ? (
        <>
          <HazardSketch kind={kind} className="absolute inset-0 h-full w-full" />
          <span className="absolute bottom-2 left-2 rounded-chip bg-black/60 px-2 py-1 text-11 font-bold text-white">
            {mode === "loading" ? "ストリートビューを探しています..." : "想定図（イラスト）"}
          </span>
        </>
      ) : null}

      {!demo && (loadError || snapshot?.error || !snapshot?.position) ? (
        <div role={loadError || snapshot?.error ? "alert" : "status"} className="absolute inset-x-3 top-1/3 rounded-xl bg-white/95 p-3 text-13 text-ink">
          {loadError ?? snapshot?.error ?? "Street Viewを読み込んでいます…"}
          {loadError || snapshot?.error ? <div className="mt-3 space-y-2">
            {onChangeStart ? <><p>出発地点を、近くの道路上へ少しずらして試してみてください。</p><button type="button" onClick={onChangeStart} className="pointer-events-auto block min-h-11 rounded-full bg-primary px-4 font-bold text-ink">出発地点を少しずらす</button></> : null}
            <button type="button" onClick={retryLoad} className="pointer-events-auto block min-h-11 px-2 text-11 text-ink-muted underline">同じ地点で再試行</button>
          </div> : null}
        </div>
      ) : null}
      {!demo && showArrow && snapshot?.ready && !loadError ? (
        <div className="absolute inset-x-2 bottom-10 z-10 flex flex-wrap justify-center gap-2" aria-label="つながっている道">
          {snapshot.links.length === 0 ? <span className="rounded-lg bg-white p-2 text-11 text-ink">この先につながる道がありません。</span> : snapshot.links.map((link, index) => {
            const returning = link.pano === returnPano;
            const relative = angleDifference(link.heading, pov);
            const label = link.pano === snapshot.previousPano ? "戻る" : Math.abs(relative) < 35 ? "正面の道" : Math.abs(relative) > 145 ? "後ろの道" : relative > 0 ? "右の道" : "左の道";
            return <button key={link.pano} type="button" disabled={!onAdvance || snapshot.busy}
              onClick={() => controls.current?.move(link.pano)}
              data-route-return={returning ? "true" : undefined}
              className={`min-h-11 rounded-xl px-3 py-2 text-11 font-bold shadow ${returning ? "bg-blue-700 text-white ring-2 ring-white" : "bg-white/95 text-ink"}`}
              aria-label={returning ? "ルートに戻る" : `${label}へ進む（${index + 1}）`}>
              <span aria-hidden className="mr-1 inline-block" style={{ transform: `rotate(${relative}deg)` }}>↑</span>{returning ? "ルートに戻る" : label}{link.pano === recommendedPano ? <span className="ml-1 text-primary-ink">（選択ルート）</span> : null}
            </button>;
          })}
        </div>
      ) : null}

      {/*
        想定の危険範囲。
        枠が縮んで定まる動きにしているが、これは画像を解析した結果ではない。
        「歩いていて気づいて足が止まった」という体験に見た目を合わせているだけで、
        位置も種類もルールエンジンがあらかじめ決めている（仕様 10・11）。
      */}
      {zone ? (
        <>
          {/* 気づいた瞬間のフラッシュ。下端は帰属表示のために外してある。 */}
          <span
            key={`flash-${zoneKey}`}
            aria-hidden
            className="animate-zone-flash pointer-events-none absolute inset-x-0 top-0 bottom-8 z-10 bg-white"
          />

          <div
            key={`zone-${zoneKey}`}
            aria-hidden
            className="animate-zone-lock pointer-events-none absolute z-10"
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.w}%`,
              height: `${zone.h}%`,
            }}
          >
            {/* 背景 */}
            <div className="absolute inset-0 bg-warn/20" />
            {/* 枠の中を1度だけ走るスキャン線 */}
            <span className="absolute inset-x-0 overflow-hidden">
              <span className="animate-zone-scan absolute inset-x-0 h-0.5 bg-warn shadow-[0_0_8px_var(--color-warn)]" />
            </span>
            {/* 外枠 */}
            <div className="absolute inset-0 border-2 border-warn" />
            {/* コーナーマーカー */}
            <div className="absolute top-0 left-0 h-4 w-4 border-t-[3px] border-l-[3px] border-warn" />
            <div className="absolute top-0 right-0 h-4 w-4 border-t-[3px] border-r-[3px] border-warn" />
            <div className="absolute bottom-0 left-0 h-4 w-4 border-b-[3px] border-l-[3px] border-warn" />
            <div className="absolute bottom-0 right-0 h-4 w-4 border-b-[3px] border-r-[3px] border-warn" />
            {/* ラベル。枠が定まってから出す。 */}
            {kind ? (
              <span className="animate-zone-label absolute -top-6 left-0 flex items-center gap-1 rounded-sm bg-warn px-1.5 py-0.5 font-display text-11 font-black text-ink">
                <span>⚠</span>
                <span>{ZONE_LABELS[kind]}</span>
              </span>
            ) : null}
            {/* 番号 */}
            {zoneNumber ? (
              <span className="animate-zone-label absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-warn font-display text-11 font-black text-ink shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                {zoneNumber}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {/*
        進む向きの案内。
        見回しても進行方向を指し続けるよう、いまの視点との差から画面上の位置を決める。
        onAdvance を渡すと押せるようになり、自分でタップして一歩進める。
      */}
      {demo && showArrow
        ? (() => {
            // 進行方向と、いま見ている向きの差（-180〜180。＋が右）
            const rel = ((navigationHeading - pov + 540) % 360) - 180;
            const offscreen = Math.abs(rel) > HALF_FOV_DEG;
            // 視野の中なら位置で示し、外なら画面の端に寄せる
            const x = Math.max(8, Math.min(92, 50 + (rel / HALF_FOV_DEG) * 42));
            const Tag = onAdvance ? "button" : "div";

            return (
              <Tag
                {...(onAdvance
                  ? { type: "button" as const, onClick: onAdvance, "aria-label": "進む" }
                  : { "aria-hidden": true })}
                className={[
                  "absolute bottom-10 z-10 flex -translate-x-1/2 flex-col items-center gap-1",
                  onAdvance ? "cursor-pointer" : "pointer-events-none",
                ].join(" ")}
                style={{ left: `${x}%`, transition: "left 120ms linear" }}
              >
                {offscreen ? (
                  // 進む道が視野の外。振り向く向きを示す。
                  <span className="rounded-chip bg-primary px-2.5 py-1.5 font-display text-13 font-black text-ink shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                    <Furigana text={rel > 0 ? "→ こっち" : "こっち ←"} />
                  </span>
                ) : (
                  // 路面に描かれたように見せる。面を寝かせて、奥ほど小さく薄くする。
                  <span
                    className="flex flex-col items-center"
                    style={{ transform: "perspective(120px) rotateX(58deg)" }}
                  >
                    {[0, 1, 2].map((i) => (
                      <svg
                        key={i}
                        width={46 - i * 8}
                        height={20 - i * 3}
                        viewBox="0 0 46 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="animate-road-arrow -mt-1"
                        style={{
                          // 手前から順に光らせて、進む向きへ流れて見えるようにする
                          animationDelay: `${(2 - i) * 0.18}s`,
                          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
                        }}
                      >
                        <path
                          d="M2 18 L23 3 L44 18"
                          fill="none"
                          stroke="white"
                          strokeOpacity="0.95"
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ))}
                  </span>
                )}
                <span className="rounded-chip bg-black/65 px-2 py-1 font-display text-11 font-black text-white">
                  <Furigana text={walking ? "歩いています" : "タップで進む"} />
                </span>
                {turn !== null && !offscreen ? (
                  <span className="rounded-chip bg-primary px-2 py-1 font-display text-11 font-black text-ink">
                    <Furigana text={turn > 0 ? "この先 みぎにまがる →" : "← この先 ひだりにまがる"} />
                  </span>
                ) : null}
              </Tag>
            );
          })()
        : null}

      {/* 避難場所に着いたとき。広がる輪と、着いたことを示すバッジ。 */}
      {arrived ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 bottom-8 z-10 flex flex-col items-center justify-center gap-6"
        >
          <span className="relative grid place-items-center">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="animate-arrive-ring absolute size-20 rounded-full border-4 border-safe"
                style={{ animationDelay: `${i * 0.55}s` }}
              />
            ))}
            <span className="animate-arrive-badge grid size-16 place-items-center rounded-full bg-safe shadow-[0_4px_16px_rgba(0,0,0,0.45)]">
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
                <path
                  d="M8 17.5 L14.5 24 L26 11"
                  stroke="white"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
          {onReflect ? <button type="button" onClick={onReflect} className="pointer-events-auto min-h-12 rounded-full bg-primary px-6 font-bold text-ink shadow-lg">ふりかえる</button> : null}
        </div>
      ) : null}

      {/*
        HUD（現在地・残り距離など）。下端は帰属表示のために空けておく。
        ストリートビューのキャンバスが上に乗るので、z-10 で持ち上げる。
        中身側で pointer-events-auto を付けたものだけ押せる。
      */}
      <div className="pointer-events-none absolute inset-0 z-10">{children}
        {destination ? <div className="absolute right-3 top-16 flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-11 font-bold text-blue-800" aria-label="避難先の方角"><span aria-hidden style={{ display: "inline-block", transform: `rotate(${destinationHeading - pov}deg)` }}>↑</span>避難先の方角</div> : null}
      </div>
    </div>
  );
}
