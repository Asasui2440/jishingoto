"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng, Shelter } from "@/lib/evac-content";

type Props = { purpose?: "home"; routeId?: string; routeLabel?: string; scenario: "earthquake" | "flood"; home: LatLng; shelter: Shelter; finishedAt: number; followUp: string | null; demo: boolean };

/** Only the user's endpoints and notes cross into the downloadable OSM map. */
export function OfflineRouteSave(props: Props) {
  const routeId = props.routeId ?? `report-${props.finishedAt}`;
  const frame = useRef<HTMLIFrameElement>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let ready = false;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "OFFLINE_REPORT_READY") {
        ready = true;
        setError(null);
        frame.current.contentWindow?.postMessage({ type: "OFFLINE_REPORT_LOAD", payload: {
          scenario: props.scenario, id: routeId, purpose: props.purpose, routeLabel: props.routeLabel, start: props.home, shelter: props.shelter.position,
          name: props.shelter.name.replace(/\[[^\]]*\]/g, ""), kind: props.shelter.kind,
          source: props.shelter.source, notes: props.followUp?.replace(/\[[^\]]*\]/g, "") ?? "", demo: props.demo,
        } }, window.location.origin);
      }
      if (event.data?.type === "OFFLINE_REPORT_SAVED" && event.data.id === routeId) {
        setSavedUrl(`/offline-evac/index.html?route=${encodeURIComponent(event.data.id)}`);
      }
    };
    window.addEventListener("message", receive);
    // An older shell may finish updating during the first load. Reopen it once.
    const timer = window.setTimeout(() => {
      if (!ready) {
        if (attempt === 0) setAttempt(1);
        else setError("保存画面を開けませんでした。通信を確認して、閉じてからもう一度お試しください。");
      }
    }, 12000);
    return () => { window.removeEventListener("message", receive); window.clearTimeout(timer); };
  }, [routeId, props.purpose, props.routeLabel, props.scenario, props.home, props.shelter, props.finishedAt, props.followUp, props.demo, attempt]);

  return <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
    {error ? <p role="alert" className="text-13 text-red-700">{error}</p> : null}
    {savedUrl ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-13">
      <p className="font-bold">この端末に保存しました</p>
      <a href={savedUrl} className="mt-2 inline-flex min-h-11 items-center font-bold text-primary-ink underline">保存したマップを開く</a>
      <p className="mt-1 text-11 text-ink-muted">次からは、いつもの入口から開いても圏外なら保存マップに切り替わります。</p>
    </div> : null}
    <iframe key={attempt} ref={frame} src="/offline-evac/index.html?from=report" title={props.purpose === "home" ? "保存する自宅への地図と経路" : "保存するオフライン地図と避難所"} className="min-h-0 w-full flex-1 rounded-xl border border-border" />
  </div>;
}
