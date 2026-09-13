"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { hasMapsKey } from "@/lib/gmaps";
import { EVAC_MODE_LABEL, type EvacMode } from "@/lib/evac-mode";

export function EvacModeSelector({ mode, onChange }: { mode: EvacMode; onChange: (mode: EvacMode) => void }) {
  return <section aria-label="体験バージョン" className="rounded-panel border border-primary/40 bg-primary-soft p-4">
    <p className="mb-3 font-display text-sm font-bold text-ink">体験するバージョン</p>
    <div className="grid grid-cols-2 gap-2">
      {(["mock", "api"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => onChange(value)}
        className={`min-h-14 rounded-tile border px-2 py-3 font-display text-15 font-bold ${mode === value ? "border-primary-mid bg-primary text-ink" : "border-border bg-surface text-ink-muted"}`}>
        {EVAC_MODE_LABEL[value]}
        <span className="mt-1 block text-11 font-normal">{value === "mock" ? "キー不要" : "Googleマップ"}</span>
      </button>)}
    </div>
    <p className="mt-3 text-11 leading-relaxed text-ink-muted">{mode === "mock" ? "サンプルの地図と経路で、最後まで体験できます。" : "実際の地図・徒歩ルート・ストリートビューを使います。途中の問題は練習用の想定です。"}</p>
    <p className="mt-1 text-11 text-ink-soft">切り替えると、場所の選択と体験の記録をリセットします。</p>
  </section>;
}

export function EvacModeBadge({ mode }: { mode: EvacMode }) {
  return <div className="mb-2 flex items-center justify-between gap-2 text-11">
    <span className="rounded-chip bg-primary-soft px-2 py-1 font-bold text-primary-ink">{EVAC_MODE_LABEL[mode]} · {mode === "mock" ? "サンプル地図" : "Googleマップ"}</span>
    <Link href="/evac" className="py-2 text-ink-muted underline underline-offset-4">バージョンを選ぶ</Link>
  </div>;
}

/** API版の入口。設定不足なら外部リクエストを始めず、設定箇所を案内する。 */
export function EvacApiGate({ mode, children }: { mode: EvacMode; children: ReactNode }) {
  if (mode === "mock") return children;
  return <ApiConfiguration>{children}</ApiConfiguration>;
}

function ApiConfiguration({ children }: { children: ReactNode }) {
  if (hasMapsKey()) return children;
  return <section className="rounded-panel border border-border bg-surface p-5" aria-label="API版の設定">
    <h2 className="font-display text-lg font-bold text-ink">API版はキーの設定待ちです</h2>
    <p className="mt-2 text-13 leading-relaxed text-ink-muted">Google Mapsのキー1つで、地図・徒歩ルート・Street Viewを使えます。</p>
    <p className="mt-4 text-11 font-bold text-ink">設定する項目：未設定</p>
    <code className="mt-1 block break-all text-11 text-ink-muted">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>
    <details className="mt-4 text-13 text-ink-muted">
      <summary className="cursor-pointer py-2 font-bold text-primary-ink">キーを設定する手順</summary>
      <ol className="ml-4 list-decimal space-y-2 leading-relaxed">
        <li>Google Cloudの同じプロジェクトで請求先を設定し、Maps JavaScript API・Routes API・Geocoding API・Places API (New)を有効にします。キーは共通の1つです。</li>
        <li>キーのAPI制限に上記4つを指定し、ウェブサイト制限に利用先URLを登録します。ローカルは <code className="break-all">http://localhost:3000/*</code>、公開版は <code className="break-all">https://jishingoto.vercel.app/*</code> です。</li>
        <li>自分のパソコンでは、プロジェクトの.env.localで上の項目の「=」の右側にキーを貼り付けて保存し、開発サーバーを再起動します。</li>
        <li>公開版はVercelのSettings → Environment Variablesへ同じ名前で登録し、Productionに再デプロイします。</li>
      </ol>
    </details>
    <p className="mt-3 text-11 text-ink-soft">今すぐサンプルで試す場合は、上でモック版を選んでください。</p>
    <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 text-13 font-bold text-primary-ink underline underline-offset-4">設定後にページを読み直す</button>
  </section>;
}
