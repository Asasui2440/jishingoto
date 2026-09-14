"use client";

import { useEffect, useState } from "react";
import { WalkIllustration } from "./WalkIllustration";
import styles from "./EventSheet.module.css";
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
  const [reading, setReading] = useState(seconds > 0);
  const [timerSettings, setTimerSettings] = useState(false);
  const [choices] = useState(() => {
    const shuffled = [...event.choices];
    if (!event.id.startsWith("walk-case-")) return shuffled;
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  });
  const paused = viewingStreet || details || timerSettings || reading;

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
    setReading(false);
    onDisableTimer();
  };

  return <>
    <section className={styles.card} aria-label={`判断ポイント ${index + 1} / ${total}`}>
      <header className={styles.header}>
        <p className="text-11 font-bold text-primary-ink">POINT {index + 1} / {total} ・ 想定</p>
        <button type="button" disabled={busy} onClick={() => setTimerSettings(true)} className={styles.timer} aria-label="制限時間の設定">
          <GameIcon name={paused ? "pause" : "clock"} className="size-4" />
          <span data-testid="decision-timer">{remaining === null ? "制限なし" : `${remaining}秒`}</span>
        </button>
      </header>
      {remaining !== null ? <Meter value={seconds > 0 ? remaining / seconds : 0} color={remaining <= 3 && !reading ? "var(--color-danger)" : "var(--color-primary-mid)"} height={3} track="var(--color-border)" /> : null}
      <div className={styles.content}>
        <div className={styles.intro}>
          <p className="text-15 font-bold"><Furigana text={event.title} /></p>
          <WalkIllustration event={event} className={styles.situationImage} />
          <p className="text-11 leading-relaxed text-ink-muted"><Furigana text={event.situation.split("\n")[0].replace("【想定問題】", "")} /></p>
          <button type="button" className={styles.details} onClick={() => setDetails(true)} aria-label="状況と行動の詳しい説明を見る"><GameIcon name="info" className="size-4" />状況を大きく見る</button>
        </div>
        <p className="mb-2 text-11 font-bold text-ink-muted">この条件なら、まずどうする？</p>
        <ul className={styles.choices}>
          {choices.map((choice, i) => <li key={choice.id}>
            <button type="button" disabled={busy || paused} onClick={() => onChoose(choice, remaining === 0)} className={styles.choice}>
              <span className={styles.choiceImage}><WalkIllustration event={event} choice={choice} className="h-full w-full" /><span className={styles.number}>{i + 1}</span></span>
              <span className="min-w-0 flex-1 text-13 leading-relaxed font-bold"><Furigana text={choice.label} /></span>
            </button>
          </li>)}
        </ul>
        <p className="mt-3 text-11 text-ink-muted">絵は練習用の想定です。現地の被害を示すものではありません。</p>
      </div>
      <footer className={styles.footer}>
        {reading ? <>
          <p role="status" className="text-11 text-primary-ink">絵と3つの行動を確認しよう。時間はまだ減りません。</p>
          <button type="button" className={styles.start} disabled={busy || viewingStreet || details || timerSettings} onClick={() => setReading(false)}>判断を始める</button>
          <button type="button" className={styles.details} disabled={busy} onClick={disableTimer}>時間制限なしで選ぶ</button>
        </> : <>
          {remaining === 0 ? <p role="status" className="text-11 text-primary-ink">時間です。あわてず、行動を選んでください。</p> : null}
          {remaining !== null && remaining > 0 ? <button type="button" className={styles.details} disabled={busy} onClick={() => setReading(true)}>時計を止めて、もう一度確認する</button> : null}
          {busy ? <p role="status" className="text-11 text-primary-ink">迂回路を確認中…</p> : null}
        </>}
      </footer>
    </section>
    <BottomSheet open={details} title="この地点で起きたら？" onClose={() => setDetails(false)}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="overflow-hidden rounded-2xl bg-canvas"><WalkIllustration event={event} className="h-[180px] w-full" /><p className="px-3 py-2 text-11 text-ink-muted">想定を説明するイラストです。現地の被害ではありません。</p></div>
        <p className="font-display text-15 font-bold text-ink"><Furigana text={event.title} /></p>
        <p className="text-13 leading-relaxed text-ink-muted"><Furigana text={event.situation} /></p>
        {event.locationReference ? <a className="text-11 text-primary-ink underline" href={event.locationReference.url} target="_blank" rel="noreferrer">{event.locationReference.label}</a> : null}
        <div className="space-y-3">{choices.map((choice, i) => <div key={choice.id} className="flex flex-wrap gap-3"><WalkIllustration event={event} choice={choice} className="w-full h-[150px]" /><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-11 font-bold text-primary-ink">{i + 1}</span><div><p className="text-13 font-bold text-ink"><Furigana text={choice.label} /></p>{!event.id.startsWith("walk-case-") ? <p className="mt-1 text-13 leading-relaxed text-ink-muted"><Furigana text={choice.detail} /></p> : null}</div></div>)}</div>
        <p className="text-11 leading-relaxed text-ink-muted"><Furigana text={SCENARIO_NOTE} /><br /><Furigana text={MAP_NOTE} /></p>
        <button type="button" onClick={() => setDetails(false)} className="min-h-12 rounded-full bg-primary font-bold text-ink">行動を選ぶ</button>
      </div>
    </BottomSheet>
    <BottomSheet open={timerSettings} title="考える時間" onClose={() => setTimerSettings(false)}>
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-13 text-ink-muted">最初に絵と行動を確認し、「判断を始める」を押すと時間が減ります。確認中や設定中はタイマーが止まります。時間切れでも自分で選べます。</p>
        {remaining !== null ? <><button type="button" disabled={busy} onClick={extendTimer} className="min-h-12 rounded-full bg-primary font-bold text-ink">10秒ふやす</button><button type="button" disabled={busy} onClick={disableTimer} className="min-h-12 rounded-full border border-border font-bold text-primary-ink">制限なしにする</button></> : <p className="rounded-2xl bg-primary-soft p-4 text-center text-13 font-bold text-primary-ink">制限時間なし</p>}
      </div>
    </BottomSheet>
  </>;
}
