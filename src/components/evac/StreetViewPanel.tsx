"use client";

import { useEffect, useRef, useState } from "react";
import { Furigana } from "@/components/ui/Furigana";
import type { LatLng } from "@/lib/evac-content";
import { hasMapsKey, loadMaps, onMapsAuthError } from "@/lib/gmaps";
import { streetViewUrl } from "@/lib/street-view";

type Props = {
  position: LatLng;
  heading: number;
  demo: boolean;
  moving: boolean;
  observing: boolean;
  disabled: boolean;
  onObservingChange: (observing: boolean) => void;
};

type Stop = { position: LatLng; heading: number };

/** 地図と同時に表示する。高速移動中のAPI連打を避け、停止地点で風景を更新する。 */
export function StreetViewPanel({ position, heading, demo, moving, observing, disabled, onObservingChange }: Props) {
  const [stop, setStop] = useState<Stop>({ position, heading });
  // 最後の停止地点を保持する。移動中は地図のコマだけを進める。
  if (!moving && (stop.position.lat !== position.lat || stop.position.lng !== position.lng || stop.heading !== heading)) {
    setStop({ position, heading });
  }
  const embedded = !demo && hasMapsKey();
  const url = streetViewUrl(stop.position, stop.heading);

  return (
    <section className="border-b border-border" aria-label="周囲のストリートビュー">
      <div className="flex items-center justify-between gap-2 bg-primary-soft px-3 py-2">
        <h2 className="font-display text-13 font-bold text-primary-ink">{demo ? "風景のサンプル" : "Street View"}</h2>
        <span className="text-11 text-ink-muted">{moving ? "直前の停止地点" : "この停止地点の周辺"}</span>
      </div>
      {embedded ? <Panorama position={stop.position} heading={stop.heading} /> : demo ? <DemoStreet /> : (
        <div className="flex min-h-[220px] items-center justify-center bg-canvas p-5 text-13 text-ink-muted">Street Viewを表示するにはGoogleマップのキーが必要です。</div>
      )}
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <p className="text-11 leading-relaxed text-ink-muted"><Furigana text={moving
          ? "移動中[いどうちゅう]は下[した]の地図[ちず]で位置[いち]を確認[かくにん]。止[と]まると風景[ふうけい]が更新[こうしん]されます。"
          : demo ? "サンプルのイラストです。現地[げんち]の風景[ふうけい]ではありません。"
          : "近[ちか]くで撮影[さつえい]された風景[ふうけい]です。現在[げんざい]の被害[ひがい]を示[しめ]すものではありません。"} /></p>
        <div className="flex items-center gap-2"><button
          type="button"
          disabled={disabled}
          aria-pressed={observing}
          onClick={() => onObservingChange(!observing)}
          className="min-h-11 flex-1 rounded-field border border-primary-mid bg-primary-soft px-3 py-2 font-display text-13 font-bold text-primary-ink disabled:opacity-50"
        ><Furigana text={observing ? "体験[たいけん]に戻[もど]る" : "周[まわ]りを見渡[みわた]す"} /></button>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-disabled={disabled} aria-label={demo ? "サンプル地点をGoogleマップで開く（別タブ）" : "この停止地点をGoogleマップで開く（別タブ）"} onClick={(event) => { if (disabled) event.preventDefault(); else onObservingChange(true); }} className="inline-flex min-h-11 shrink-0 items-center justify-center text-11 font-bold text-primary-ink underline underline-offset-4">
          Googleマップ ↗
        </a></div>
        {observing ? <p role="status" className="text-11 text-primary-ink"><Furigana text="確認中[かくにんちゅう]は、コマと問題[もんだい]のタイマーを止[と]めています。" /></p> : null}
      </div>
    </section>
  );
}

/** モック版は外部通信をせず、自作の街路イラストを表示する。 */
function DemoStreet() {
  return <div className="relative bg-[#fff5d5]">
    <svg viewBox="0 0 400 220" className="h-[220px] w-full" role="img" aria-label="住宅街を描いた練習用の風景イラスト" preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="220" fill="#fff5d5" />
      <circle cx="316" cy="42" r="23" fill="#ffdb55" />
      <path d="M0 126H400V220H0Z" fill="#eee6cf" />
      <path d="M176 126H224L346 220H54Z" fill="#c4bda9" />
      <path d="M180 126H186L114 220H101ZM214 126H220L299 220H286Z" fill="#fffdf4" />
      <path d="M197 151H203L207 169H193ZM191 186H209L213 212H187Z" fill="#ffedaa" />
      <path d="M0 55L78 82V160L0 192Z" fill="#d8ae57" />
      <path d="M78 82L121 72V146L78 160Z" fill="#f3d385" />
      <path d="M106 73L144 87V137L106 151Z" fill="#e9c579" />
      <path d="M256 75L311 62V160L256 138Z" fill="#ecd99b" />
      <path d="M311 62L400 31V189L311 160Z" fill="#d7bd79" />
      <g fill="#fcf5df"><path d="M16 83L39 91V112L16 106ZM51 96L68 102V123L51 118ZM16 130L39 134V157L16 164ZM91 101L105 98V115L91 119ZM268 90L286 85V103L268 105ZM326 83L351 77V101L326 106ZM366 71L393 62V92L366 98ZM326 121L351 123V146L326 138Z" /></g>
      <path d="M147 115V145M247 116V143" stroke="#8f7849" strokeWidth="5" />
      <circle cx="147" cy="103" r="17" fill="#92aa77" /><circle cx="247" cy="105" r="16" fill="#adc48d" />
      <path d="M208 134V107M198 107H218" stroke="#ae9256" strokeWidth="3" />
    </svg>
    <span className="absolute bottom-2 left-3 rounded-chip bg-surface px-2 py-1 text-11 font-bold text-primary-ink">モック版 · サンプル</span>
  </div>;
}

function Panorama({ position, heading }: { position: LatLng; heading: number }) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<google.maps.StreetViewPanorama | null>(null);
  const mapsRef = useRef<typeof google.maps | null>(null);
  const authFailed = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const unsubscribe = onMapsAuthError(() => { authFailed.current = true; viewer.current?.setVisible(false); setStatus("unavailable"); });
    return () => {
      unsubscribe();
      if (viewer.current) {
        viewer.current.setVisible(false);
        mapsRef.current?.event.clearInstanceListeners(viewer.current);
        viewer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let listener: google.maps.MapsEventListener | null = null;
    // 地点が変わったら前地点の画像を隠し、新しい取得の状態を表示する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    viewer.current?.setVisible(false);
    const unavailable = () => {
      if (!alive) return;
      viewer.current?.setVisible(false);
      setStatus("unavailable");
    };
    const timeout = setTimeout(() => { unavailable(); alive = false; }, 12000);
    void (async () => {
      try {
        const maps = await loadMaps();
        mapsRef.current = maps;
        const { StreetViewService, StreetViewPanorama } = await maps.importLibrary("streetView") as google.maps.StreetViewLibrary;
        if (!alive) return;
        const { data } = await new StreetViewService().getPanorama({ location: { lat: position.lat, lng: position.lng }, radius: 60, preference: "nearest", sources: ["outdoor"] });
        if (!alive || !container.current) return;
        if (authFailed.current) throw new Error("maps-auth-failed");
        if (!data.location?.pano) throw new Error("no-panorama");
        if (!viewer.current) {
          viewer.current = new StreetViewPanorama(container.current, {
            pano: data.location.pano, pov: { heading, pitch: 0 }, zoom: 0,
            addressControl: true, imageDateControl: true, fullscreenControl: true,
            motionTracking: false, motionTrackingControl: false,
            clickToGo: false, linksControl: false, enableCloseButton: false,
          });
        } else {
          // ビューアは再利用する。44msごとの移動や確認ボタンで生成し直さない。
          viewer.current.setPano(data.location.pano);
          viewer.current.setPov({ heading, pitch: 0 });
          viewer.current.setVisible(true);
        }
        listener = viewer.current.addListener("status_changed", () => {
          if (!alive || !viewer.current) return;
          const next = viewer.current.getStatus();
          if (next === "ZERO_RESULTS" || next === "UNKNOWN_ERROR") unavailable();
        });
        clearTimeout(timeout);
        setStatus("ready");
      } catch {
        clearTimeout(timeout);
        unavailable();
      }
    })();
    return () => { alive = false; clearTimeout(timeout); listener?.remove(); };
  }, [position.lat, position.lng, heading, attempt]);

  return <div className="relative h-[220px] bg-canvas">
    {status === "loading" ? <p role="status" className="absolute inset-0 flex items-center justify-center px-5 text-13 text-ink-muted">周囲の風景を読み込んでいます…</p> : null}
    {status === "unavailable" ? <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-canvas px-5 py-4 text-center">
      <p className="text-13 leading-relaxed text-ink-muted">この地点のStreet Viewを表示できませんでした。下の地図を見ながら体験を続けられます。</p>
      <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 text-13 font-bold text-primary-ink underline">風景をもう一度読み込む</button>
    </div> : null}
    {/* Googleの住所・撮影日・帰属表示を覆わない。画像の保存やAI送信は行わない。 */}
    <div ref={container} className={`h-full w-full ${status === "ready" ? "visible" : "invisible"}`} aria-label="この停止地点のストリートビュー" aria-busy={status === "loading"} />
  </div>;
}
