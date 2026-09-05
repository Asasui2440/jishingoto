"use client";

import { useEffect, useRef, useState } from "react";
import { HazardSketch } from "./HazardSketch";
import type { EventKind, LatLng } from "@/lib/evac-content";
import { hasMapsKey, loadMaps } from "@/lib/gmaps";

type Props = {
  position: LatLng;
  /** 進行方向（度）。パノラマの初期の向きに使う */
  heading: number;
  /** イベント発生中なら、その種類。デモ表示のイラストにも使う */
  kind?: EventKind | null;
  /** 想定の危険範囲（％）。番号マーカーと半透明の枠を重ねる */
  zone?: { x: number; y: number; w: number; h: number } | null;
  zoneNumber?: number;
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

      {/* 想定の危険範囲。実在の建物を壊して見せる加工はしない。 */}
      {zone ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-field border-[3px] border-dashed border-warn bg-warn/25"
          style={{
            left: `${zone.x}%`,
            top: `${zone.y}%`,
            width: `${zone.w}%`,
            height: `${zone.h}%`,
          }}
        />
      ) : null}
      {zone && zoneNumber ? (
        <span
          className="pointer-events-none absolute grid size-7 place-items-center rounded-full bg-warn font-display text-13 font-black text-ink shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
          style={{
            left: `calc(${zone.x + zone.w / 2}% - 14px)`,
            top: `calc(${zone.y + zone.h / 2}% - 14px)`,
          }}
        >
          {zoneNumber}
        </span>
      ) : null}

      {/* HUD（現在地・残り距離など）。下端は帰属表示のために空けておく。 */}
      {children}
    </div>
  );
}
