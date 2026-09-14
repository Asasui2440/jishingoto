"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { EvacChoice, HazardEvent } from "@/lib/evac-content";
import { Furigana } from "@/components/ui/Furigana";
import { decisionRating } from "./DecisionRating";
import styles from "./ChoiceTradeoffs.module.css";

export function ChoiceTradeoffs({ event, choice }: { event: HazardEvent; choice: EvacChoice }) {
  const [caution, setCaution] = useState(() => decisionRating(event, choice).symbol !== "○");
  const [target, setTarget] = useState(caution);
  const [phase, setPhase] = useState<"idle" | "closing" | "opening">("idle");
  const tabs = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (phase === "idle") return;
    const timer = setTimeout(() => {
      if (phase === "closing") { setCaution(target); setPhase("opening"); }
      else setPhase("idle");
    }, phase === "closing" ? 160 : 200);
    return () => clearTimeout(timer);
  }, [phase, target]);
  const select = (next: boolean) => {
    if (phase !== "idle" || next === caution) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setCaution(next); setTarget(next); return; }
    setTarget(next);
    setPhase("closing");
  };
  const items = caution ? choice.cons : choice.pros;
  return <section aria-label="この行動のポイント" data-transition={phase} className={`${styles.panel} ${caution ? styles.caution : styles.benefit}`}>
    <p className={styles.instruction}>タップして説明を切り替え</p>
    <div ref={tabs} role="tablist" aria-label="利点と気をつけたい点" className={styles.tabs} data-caution={caution} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || phase !== "idle") return;
      event.preventDefault();
      const next = event.key === "Home" ? false : event.key === "End" ? true : !caution;
      select(next);
      tabs.current?.querySelectorAll<HTMLButtonElement>("button")[Number(next)]?.focus();
    }}>
      <span aria-hidden className={styles.indicator} />
      {[false, true].map(value => <button key={String(value)} id={`${id}-${value}`} role="tab" type="button" aria-selected={caution === value} aria-controls={`${id}-body`} tabIndex={caution === value ? 0 : -1} onClick={() => select(value)} className={styles.tab}>{value ? "気をつけたい点" : "利点"}</button>)}
    </div>
    <div id={`${id}-body`} role="tabpanel" aria-labelledby={`${id}-${caution}`} aria-live="polite" className={`${styles.body} ${phase === "closing" ? styles.closing : phase === "opening" ? styles.opening : ""}`}>
      <h3 className={styles.heading}>{caution ? "気をつけたい点" : "この選択の利点"}</h3>
      {items.length ? <ul className={styles.list}>{items.map(text => <li key={text}><Furigana text={text} /></li>)}</ul> : <p>この判断についての補足はありません。</p>}
    </div>
  </section>;
}
