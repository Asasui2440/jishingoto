"use client";

import { Furigana } from "@/components/ui/Furigana";

import { useEffect, useRef, useState } from "react";
import { HazardSketch } from "./HazardSketch";
import type { EventKind, LatLng } from "@/lib/evac-content";
import { hasMapsKey, loadMaps } from "@/lib/gmaps";

const ZONE_LABELS: Record<EventKind, string> = {
  wall: "想定：塀・ブロック",
  fall: "想定：落下物",
  closed: "想定：通行止め",
};

/* ------------------------------------------------------------------ */
/* 隣のパノラマを辿って歩く                                              */
/* ------------------------------------------------------------------ */

/**
 * ストリートビューのパノラマは道沿いに 10m 前後の間隔で並んでいて、
 * それぞれが隣への `links` を持っている。これを辿ると、
 * Google マップ本家と同じ「歩いている」動きになる。
 *
 * 緯度経度から `getPanorama()` で取り直すと毎回ワープしてしまううえ、
 * 1歩ごとにサービス呼び出しが要る。`setPano()` なら滑らかで、呼び出しも減る。
 */

/** 1歩ぶんの移動を待つ上限 */
const HOP_TIMEOUT_MS = 900;
/** 1回の前進で辿る最大の歩数 */
const MAX_HOPS = 12;
/** 目的地にこれだけ近づけたら着いたとみなす（m） */
const ARRIVE_M = 18;
/** 目的地の方向からこれ以上ずれる道しかなければ、辿るのをやめる（度） */
const MAX_TURN_DEG = 70;
/** 辿りきれずこれ以上離れていたら、位置で補正する（m） */
const SNAP_M = 45;

/** 隣のパノラマへ1歩移動して、移動が終わるまで待つ */
function hopTo(pano: google.maps.StreetViewPanorama, panoId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    let listener: google.maps.MapsEventListener | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      listener?.remove();
      if (timer) clearTimeout(timer);
      resolve();
    };

    listener = pano.addListener("position_changed", finish);
    // イベントが来なくても止まらないように
    timer = setTimeout(finish, HOP_TIMEOUT_MS);
    pano.setPano(panoId);
  });
}

/**
 * いまのパノラマから、目的地に向かって隣へ隣へと辿る。
 *
 * 辿れる道が無い・目的地から逸れる道しかない場合は途中でやめて、
 * 最後に位置で補正する。経路から外れたまま歩き続けないようにするため。
 */
async function walkTo(
  pano: google.maps.StreetViewPanorama,
  maps: typeof google.maps,
  target: LatLng,
  facing: number,
  isCurrent: () => boolean,
) {
  const { computeHeading, computeDistanceBetween } = maps.geometry.spherical;
  const dest = new maps.LatLng(target.lat, target.lng);

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!isCurrent()) return;

    const here = pano.getPosition();
    if (!here) break;
    const left = computeDistanceBetween(here, dest);
    if (left <= ARRIVE_M) break;

    const links = pano.getLinks();
    if (!links || links.length === 0) break;

    // 目的地の方角にいちばん近い道を選ぶ
    const want = computeHeading(here, dest);
    let best: google.maps.StreetViewLink | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const link of links) {
      if (!link?.pano || typeof link.heading !== "number") continue;
      const diff = Math.abs(((link.heading - want + 540) % 360) - 180);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = link;
      }
    }
    if (!best?.pano || bestDiff > MAX_TURN_DEG) break;

    await hopTo(pano, best.pano);

    // 近づいていなければ堂々巡り。抜ける。
    const now = pano.getPosition();
    if (!now || computeDistanceBetween(now, dest) >= left) break;
  }

  if (!isCurrent()) return;

  // 辿りきれなかったぶんは位置で補正して、経路の上に戻す
  const here = pano.getPosition();
  if (!here || computeDistanceBetween(here, dest) > SNAP_M) {
    const service = new maps.StreetViewService();
    const { data } = await service.getPanorama({
      location: target,
      radius: 120,
      source: maps.StreetViewSource.OUTDOOR,
    });
    if (!isCurrent()) return;
    if (data.location?.latLng) pano.setPosition(data.location.latLng);
  }

  pano.setPov({ heading: facing, pitch: 0 });
}

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
  /** 矢印をタップしたとき。渡すと矢印が押せるようになる（自分で進む） */
  onAdvance?: () => void;
  /** 避難場所に着いたか。着いたときの演出に使う */
  arrived?: boolean;
  height?: number;
  children?: React.ReactNode;
};

/** 進む向きが画面のどこに見えるか。これを超えると画面の端に寄せる（度） */
const HALF_FOV_DEG = 45;

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
  onAdvance,
  arrived = false,
  height = 260,
  children,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [mode, setMode] = useState<"loading" | "pano" | "sketch">(
    hasMapsKey() ? "loading" : "sketch",
  );
  /** いま見ている向き。見回しても矢印が進行方向を指し続けるように追う。 */
  const [pov, setPov] = useState(heading);

  // 依存は緯度経度の「値」で持つ。オブジェクトのままだと毎レンダーで
  // getPanorama() を呼び直してしまう（課金にも響く）。
  const { lat, lng } = position;

  // イベントが変わるたびに key を変えて、枠の出現アニメーションを出し直す
  const zoneKey = zone ? `${kind ?? "-"}:${zoneNumber ?? 0}:${zone.x},${zone.y}` : "";

  // 前進が重ならないようにする世代番号。新しい目的地が来たら古い歩行は打ち切る。
  const moveIdRef = useRef(0);

  useEffect(() => {
    if (!hasMapsKey()) return;
    const moveId = ++moveIdRef.current;
    const isCurrent = () => moveIdRef.current === moveId;
    let alive = true;

    void loadMaps()
      .then(async (maps) => {
        if (!alive || !boxRef.current) throw new Error("gone");

        if (!panoRef.current) {
          // 最初の1回だけ、緯度経度からパノラマを探す（ID は保存しない）
          const service = new maps.StreetViewService();
          const { data } = await service.getPanorama({
            location: { lat, lng },
            radius: 120,
            source: maps.StreetViewSource.OUTDOOR,
          });
          if (!alive || !boxRef.current || !data.location?.latLng) {
            throw new Error("no-pano");
          }
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
          // 見回しても矢印が進行方向を指し続けるように、視点の向きを追う
          panoRef.current.addListener("pov_changed", () => {
            const p = panoRef.current?.getPov();
            if (p) setPov(p.heading);
          });
        } else {
          // 2回目以降は隣のパノラマを辿って歩く（ワープさせない）
          await walkTo(panoRef.current, maps, { lat, lng }, heading, isCurrent);
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
      {showArrow
        ? (() => {
            // 進行方向と、いま見ている向きの差（-180〜180。＋が右）
            const rel = ((heading - pov + 540) % 360) - 180;
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
                  <Furigana text={walking ? "歩いています" : offscreen ? "むきをかえる" : "タップで進む"} />
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
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 bottom-8 z-10 grid place-items-center"
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
        </div>
      ) : null}

      {/*
        HUD（現在地・残り距離など）。下端は帰属表示のために空けておく。
        ストリートビューのキャンバスが上に乗るので、z-10 で持ち上げる。
        中身側で pointer-events-auto を付けたものだけ押せる。
      */}
      <div className="pointer-events-none absolute inset-0 z-10">{children}</div>
    </div>
  );
}
