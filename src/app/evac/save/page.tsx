"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { OfflineRouteSave } from "@/components/evac/OfflineRouteSave";
import { getEvac, useEvac } from "@/lib/evac";

/** Googleの地図・経路・Street Viewを描画せず、保存用のOSM地図を作成する。 */
export default function EvacSavePage() {
  const router = useRouter();
  const evac = useEvac();
  const { home, homeOrigin, shelter, finishedAt } = evac;

  useEffect(() => {
    const current = getEvac();
    if (!current.finishedAt || !current.home || !current.shelter) router.replace("/evac");
  }, [router, finishedAt, home, shelter]);

  return <GameShell>
    <GameHeader title="オフライン用の避難地図" subtitle="地図と経路を、この端末に保存" step={3} leading={
      <a href="/evac/report" aria-label="ふりかえりに戻る" className="grid size-11 shrink-0 place-items-center rounded-full bg-white"><GameIcon name="back" /></a>
    } />
    <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
      <p className="shrink-0 text-11 leading-relaxed text-ink-muted">同じ出発地点・避難先で保存用の経路を作成します。体験時と道順が異なる場合があります。</p>
      {home && shelter && finishedAt ? <div className="flex min-h-[340px] flex-1 flex-col">
        <OfflineRouteSave
          scenario={evac.scenario ?? "earthquake"}
          home={home}
          homeOrigin={homeOrigin}
          shelter={shelter}
          finishedAt={finishedAt}
          followUp={evac.followUp}
          demo={evac.mode === "mock"}
        />
      </div> : <p role="status" className="text-13 text-ink-muted">体験の記録を確認しています…</p>}
    </main>
  </GameShell>;
}
