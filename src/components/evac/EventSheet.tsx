"use client";

import { eventTitle } from "@/lib/evac-display";
import { useEffect, useState } from "react";
import { WalkIllustration } from "./WalkIllustration";
import styles from "./EventSheet.module.css";
import { BottomSheet, GameIcon } from "./GameUI";
import { Meter } from "@/components/ui/Bits";
import { Furigana } from "@/components/ui/Furigana";
import { SCENARIO_NOTE, MAP_NOTE, type EvacChoice, type HazardEvent } from "@/lib/evac-content";

/** Choices stay beside the map; expanded context pauses the decision timer. */
export function EventSheet({ event, viewingStreet = false, index, total, seconds, busy = false, onExtend, onDisableTimer, onViewStreet, onChoose }: {
  event: HazardEvent;
  viewingStreet?: boolean;
  index: number;
  total: number;
  seconds: number;
  busy?: boolean;
  onViewStreet?: () => void;
  onExtend: (remaining: number) => void;
  onDisableTimer: () => void;
  onChoose: (choice: EvacChoice, timedOut: boolean) => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(seconds > 0 ? seconds : null);
  const [details, setDetails] = useState(false);
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
  const paused = viewingStreet || details || timerSettings;

  useEffect(() => {
    if (remaining === null || remaining <= 0 || busy || paused) return;
    const id = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, busy, paused]);

  const urgent = remaining !== null && remaining > 0 && remaining <= 5 && !paused && !busy;
  const critical = urgent && remaining! <= 3;

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
    <section className={styles.card} aria-label={`判断ポイント ${index + 1} / ${total}`}>
      <header className={styles.header}>
        <p className="text-11 font-bold text-primary-ink">POINT {index + 1} / {total}</p>
        {onViewStreet ? <button type="button" className={styles.streetToggle} onClick={onViewStreet} aria-label="Street Viewで周りを見る">Street Viewを見る</button> : null}
        <button type="button" disabled={busy} onClick={() => setTimerSettings(true)} className={`${styles.timer} ${urgent ? styles.timerUrgent : ""} ${critical ? styles.timerCritical : ""}`} data-urgency={critical ? "critical" : urgent ? "warning" : "normal"} aria-label="制限時間の設定">
          <GameIcon name={paused ? "pause" : "clock"} className="size-4" />
          <span data-testid="decision-timer">{remaining === null ? "制限なし" : `${remaining}秒`}</span>
        </button>
      </header>
      {remaining !== null ? <Meter value={seconds > 0 ? remaining / seconds : 0} color={remaining <= 3 ? "var(--color-danger)" : "var(--color-primary-mid)"} height={3} track="var(--color-border)" /> : null}
      <div className={styles.content}>
        <div className={styles.intro}>
          <p className={styles.title}><Furigana text={eventTitle(event.title)} /></p>
          <WalkIllustration event={event} className={styles.situationImage} />
          <p className={styles.description}><Furigana text={event.situation.split("\n")[0].replace("【想定問題】", "")} /></p>
          <button type="button" className={styles.details} onClick={() => setDetails(true)} aria-label="状況と行動の詳しい説明を見る"><GameIcon name="info" className="size-4" />状況を大きく見る</button>
        </div>
        <p className="mb-2 text-11 font-bold text-ink-muted">この条件なら、まずどうする？</p>
        <ul className={styles.choices}>
          {choices.map((choice, i) => <li key={choice.id}>
            <button type="button" disabled={busy || paused} onClick={() => onChoose(choice, remaining === 0)} className={styles.choice}>
              <span className={styles.number}>{i + 1}</span>
              <span className={styles.choiceImage}><WalkIllustration event={event} choice={choice} className="h-full w-full" /></span>
              <span className="min-w-0 flex-1 text-13 leading-relaxed font-bold"><Furigana text={choice.label} /></span>
            </button>
          </li>)}
        </ul>
      </div>
      <footer className={styles.footer}>
        {remaining === 0 ? <p role="status" className="text-11 text-primary-ink">時間です。あわてず、行動を選んでください。</p> : null}
        {busy ? <p role="status" className="text-11 text-primary-ink">迂回路を確認中…</p> : null}
      </footer>
    </section>
    <BottomSheet open={details} title="この地点で起きたら？" onClose={() => setDetails(false)}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="overflow-hidden rounded-2xl bg-canvas"><WalkIllustration event={event} className="h-[180px] w-full" /></div>
        <p className="font-display text-15 font-bold text-ink"><Furigana text={eventTitle(event.title)} /></p>
        <p className="text-13 leading-relaxed text-ink-muted"><Furigana text={event.situation.replace("【想定問題】", "")} /></p>
        {event.locationReference ? <a className="text-11 text-primary-ink underline" href={event.locationReference.url} target="_blank" rel="noreferrer">{event.locationReference.label}</a> : null}
        <div className="space-y-3">{choices.map((choice, i) => <div key={choice.id} className="flex flex-wrap gap-3"><WalkIllustration event={event} choice={choice} className="w-full h-[150px]" /><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-11 font-bold text-primary-ink">{i + 1}</span><div><p className="text-13 font-bold text-ink"><Furigana text={choice.label} /></p>{!event.id.startsWith("walk-case-") ? <p className="mt-1 text-13 leading-relaxed text-ink-muted"><Furigana text={choice.detail} /></p> : null}</div></div>)}</div>
        <p className="text-11 leading-relaxed text-ink-muted"><Furigana text={SCENARIO_NOTE} /><br /><Furigana text={MAP_NOTE} /></p>
        <button type="button" onClick={() => setDetails(false)} className="min-h-12 rounded-full bg-primary font-bold text-ink">行動を選ぶ</button>
      </div>
    </BottomSheet>
    <BottomSheet open={timerSettings} title="考える時間" onClose={() => setTimerSettings(false)}>
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-13 text-ink-muted">問題が表示されると時間が減ります。Street View・詳しい説明・設定を開いている間はタイマーが止まります。時間切れでも自分で選べます。</p>
        {remaining !== null ? <><button type="button" disabled={busy} onClick={extendTimer} className="min-h-12 rounded-full bg-primary font-bold text-ink">10秒ふやす</button><button type="button" disabled={busy} onClick={disableTimer} className="min-h-12 rounded-full border border-border font-bold text-primary-ink">制限なしにする</button></> : <p className="rounded-2xl bg-primary-soft p-4 text-center text-13 font-bold text-primary-ink">制限時間なし</p>}
      </div>
    </BottomSheet>
  </>;
}
