"use client";
import { useEffect, useState } from "react";
import { useEvac } from "@/lib/evac";
import type { LatLng } from "@/lib/evac-content";
import type { GeoConfig } from "@/lib/geo-types";

export function GeoAnalysisSettings({
  onPickRegion,
}: {
  onPickRegion: (center: LatLng, name: string) => void;
}) {
  const { analysisMode, update } = useEvac();
  const [config, setConfig] = useState<GeoConfig | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/evac/regions", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("unavailable");
        return r.json() as Promise<GeoConfig>;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setConfig(value);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section
      className="flex flex-col gap-3 rounded-panel border border-primary/40 bg-primary-soft p-4"
      aria-label="出題方法とAI対応地域"
    >
      <h2 className="font-display text-15 font-bold text-ink">
        出題する場所の選び方
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {[
          { value: "geo-ai" as const, label: "地理データ＋AI" },
          { value: "sample" as const, label: "固定の練習問題" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={(analysisMode ?? "geo-ai") === option.value}
            onClick={() =>
              update({
                analysisMode: option.value,
                walk: null,
                decisions: [],
                finishedAt: null,
              })
            }
            className={`min-h-12 rounded-field border px-2 py-2 text-13 font-bold ${analysisMode === option.value ? "border-primary-mid bg-primary text-ink" : "border-border bg-surface text-ink-muted"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-11 leading-relaxed text-ink-muted">
        AIは収録した地理データを読み、地震時に注意を考える地点を選びます。Googleマップの画像はAIに送りません。
      </p>
      {config ? (
        <>
          <p className="text-13 font-bold text-primary-ink">
            地理データを収録したエリア
          </p>
          <div className="flex flex-wrap gap-2">
            {config.regions.map((region) => (
              <button
                type="button"
                key={region.id}
                onClick={() => onPickRegion(region.center, region.name)}
                className="min-h-11 rounded-field border border-primary-mid bg-surface px-3 py-2 text-13 font-bold text-primary-ink"
              >
                {region.name}
              </button>
            ))}
          </div>
          <p className="text-11 text-ink-muted">
            各中心地の周辺の一部を収録しています。東京・神奈川の全域には対応していません。経路が範囲を外れる場合は案内します。
          </p>
          {!config.aiConfigured && analysisMode !== "sample" ? (
            <p
              role="status"
              className="rounded-field bg-surface p-3 text-13 text-ink-muted"
            >
              地理データは準備済みです。AI解析は管理者のキー設定待ちです。「固定の練習問題」では今すぐ体験できます。
            </p>
          ) : null}
          <a
            href={config.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-9 text-11 text-primary-ink underline"
          >
            {config.source.name}
          </a>
        </>
      ) : error ? (
        <div>
          <p role="alert" className="text-13 text-ink-muted">
            対応地域を確認できませんでした。
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="min-h-11 text-13 font-bold text-primary-ink underline"
          >
            対応地域をもう一度取得する
          </button>
        </div>
      ) : (
        <p role="status" className="text-11 text-ink-muted">
          対応地域を確認しています…
        </p>
      )}
    </section>
  );
}
