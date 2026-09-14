"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EVAC_SCENARIOS } from "@/lib/evac-scenario";
import { BottomSheet, GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { eventTitle } from "@/lib/evac-display";
import { DecisionRating } from "@/components/evac/DecisionRating";
import { ChoiceTradeoffs } from "@/components/evac/ChoiceTradeoffs";
import { ReviewIllustrations } from "@/components/evac/ReviewIllustrations";
import { RoomConnectionSummary } from "@/components/evac/RoomConnectionSummary";
import { RouteLegend } from "@/components/evac/RouteLegend";
import { EvacModeBadge } from "@/components/evac/EvacMode";
import { EvacMap } from "@/components/evac/EvacMap";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { reviewDecisions } from "@/lib/evac-review";
import { formatDistance, formatDuration, getEvac, totalSeconds, useEvac } from "@/lib/evac";
import { walkedPath, walkDistance } from "@/lib/evac-walk";
import { useSession } from "@/lib/session";

type Sheet = "decision" | "route" | "help" | "room" | null;

/** 記録は地図で一覧し、選択の理由と次の行動はその場で開いて確かめる。 */
export default function EvacReportPage() {
  const router = useRouter();
  const evac = useEvac();
  const room = useSession();
  const { mode, home, shelter, routes, startRouteId, takenRouteIds, decisions, walk } = evac;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapHeight, setMapHeight] = useState(200);
  const mapBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getEvac().finishedAt) router.replace("/evac");
  }, [router]);

  // 地図だけが余白に伸び縮みし、短いスマホでも操作を画面内に残す。
  useEffect(() => {
    const box = mapBox.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      setMapHeight(Math.max(80, Math.floor(entry.contentRect.height) - (mode === "mock" ? 27 : 0)));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [mode]);

  const startRoute = routes.find((route) => route.id === startRouteId) ?? null;
  const rows = useMemo(() => reviewDecisions({decisions,walk}), [decisions,walk]);
  const selectedIndex = rows.findIndex(({ d }) => d.pointId === selectedId);
  const selected = rows[selectedIndex];
  const connectedRoom = !!room.finishedAt && evac.roomFinishedAt === room.finishedAt;
  const trail = walkedPath(walk);
  const changed = takenRouteIds.length > 1;
  const selectDecision = (id: string) => {
    setSelectedId(id);
    setSheet("decision");
  };
  const sheetTitle = sheet === "decision" ? `判断 ${selectedIndex + 1} / ${rows.length}`
    : sheet === "route" ? "通った道の記録"
    : sheet === "room" ? "部屋から避難まで"
    : "この記録について";

  return (
    <GameShell>
      <GameHeader
        title="ふりかえり"
        subtitle={`${EVAC_SCENARIOS[evac.scenario ?? "earthquake"].label}｜歩いた道と、選んだこと`}
        step={3}
        onHelp={() => setSheet("help")}
        actions={connectedRoom ? (
          <button type="button" onClick={() => setSheet("room")} className="min-h-11 rounded-full bg-primary-soft px-3 text-11 font-bold text-primary-ink" aria-label="部屋から避難までの体験を見返す"><Furigana text="部屋[へや]" /></button>
        ) : undefined}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-3">
        <dl className="grid shrink-0 grid-cols-3 divide-x divide-border rounded-tile bg-canvas py-2.5 text-center">
          <div><dt className="text-11 text-ink-muted"><Furigana text="考[かんが]えた場面[ばめん]" /></dt><dd className="mt-0.5 font-display text-xl font-bold">{rows.length}<span className="ml-1 text-11 font-medium">地点</span></dd></div>
          <div><dt className="text-11 text-ink-muted"><Furigana text="歩[ある]いた距離[きょり]" /></dt><dd className="mt-1 font-display text-15 font-bold">{formatDistance(walk ? walkDistance(walk) : startRoute?.distanceM ?? 0)}</dd></div>
          <div><dt className="text-11 text-ink-muted"><Furigana text="想定時間[そうていじかん]" /></dt><dd className="mt-1 font-display text-15 font-bold">{formatDuration(totalSeconds(evac))}</dd></div>
        </dl>

        <div ref={mapBox} className="relative min-h-[110px] flex-1 overflow-hidden rounded-panel border border-border">
          <EvacMap floodHazard={evac.scenario === "flood"}
            mode={mode}
            center={home ?? { lat: 35.7186, lng: 139.7237 }}
            home={home}
            shelters={shelter ? [shelter] : []}
            selectedShelterId={shelter?.id ?? null}
            routes={startRoute ? [startRoute] : []}
            activeRouteId={startRouteId}
            traveledPath={walk ? trail : undefined}
            markers={rows.flatMap(({ d }, index) => d.position ? [{ id: d.pointId, position: d.position, label: String(index + 1), color: selectedId === d.pointId ? "#ffcc00" : "#fff6d6", title: `判断${index + 1}の記録を見る`, onClick: () => selectDecision(d.pointId) }] : [])}
            height={mapHeight}
            className="h-full"
          />
          <button type="button" onClick={() => setSheet("route")} aria-label="避難先と通った経路の詳細" className="absolute top-2 right-2 flex min-h-11 max-w-[75%] items-center gap-2 rounded-full border border-border bg-surface/95 px-3 text-11 font-bold text-ink shadow-sm">
            <GameIcon name="flag" className="size-4 shrink-0" />
            <span className="truncate"><Furigana text={shelter?.name ?? "経路の記録"} /></span>
            <GameIcon name="info" className="size-4 shrink-0" />
          </button>
        </div>
        <div className="shrink-0"><RouteLegend /></div>

        <section className="shrink-0" aria-label="それぞれの判断">
          {rows.length ? <div>
            <p className="mb-1 text-13 font-bold text-ink"><Furigana text="番号のボタンを押すと、その場面と選んだ行動を見返せます。" /></p>
            <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-11 font-bold text-ink"><Furigana text="判断[はんだん]の記録[きろく]" /></h2>
            <div className="flex gap-2 overflow-x-auto p-1" aria-label="番号から判断の記録を開く">
              {rows.map(({ d, choice, event }, index) => (
                <button type="button" key={d.pointId} onClick={() => selectDecision(d.pointId)} aria-label={`判断${index + 1}：${choice.label.replace(/\[[^\]]*\]/g, "")}の記録を見る`} className={`flex min-h-11 shrink-0 items-center gap-1 px-2 rounded-full border font-display text-15 font-bold text-primary-ink ${selectedId === d.pointId ? "border-primary-mid bg-primary" : "border-border bg-primary-soft"}`}>
                  <span className="text-11">{index + 1}</span><DecisionRating event={event} choice={choice} compact />
                </button>
              ))}
            </div>
          </div></div> : <button type="button" onClick={() => setSheet("help")} className="flex min-h-11 w-full items-center gap-2 rounded-field bg-primary-soft px-3 py-2 text-left text-11 text-primary-ink"><GameIcon name="info" className="size-4 shrink-0" /><span>今回は出題なし。経路の安全を示すものではありません。</span></button>}
        </section>

        <Button onClick={() => router.push("/evac/summary")}>判断のスコアを見る<GameIcon name="chevron" className="size-5" /></Button>
      </main>

      <BottomSheet open={sheet !== null} title={sheetTitle} onClose={() => setSheet(null)}>
        {sheet === "decision" && selected ? <div className="space-y-4">
          <div>
            <p className="text-15 font-bold text-ink"><Furigana text={eventTitle(selected.event.title)} /></p>
            <div className="mt-2 flex flex-wrap gap-2 text-11 text-ink-muted">
              {selected.d.rerouted ? <span className="rounded-full bg-primary-soft px-2 py-1 text-primary-ink">経路を変更</span> : null}
              {selected.d.timedOut ? <span className="rounded-full bg-canvas px-2 py-1">時間をかけて選択</span> : null}
            </div>
          </div>
          <ReviewIllustrations event={selected.event} choice={selected.choice} />
          {rows.length > 1 ? <div className="flex gap-2">
            <Button size="md" variant="quiet" disabled={selectedIndex === 0} onClick={() => setSelectedId(rows[selectedIndex - 1].d.pointId)}><GameIcon name="back" className="size-4" />前の判断</Button>
            <Button size="md" variant="quiet" disabled={selectedIndex === rows.length - 1} onClick={() => setSelectedId(rows[selectedIndex + 1].d.pointId)}>次の判断<GameIcon name="chevron" className="size-4" /></Button>
          </div> : null}
          <ChoiceTradeoffs key={selected.d.pointId} event={selected.event} choice={selected.choice} />
          <details key={`sources-${selected.d.pointId}`} className="rounded-field border border-border p-3 text-11 leading-relaxed text-ink-muted">
            <summary className="cursor-pointer font-bold text-primary-ink">場面・判断のヒント・出典</summary>
            <p className="mt-3 text-13"><Furigana text={selected.event.situation} /></p>
            <p className="mt-3 rounded-field bg-canvas p-3 text-13"><Furigana text={selected.event.hint} /></p>
            {selected.event.evidence ? <div className="mt-2 space-y-1">
              <p>地理データの分類：{selected.event.evidence.classification}</p>
              <p>AIの補足：{selected.event.evidence.aiReason}</p>
              {selected.event.evidence.uncertainties.map((text, index) => <p key={index}>未確認：{text}</p>)}
              <p>データ取得日：{selected.event.evidence.downloadedAt}（現地調査日とは異なります）</p>
            </div> : null}
            <a href={selected.event.reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-primary-ink underline underline-offset-2">{selected.event.reference.label}</a>
          </details>
        </div> : null}

        {sheet === "route" ? <div className="space-y-4 text-13 text-ink-muted">
          <div><p className="text-11">選んだ避難場所</p><p className="mt-1 font-bold text-ink"><Furigana text={shelter?.name ?? "—"} /></p><p className="mt-1">{shelter?.address}</p></div>
          <div><p className="text-11">はじめの経路</p><p className="mt-1 font-bold text-ink"><Furigana text={startRoute?.label ?? "—"} /> · {startRoute ? formatDistance(startRoute.distanceM) : "—"}</p></div>
          <div><p className="mb-2 text-11">体験中の経路</p><ol className="space-y-2">{(takenRouteIds.length ? takenRouteIds : startRouteId ? [startRouteId] : []).map((id, index) => <li className="flex items-center gap-2" key={`${id}-${index}`}><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-11 font-bold text-primary-ink">{index + 1}</span><Furigana text={routes.find((route) => route.id === id)?.label ?? "途中からの迂回路"} /></li>)}</ol><p className="mt-2 text-11">{changed ? "途中で別の経路に変更しました。" : "最初の経路のまま体験しました。"}</p></div>
          <p>到着までの想定時間：<strong className="text-ink">{formatDuration(totalSeconds(evac))}</strong><span className="mt-1 block text-11">選択肢ごとに設定した仮の所要時間を含みます。実測時間や減点ではありません。</span></p>
          {startRoute?.demo ? <p className="rounded-field bg-primary-soft p-3 text-11 text-primary-ink">練習用に合成した経路です。実際の道路とは異なります。</p> : null}
        </div> : null}

        {sheet === "room" ? <RoomConnectionSummary complete /> : null}

        {sheet === "help" ? <div className="space-y-4 text-13 leading-relaxed text-ink-muted">
          <EvacModeBadge mode={mode} />
          <p>地図と番号から、通った道と選んだ行動をふりかえれます。次の画面で判断のスコアと改善のヒントを確認できます。</p>
          {walk?.source === "geo-ai" && rows.length === 0 ? <p className="rounded-field bg-primary-soft p-3">今回の地形データから出題できる候補は見つかりませんでした。危険がないことや、この経路の安全を確認した意味ではありません。</p> : null}
          <p><Furigana text="これは地図[ちず]の上[うえ]で体験[たいけん]した記録[きろく]です。危険[きけん]はすべて想定[そうてい]で、実在[じつざい]の建物[たてもの]・塀[へい]・道路[どうろ]が壊[こわ]れると判定[はんてい]したものではありません。実際[じっさい]の避難[ひなん]では、自治体[じちたい]や気象庁[きしょうちょう]の情報[じょうほう]に従[したが]ってください。" /></p>
        </div> : null}
      </BottomSheet>
    </GameShell>
  );
}
