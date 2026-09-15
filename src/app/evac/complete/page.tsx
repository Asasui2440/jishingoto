"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { getEvac, useEvac } from "@/lib/evac";
import { exportEvacRoute } from "@/lib/evac-export";

export default function EvacCompletePage() {
  const router = useRouter();
  const evac = useEvac();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!getEvac().finishedAt) router.replace("/evac"); }, [router]);
  const save = () => {
    setError(null);
    try {
      const file = new Blob([JSON.stringify(exportEvacRoute(getEvac()), null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `jishingoto-route-${new Date(evac.finishedAt ?? Date.now()).toISOString().slice(0, 10)}.geojson`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(true);
    } catch {
      setError("ルートを保存できませんでした。もう一度試してください。");
    }
  };
  const restart = () => {
    const {mode,scenario,analysisMode,home,homeLabel,homeOrigin,shelter,timerSeconds,roomFinishedAt,reset,update} = evac;
    reset(); update({mode,scenario,analysisMode,home,homeLabel,homeOrigin,shelter,timerSeconds,roomFinishedAt});
    router.push("/evac/routes");
  };
  return <GameShell>
    <GameHeader title="振り返りが終わりました" subtitle="記録を残したり、別の道を試したりできます" step={3} onBack={() => router.push("/evac/report")} />
    <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
      <section className="space-y-2 rounded-panel border border-border bg-surface p-3">
        <h2 className="flex items-center gap-2 font-bold"><GameIcon name="route" />今回のルート</h2>
        <p className="text-13"><Furigana text={`${evac.homeLabel ?? "出発地点"} → ${evac.shelter?.name ?? "避難先"}`} /></p>
        <p className="text-11 text-ink-muted">通った道と次の備えを、ルートファイルとしてこの端末にダウンロードできます。</p>
        <Button size="md" variant="outline" onClick={save}>{saved ? "ルートをもう一度保存" : "ルートをこの端末に保存"}</Button>
        {saved ? <p role="status" className="text-13 font-bold text-safe">保存用ファイルをダウンロードしました。</p> : null}
        {error ? <p role="alert" className="text-13 text-danger">{error}</p> : null}
      </section>
    </main>
    <div className="shrink-0 space-y-2 border-t border-border bg-surface px-4 py-2"><p className="text-center text-11 text-ink-muted">同じ出発地点・避難先で、別の道も試せます。</p><Button size="md" onClick={restart}>別のルートで試す</Button></div>
  </GameShell>;
}
