"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LatLng, RouteOption, Shelter } from "@/lib/evac-content";
import { distanceM } from "@/lib/evac-api";
import { loadMaps } from "@/lib/gmaps";
import { EvacMap } from "./EvacMap";

export function HybridWalkStage({ position, heading, home, shelter, route, path, floodHazard, arrived, onReflect, children }: {
  position: LatLng; heading: number; home: LatLng; shelter: Shelter; route: RouteOption;
  path: LatLng[]; floodHazard: boolean; arrived: boolean; onReflect: () => void; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const headingRef = useRef(heading);
  const [image, setImage] = useState<{ key: string; status: "ready" | "missing" | "error" } | null>(null);
  const [mapOnly, setMapOnly] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { lat, lng } = position;
  const key = `${lat}:${lng}:${attempt}`;
  // Keep the last rendered view while checking the next point.
  const status = image?.status ?? "loading";
  const checking = !mapOnly && image?.key !== key;

  useEffect(() => {
    headingRef.current = heading;
    panoramaRef.current?.setPov({ heading, pitch: 0 });
  }, [heading]);

  useEffect(() => {
    const element = box.current;
    const observer = new ResizeObserver(() => {
      if (panoramaRef.current) window.google?.maps?.event.trigger(panoramaRef.current, "resize");
    });
    if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      const panorama = panoramaRef.current;
      panorama?.setVisible(false);
      if (panorama) window.google?.maps?.event.clearInstanceListeners(panorama);
      panoramaRef.current = null;
      element?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    // Missing imagery locks the map until the user explicitly asks to retry.
    if (mapOnly) return;
    let alive = true;
    let listener: google.maps.MapsEventListener | undefined;
    const element = box.current;
    const finish = (status: "missing" | "error") => {
      if (!alive) return;
      alive = false;
      panoramaRef.current?.setVisible(false);
      setImage({ key, status });
      setMapOnly(true);
    };
    const timeout = setTimeout(() => finish("error"), 10000);
    void loadMaps().then(async maps => {
      const position = { lat, lng };
      const { data } = await new maps.StreetViewService().getPanorama({ location: position, radius: 15,
        preference: maps.StreetViewPreference.NEAREST, sources: [maps.StreetViewSource.OUTDOOR, maps.StreetViewSource.GOOGLE] });
      if (!alive || !element) return;
      const location = data.location;
      // Imagery on a nearby parallel road must not move the simulated walker there.
      if (!location?.pano || !location.latLng || distanceM(position, { lat: location.latLng.lat(), lng: location.latLng.lng() }) > 10) {
        clearTimeout(timeout); finish("missing"); return;
      }
      const existing = panoramaRef.current;
      const panorama = existing ?? new maps.StreetViewPanorama(element, { pano: location.pano, pov: { heading: headingRef.current, pitch: 0 }, zoom: 0,
        addressControl: false, linksControl: false, panControl: false, zoomControl: false, fullscreenControl: false,
        motionTracking: false, motionTrackingControl: false, enableCloseButton: false, showRoadLabels: false, clickToGo: false });
      panoramaRef.current = panorama;
      const check = () => {
        if (!alive || panorama.getPano() !== location.pano) return;
        const status = panorama.getStatus();
        if (status === "OK") {
          clearTimeout(timeout);
          panorama.setVisible(true);
          setImage({ key, status: "ready" });
        } else if (status) { clearTimeout(timeout); finish("error"); }
      };
      listener = panorama.addListener("status_changed", check);
      if (existing && existing.getPano() !== location.pano) panorama.setPano(location.pano);
      else check();
    }).catch(problem => {
      clearTimeout(timeout);
      const code = problem instanceof Error ? problem.message : String(problem?.code ?? problem);
      finish(/ZERO_RESULTS/.test(code) ? "missing" : "error");
    });
    return () => { alive = false; clearTimeout(timeout); listener?.remove(); };
  }, [key, lat, lng, mapOnly]);

  return <div role="region" aria-label="地図とStreet Viewで進む体験" data-scene-state={status} data-checking-imagery={checking} className="relative h-full min-h-40 overflow-hidden rounded-panel bg-canvas">
    <EvacMap mode="api" center={position} home={home} shelters={[shelter]} routes={[route]} activeRouteId={route.id}
      walker={position} walkerHeading={heading} traveledPath={path} floodHazard={floodHazard} fill className="h-full" />
    <div ref={box} inert={arrived || status !== "ready"} aria-hidden={status !== "ready"}
      onKeyDownCapture={event => { if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); } }}
      className={`absolute inset-0 ${status === "ready" ? "" : "invisible"}`} />
    <div className="pointer-events-none absolute inset-0 z-10" inert={arrived}>{children}</div>
    <div className="absolute inset-x-3 bottom-10 z-10 rounded-xl bg-white/95 px-3 py-2 text-center text-11 font-bold text-ink">
      <p role="status">{status === "ready" ? checking ? "前の地点の風景を表示中・次の地点を確認しています" : "地点付近のStreet View・選んだルートに沿って進みます" : checking ? "地図に沿って進めます・付近の風景を確認中" : status === "missing" ? "画像がないため、地図表示で進みます" : "風景を読み込めないため、地図表示で進みます"}</p>
      {status !== "ready" && image && !arrived ? <button type="button" disabled={!mapOnly} onClick={() => { setAttempt(value => value + 1); setMapOnly(false); }}
        className="mt-1 min-h-11 rounded-full border border-border bg-white px-4 text-11 disabled:opacity-50">{mapOnly ? "Street Viewを再確認" : "風景を確認中…"}</button> : null}
    </div>
    {arrived ? <div data-testid="arrival-overlay" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-white/95 p-4">
      <p role="status" className="font-bold text-ink">到着しました</p>
      <p className="text-13 text-ink-muted">選んだルートの終点まで体験しました</p>
      <button type="button" onClick={onReflect} className="min-h-12 rounded-full bg-primary px-6 font-bold text-ink">ふりかえる</button>
    </div> : null}
  </div>;
}
