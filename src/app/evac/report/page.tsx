"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EVAC_SCENARIOS } from "@/lib/evac-scenario";
import { BottomSheet, GameHeader, GameIcon, GameShell } from "@/components/evac/GameUI";
import { eventTitle } from "@/lib/evac-display";
import { DecisionRating } from "@/components/evac/DecisionRating";
import { ChoiceTradeoffs } from "@/components/evac/ChoiceTradeoffs";
import { ReviewIllustrations } from "@/components/evac/ReviewIllustrations";
import { RoomConnectionSummary } from "@/components/evac/RoomConnectionSummary";
import { EvacModeBadge } from "@/components/evac/EvacMode";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { reviewDecisions, scoreDecisions } from "@/lib/evac-review";
import { formatDistance, formatDuration, getEvac, totalSeconds, useEvac } from "@/lib/evac";
import { walkDistance } from "@/lib/evac-walk";
import { useSession } from "@/lib/session";

type Sheet = "decision" | "route" | "help" | "room" | null;

function AddedTimeInfo({ label }: { label: string }) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  useEffect(() => {
    if (!open) return;
    const close = () => { setHovered(false); setFocused(false); setPinned(false); };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <span ref={root} aria-label="選んだ行動による追加時間" className="relative mx-1 mt-1.5 block"
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)}>
    <button type="button" aria-label="追加時間の説明" aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => { setFocused(false); setHovered(false); setPinned(!pinned); }}
      onFocus={event => setFocused(event.currentTarget.matches(":focus-visible"))}
      onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) { setFocused(false); setPinned(false); } }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-field bg-primary-soft px-1 text-13 font-bold text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink">
      <Furigana text={label} /><GameIcon name="info" className="size-4 shrink-0" />
    </button>
    {open && <span id={id} role="tooltip" className="absolute right-0 top-full z-30 w-[min(260px,calc(100vw-48px))] rounded-field border border-border bg-surface p-3 text-left text-13 font-medium leading-relaxed text-ink shadow-lg">
      <Furigana text="選んだ行動によって追加された想定時間です。上の想定時間の合計に含まれています。実際にかかった時間や減点ではありません。" />
    </span>}
  </span>;
}

/** 記録は地図で一覧し、選択の理由と次の行動はその場で開いて確かめる。 */
export default function EvacReportPage() {
  const router = useRouter();
  const evac = useEvac();
  const room = useSession();
  const { mode, home, shelter, routes, startRouteId, takenRouteIds, decisions, walk, followUp, update } = evac;
  const [followOpen, setFollowOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!getEvac().finishedAt) router.replace("/evac");
  }, [router]);

  const startRoute = routes.find((route) => route.id === startRouteId) ?? null;
  const rows = useMemo(() => reviewDecisions({decisions,walk}), [decisions,walk]);
  const result = useMemo(() => scoreDecisions({decisions,walk}), [decisions,walk]);
  const followUps = result.followUps.length ? result.followUps : ["自治体の防災マップで、この経路と避難先の指定を平常時に確認する"];
  const selectedIndex = rows.findIndex(({ d }) => d.pointId === selectedId);
  const selected = rows[selectedIndex];
  const scoredSelection = [...result.good, ...result.improvements].find(row => row.d.pointId === selectedId);
  const connectedRoom = !!room.finishedAt && evac.roomFinishedAt === room.finishedAt;
  const changed = takenRouteIds.length > 1;
  const addedSeconds = decisions.reduce((sum, decision) => sum + decision.extraSeconds, 0);
  const addedMinutes = Math.floor(addedSeconds / 60);
  const addedRemainder = addedSeconds % 60;
  const addedTime = `${addedMinutes ? `${addedMinutes}分` : ""}${addedRemainder ? `${addedRemainder}秒` : ""}`;
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

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3">
        <section aria-label="判断スコア" className="shrink-0 rounded-panel border-2 border-primary bg-surface p-3 text-center">
          <h2 className="text-13 font-bold">判断スコア</h2>
          <div className="mt-2 flex items-center gap-3">
          <div className="relative grid size-24 shrink-0 place-items-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border)" strokeWidth="9" />
              <circle data-testid="score-ring" cx="60" cy="60" r="50" fill="none" stroke="var(--color-safe)" strokeWidth="9" pathLength="100" strokeDasharray={`${result.score ?? 0} 100`} strokeLinecap={result.score ? "round" : "butt"} />
            </svg>
            <p className="font-display text-3xl font-bold">{result.score ?? "—"}<span className="block text-11 font-medium">/ 100</span></p>
          </div>
          <p className="text-13">{result.count ? `${result.count}問中${result.good.length}問で、最も優先したい行動を選べました。` : "採点できる判断の記録がありません。"}</p>
          </div>
          <details className="mt-3 text-left text-11 text-ink-muted"><summary className="cursor-pointer">スコアの見方</summary><p className="mt-2">今回の問題での判断を振り返るスコアです。実際の避難の安全性や災害時の対応力を保証するものではありません。</p><p className="mt-2">各問題の行動の優先度をもとに、最も優先したい選択を満点として平均しています。回答にかかった時間やルートの短さでは減点しません。採点対象は回答記録{result.total}件のうち{result.count}件です。</p></details>
        </section>
        <dl className="grid shrink-0 grid-cols-3 divide-x divide-border rounded-tile bg-canvas py-2.5 text-center">
          <div><dt className="text-11 text-ink-muted"><Furigana text="考[かんが]えた場面[ばめん]" /></dt><dd className="mt-0.5 font-display text-xl font-bold">{rows.length}<span className="ml-1 text-11 font-medium">地点</span></dd></div>
          <div><dt className="text-11 text-ink-muted"><Furigana text="歩[ある]いた距離[きょり]" /></dt><dd className="mt-1 font-display text-15 font-bold">{formatDistance(walk ? walkDistance(walk) : startRoute?.distanceM ?? 0)}</dd></div>
          <div><dt className="text-11 text-ink-muted"><Furigana text="想定時間[そうていじかん]" /></dt><dd className="mt-1 font-display text-15 font-bold">
            {formatDuration(totalSeconds(evac))}
            <AddedTimeInfo label={addedSeconds > 0 ? `＋${addedTime}` : "追加なし"} />
          </dd></div>
        </dl>
        {mode === "api" && !startRoute?.demo && (walk || startRoute) ? <p className="shrink-0 text-xs text-ink-muted">距離・経路情報：<span translate="no" className="whitespace-nowrap font-normal not-italic tracking-normal text-[#5e5e5e]">Google Maps</span></p> : null}

        <section className="shrink-0 rounded-panel border border-border bg-surface p-3" aria-label="それぞれの判断">
          <button type="button" onClick={() => setSheet("route")} aria-label="避難先と通った経路の詳細" className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-field bg-canvas px-3 py-2 text-left text-13 font-bold">
            <GameIcon name="flag" className="size-5 shrink-0" />
            <span className="min-w-0 flex-1"><span className="block text-11 font-medium text-ink-muted">選んだ避難先</span><Furigana text={shelter?.name ?? "経路の記録"} /></span>
            <GameIcon name="info" className="size-4 shrink-0" />
          </button>
          <h2 className="text-13 font-bold"><Furigana text="判断[はんだん]の記録[きろく]" /></h2>
          {rows.length ? <>
            <p className="mt-1 text-11 text-ink-muted"><Furigana text="番号のボタンを押すと、その場面と選んだ行動を見返せます。" /></p>
            <ol className="mt-3 space-y-2">
              {rows.map(({ d, choice, event }, index) => (
                <li key={d.pointId}>
                  <button type="button" onClick={() => selectDecision(d.pointId)} aria-label={`判断${index + 1}：${choice.label.replace(/\[[^\]]*\]/g, "")}の記録を見る`} className={`flex min-h-16 w-full items-center gap-3 rounded-field border px-3 py-2 text-left ${selectedId === d.pointId ? "border-primary-mid bg-primary-soft" : "border-border bg-surface"}`}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-15 font-bold text-primary-ink">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-11 text-ink-muted"><Furigana text={eventTitle(event.title)} /></span><span className="mt-1 block text-13 font-bold"><Furigana text={choice.label} /></span></span>
                    <DecisionRating event={event} choice={choice} compact />
                    <GameIcon name="chevron" className="size-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ol>
          </> : <p className="mt-3 rounded-field bg-primary-soft p-3 text-13 text-primary-ink">今回は出題なし。経路の安全を示すものではありません。</p>}
        </section>

        <div className="shrink-0 space-y-2 rounded-tile border border-primary-mid bg-primary-soft p-3">
          {home && shelter && evac.finishedAt ? (
            // A document navigation keeps the save page independent of the Maps SDK used during the experience.
            <a href="/evac/save" aria-describedby="offline-save-description" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-13 font-bold text-ink">
              <GameIcon name="map" className="size-5" />オフライン用の避難地図を作成
            </a>
          ) : <p className="text-13 text-ink-muted">体験後に避難地図を作成できます。</p>}
          <p id="offline-save-description" className="text-11 leading-relaxed text-primary-ink">同じ出発地点・避難先で、保存用の地図と経路を別のページで作成します。</p>
        </div>

      </main>
      <div className="shrink-0 border-t border-border bg-surface px-4 py-2"><Button onClick={() => setFollowOpen(true)}>振り返りを終わる</Button></div>
      <BottomSheet open={followOpen} title="次に確かめること" onClose={() => setFollowOpen(false)} footer={<Button onClick={() => router.push("/evac/complete")}>次へ</Button>}>
        <section className="space-y-2" aria-labelledby="followup-heading">
          <h2 id="followup-heading" className="font-bold">次の備えをひとつ選ぼう</h2>
          <p className="text-13 text-ink-muted">平常時に確かめたいことを、ひとつ選ぼう。</p>
          {followUps.map(value => <button type="button" key={value} aria-pressed={followUp === value} onClick={() => update({followUp:value})} className={`flex min-h-14 w-full items-center gap-3 rounded-tile border p-3 text-left text-13 ${followUp === value ? "border-amber-300 bg-amber-50" : "border-border bg-surface"}`}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-border">{followUp === value ? <GameIcon name="check" className="size-4" /> : null}</span><Furigana text={value} /></button>)}
          {followUp ? <p role="status" className="text-11 text-amber-900">次に確かめることを保存しました。</p> : null}
        </section>
      </BottomSheet>

      <BottomSheet open={sheet !== null} title={sheetTitle} onClose={() => setSheet(null)} footer={sheet === "decision" && selected ? <nav aria-label="判断の切り替え" className="flex gap-2">
        <Button size="md" variant="quiet" disabled={selectedIndex === 0} onClick={() => setSelectedId(rows[selectedIndex - 1].d.pointId)}>前の判断</Button>
        <Button size="md" onClick={() => selectedIndex < rows.length - 1 ? setSelectedId(rows[selectedIndex + 1].d.pointId) : setSheet(null)}>{selectedIndex < rows.length - 1 ? "次の判断" : "判断を閉じる"}</Button>
      </nav> : undefined}>
        {sheet === "decision" && selected ? <section aria-label="判断の詳細" className="space-y-4">
          <div>
            <p className="text-15 font-bold text-ink"><Furigana text={eventTitle(selected.event.title)} /></p>
            <div className="mt-2 flex flex-wrap gap-2 text-11 text-ink-muted">
              {selected.d.rerouted ? <span className="rounded-full bg-primary-soft px-2 py-1 text-primary-ink">経路を変更</span> : null}
              {selected.d.timedOut ? <span className="rounded-full bg-canvas px-2 py-1">時間をかけて選択</span> : null}
            </div>
          </div>
          <ReviewIllustrations event={selected.event} choice={selected.choice} recommended={scoredSelection && scoredSelection.value < 1 ? scoredSelection.recommended : undefined} />
          <ChoiceTradeoffs key={selected.d.pointId} event={selected.event} choice={selected.choice} />
          <details key={`sources-${selected.d.pointId}`} className="rounded-field border border-border p-3 text-11 leading-relaxed text-ink-muted">
            <summary className="cursor-pointer font-bold text-primary-ink">判断のヒント・出典</summary>
            <p className="mt-3 rounded-field bg-canvas p-3 text-13"><Furigana text={selected.event.hint} /></p>
            {selected.event.evidence ? <div className="mt-2 space-y-1">
              <p>地理データの分類：{selected.event.evidence.classification}</p>
              <p>AIの補足：{selected.event.evidence.aiReason}</p>
              {selected.event.evidence.uncertainties.map((text, index) => <p key={index}>未確認：{text}</p>)}
              <p>データ取得日：{selected.event.evidence.downloadedAt}（現地調査日とは異なります）</p>
            </div> : null}
            <a href={selected.event.reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-primary-ink underline underline-offset-2">{selected.event.reference.label}</a>
          </details>
        </section> : null}

        {sheet === "route" ? <div className="space-y-4 text-13 text-ink-muted">
          {mode === "api" && !startRoute?.demo && startRoute ? <p className="text-xs">距離・経路情報：<span translate="no" className="whitespace-nowrap font-normal not-italic tracking-normal text-[#5e5e5e]">Google Maps</span></p> : null}
          <div><p className="text-11">選んだ避難場所</p><p className="mt-1 font-bold text-ink"><Furigana text={shelter?.name ?? "—"} /></p><p className="mt-1">{shelter?.address}</p></div>
          <div><p className="text-11">はじめの経路</p><p className="mt-1 font-bold text-ink"><Furigana text={startRoute?.label ?? "—"} /> · {startRoute ? formatDistance(startRoute.distanceM) : "—"}</p></div>
          <div><p className="mb-2 text-11">体験中の経路</p><ol className="space-y-2">{(takenRouteIds.length ? takenRouteIds : startRouteId ? [startRouteId] : []).map((id, index) => <li className="flex items-center gap-2" key={`${id}-${index}`}><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-11 font-bold text-primary-ink">{index + 1}</span><Furigana text={routes.find((route) => route.id === id)?.label ?? "途中からの迂回路"} /></li>)}</ol><p className="mt-2 text-11">{changed ? "途中で別の経路に変更しました。" : "最初の経路のまま体験しました。"}</p></div>
          <p>到着までの想定時間：<strong className="text-ink">{formatDuration(totalSeconds(evac))}</strong><span className="mt-2 block font-bold text-primary-ink"><Furigana text={addedSeconds > 0 ? `選んだ行動で＋${addedTime}（合計に含む）` : "選んだ行動による追加時間なし"} /></span><span className="mt-1 block text-11">選択肢ごとに設定した仮の所要時間を含みます。実測時間や減点ではありません。</span></p>
          {startRoute?.demo ? <p className="rounded-field bg-primary-soft p-3 text-11 text-primary-ink">練習用に合成した経路です。実際の道路とは異なります。</p> : null}
        </div> : null}

        {sheet === "room" ? <RoomConnectionSummary complete /> : null}

        {sheet === "help" ? <div className="space-y-4 text-13 leading-relaxed text-ink-muted">
          <EvacModeBadge mode={mode} />
          <p>上部で判断のスコアを確認できます。番号から場面・選んだ行動・改善のヒントをふりかえり、「振り返りを終わる」で次の備えを選べます。</p>
          {walk?.source === "geo-ai" && rows.length === 0 ? <p className="rounded-field bg-primary-soft p-3">今回の地形データから出題できる候補は見つかりませんでした。危険がないことや、この経路の安全を確認した意味ではありません。</p> : null}
          <p><Furigana text="これは地図[ちず]の上[うえ]で体験[たいけん]した記録[きろく]です。危険[きけん]はすべて想定[そうてい]で、実在[じつざい]の建物[たてもの]・塀[へい]・道路[どうろ]が壊[こわ]れると判定[はんてい]したものではありません。実際[じっさい]の避難[ひなん]では、自治体[じちたい]や気象庁[きしょうちょう]の情報[じょうほう]に従[したが]ってください。" /></p>
        </div> : null}
      </BottomSheet>
    </GameShell>
  );
}
