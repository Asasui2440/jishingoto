"use client";

import { useEffect, useRef, useState } from "react";
import { HazardSketch } from "./HazardSketch";
import type { EventKind, LatLng } from "@/lib/evac-content";
import { hasMapsKey, loadMaps } from "@/lib/gmaps";

const ZONE_LABELS: Record<EventKind, string> = {
  wall: "想定：塀・ブロック",
  fall: "想定：落下物",
  closed: "想定：通行止め",
};

type Props = {
  position: LatLng;
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
  height?: number;
  children?: React.ReactNode;
};

/**
 * ストリートビュー（現実の場所を理解するための背景）。
 *
 * ■ 守っていること（仕様 7・9・11）
 *   - パノラマ ID を保存せず、毎回 緯度経度から取り直す
 *   - 画像をアプリ側で保存・キャッシュしない
 *   - Google の帰属表示にオーバーレイを重ねない
 *     （下端は空けて、下部シートはパノラマの外に置く）
 *   - 実在の建物が壊れて見える加工はしない。
 *     重ねるのは半透明の「想定範囲」と番号だけ。
 */
export function StreetStage({
  position,
  heading,
  kind = null,
  zone = null,
  zoneNumber,
  showArrow = false,
  turn = null,
  walking = false,
  height = 260,
  children,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [mode, setMode] = useState<"loading" | "pano" | "sketch">(
    hasMapsKey() ? "loading" : "sketch",
  );

  // 依存は緯度経度の「値」で持つ。オブジェクトのままだと毎レンダーで
  // getPanorama() を呼び直してしまう（課金にも響く）。
  const { lat, lng } = position;

  // イベントが変わるたびに key を変えて、枠の出現アニメーションを出し直す
  const zoneKey = zone ? `${kind ?? "-"}:${zoneNumber ?? 0}:${zone.x},${zone.y}` : "";

  useEffect(() => {
    if (!hasMapsKey()) return;
    let alive = true;

    void loadMaps()
      .then(async (maps) => {
        // パノラマは緯度経度から探す（ID には依存しない）
        const service = new maps.StreetViewService();
        const { data } = await service.getPanorama({
          location: { lat, lng },
          radius: 120,
          source: maps.StreetViewSource.OUTDOOR,
        });
        if (!alive || !boxRef.current || !data.location?.latLng) {
          throw new Error("no-pano");
        }

        if (!panoRef.current) {
          panoRef.current = new maps.StreetViewPanorama(boxRef.current, {
            position: data.location.latLng,
            pov: { heading, pitch: 0 },
            zoom: 0,
            // 帰属表示（Google ロゴ・撮影時期）はそのまま出す
            addressControl: true,
            linksControl: false,
            panControl: false,
            zoomControl: false,
            fullscreenControl: false,
            motionTracking: false,
            motionTrackingControl: false,
            enableCloseButton: false,
            showRoadLabels: false,
          });
        } else {
          panoRef.current.setPosition(data.location.latLng);
          panoRef.current.setPov({ heading, pitch: 0 });
        }
        if (alive) setMode("pano");
      })
      .catch(() => {
        // パノラマが無い・キーが無効などのときは想定図に切り替える
        if (alive) setMode("sketch");
      });

    return () => {
      alive = false;
    };
  }, [lat, lng, heading]);

  return (
    <div className="relative w-full overflow-hidden rounded-panel bg-ink" style={{ height }}>
      {/* パノラマの器。sketch のときは隠す（画像は保存もキャッシュもしない） */}
      <div
        ref={boxRef}
        className={["absolute inset-0", mode === "pano" ? "" : "invisible"].join(" ")}
      />

      {mode !== "pano" ? (
        <>
          <HazardSketch kind={kind} className="absolute inset-0 h-full w-full" />
          <span className="absolute bottom-2 left-2 rounded-chip bg-black/60 px-2 py-1 text-11 font-bold text-white">
            {mode === "loading" ? "ストリートビューを探しています..." : "想定図（イラスト）"}
          </span>
        </>
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
            className="animate-zone-flash pointer-events-none absolute inset-x-0 top-0 bottom-8 bg-white"
          />

          <div
            key={`zone-${zoneKey}`}
            aria-hidden
            className="animate-zone-lock pointer-events-none absolute"
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

      {/* 進行方向の案内。パノラマは進行方向を向けてあるので、まっすぐ＝進む向き。 */}
      {showArrow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1"
        >
          <svg
            width="44"
            height="60"
            viewBox="0 0 44 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={walking ? "animate-pulse" : ""}
          >
            <filter id="street-arrow-shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
            </filter>
            <path
              d="M22 4 L38 26 H28 V56 H16 V26 H6 Z"
              fill="white"
              fillOpacity="0.92"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              filter="url(#street-arrow-shadow)"
            />
          </svg>
          <span className="rounded-chip bg-black/65 px-2 py-1 font-display text-11 font-black text-white">
            {walking ? "歩いています" : "この向きに進む"}
          </span>
          {turn !== null ? (
            <span className="rounded-chip bg-primary px-2 py-1 font-display text-11 font-black text-ink">
              {turn > 0 ? "この先 みぎにまがる →" : "← この先 ひだりにまがる"}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* HUD（現在地・残り距離など）。下端は帰属表示のために空けておく。 */}
      {children}
    </div>
  );
}
