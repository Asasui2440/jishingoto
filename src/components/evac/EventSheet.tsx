"use client";

import { useEffect, useState } from "react";
import { HazardSketch } from "./HazardSketch";
import { BottomSheet, GameIcon } from "./GameUI";
import { Meter } from "@/components/ui/Bits";
import { Furigana } from "@/components/ui/Furigana";
import { SCENARIO_NOTE, MAP_NOTE, type EvacChoice, type HazardEvent } from "@/lib/evac-content";

/** Choices stay beside the map; expanded context pauses the decision timer. */
export function EventSheet({ event, viewingStreet = false, index, total, seconds, busy = false, onExtend, onDisableTimer, onChoose }: {
  event: HazardEvent;
  viewingStreet?: boolean;
  index: number;
  total: number;
  seconds: number;
  busy?: boolean;
  onExtend: (remaining: number) => void;
  onDisableTimer: () => void;
  onChoose: (choice: EvacChoice, timedOut: boolean) => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(seconds > 0 ? seconds : null);
  const [details, setDetails] = useState(false);
  const [timerSettings, setTimerSettings] = useState(false);
  const paused = viewingStreet || details || timerSettings;

  useEffect(() => {
    if (remaining === null || remaining <= 0 || busy || paused) return;
    const id = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, busy, paused]);

  // Keep the trigger mounted so closing the dialog restores keyboard focus.
  const extendTimer = () => {
    if (remaining === null || busy) return;
    setTimerSettings(false);
    setRemaining(remaining + 10);
    onExtend(remaining);
  };
  const disableTimer = () => {
    if (busy) return;
    setTimerSettings(false);
    setRemaining(null);
    onDisableTimer();
  };

  return <>
    <section className="flex min-h-0 max-h-[56dvh] shrink flex-col gap-2 overflow-hidden rounded-t-[24px] border-t border-border bg-surface px-4 pt-3 pb-3 shadow-[0_-4px_18px_rgba(91,66,11,0.04)]" aria-label={`判断ポイント ${index + 1} / ${total}`}>
      <div className="flex min-h-0 shrink flex-col gap-2 overflow-y-auto overscroll-contain">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-wide text-primary-ink">POINT {index + 1} / {total} ・ 想定</p>
        <button type="button" disabled={busy} onClick={() => setTimerSettings(true)} className={`inline-flex min-h-8 items-center gap-1 rounded-full bg-canvas px-2.5 text-11 font-bold tabular-nums ${remaining !== null && remaining <= 3 ? "text-danger" : "text-ink-muted"}`} aria-label="制限時間の設定">
          <GameIcon name={paused ? "pause" : "clock"} className="size-3.5" />{remaining === null ? "制限なし" : `${remaining}秒`}
        </button>
      </div>
      {remaining !== null ? <Meter value={seconds > 0 ? remaining / seconds : 0} color={remaining <= 3 ? "var(--color-danger)" : "var(--color-primary-mid)"} height={3} track="var(--color-border)" /> : null}
      <button type="button" onClick={() => setDetails(true)} className="flex min-h-14 items-center gap-3 rounded-xl text-left" aria-label="状況と行動の詳しい説明を見る">
        <span className="relative w-[68px] shrink-0 overflow-hidden rounded-xl"><HazardSketch kind={event.kind} className="h-[52px] w-full" /><span className="absolute bottom-0 inset-x-0 bg-surface/90 text-center text-[8px] text-ink-muted">想定図</span></span>
        <span className="min-w-0 flex-1 font-display text-13 leading-relaxed font-bold text-ink"><Furigana text={event.title} /></span>
        <GameIcon name="info" className="size-4 shrink-0 text-primary-ink" />
      </button>
      {remaining === 0 ? <p role="status" className="text-11 text-primary-ink">時間です。あわてず、行動を選んでください。</p> : null}
      {busy ? <p role="status" className="text-11 text-primary-ink">迂回路を確認中…</p> : null}
      </div>
      <ul className="flex shrink-0 flex-col gap-1.5">
        {event.choices.map((choice, i) => <li key={choice.id}>
          <button type="button" disabled={busy || paused} onClick={() => onChoose(choice, remaining === 0)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-canvas/40 px-3 py-2 text-left transition-colors active:border-primary-mid active:bg-primary-soft disabled:opacity-50">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-11 font-bold text-primary-ink">{i + 1}</span>
            <span className="min-w-0 flex-1 font-display text-13 leading-relaxed font-bold text-ink"><Furigana text={choice.label} /></span>
            <GameIcon name="chevron" className="size-4 shrink-0 text-ink-muted" />
          </button>
        </li>)}
      </ul>
    </section>
    <BottomSheet open={details} title="この地点で起きたら？" onClose={() => setDetails(false)}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="overflow-hidden rounded-2xl bg-canvas"><HazardSketch kind={event.kind} className="h-[150px] w-full" /><p className="px-3 py-2 text-11 text-ink-muted">想定を説明するイラストです。現地の被害ではありません。</p></div>
        <p className="font-display text-15 font-bold text-ink"><Furigana text={event.title} /></p>
        <p className="text-13 leading-relaxed text-ink-muted"><Furigana text={event.situation} /></p>
        <div className="space-y-3">{event.choices.map((choice, i) => <div key={choice.id} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-11 font-bold text-primary-ink">{i + 1}</span><div><p className="text-13 font-bold text-ink"><Furigana text={choice.label} /></p><p className="mt-1 text-13 leading-relaxed text-ink-muted"><Furigana text={choice.detail} /></p></div></div>)}</div>
        <p className="text-11 leading-relaxed text-ink-muted"><Furigana text={SCENARIO_NOTE} /><br /><Furigana text={MAP_NOTE} /></p>
        <button type="button" onClick={() => setDetails(false)} className="min-h-12 rounded-full bg-primary font-bold text-ink">行動を選ぶ</button>
      </div>
    </BottomSheet>
    <BottomSheet open={timerSettings} title="考える時間" onClose={() => setTimerSettings(false)}>
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-13 text-ink-muted">設定や風景の確認中はタイマーが止まります。時間切れでも自分で選べます。</p>
        {remaining !== null ? <><button type="button" disabled={busy} onClick={extendTimer} className="min-h-12 rounded-full bg-primary font-bold text-ink">10秒ふやす</button><button type="button" disabled={busy} onClick={disableTimer} className="min-h-12 rounded-full border border-border font-bold text-primary-ink">制限なしにする</button></> : <p className="rounded-2xl bg-primary-soft p-4 text-center text-13 font-bold text-primary-ink">制限時間なし</p>}
      </div>
    </BottomSheet>
  </>;
}
