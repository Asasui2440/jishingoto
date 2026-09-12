"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Furigana } from "@/components/ui/Furigana";
import styles from "./GameUI.module.css";

type IconName = "pin" | "route" | "walk" | "flag" | "settings" | "info" | "close" | "back" | "check" | "locate" | "search" | "chevron" | "play" | "pause" | "eye" | "clock";
export function GameIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    route: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9" /></>,
    walk: <><circle cx="14" cy="4" r="2" /><path d="m8 21 3-7-2-4 4-3 3 5 4 1M4 12l4-3m3 5 5 3 1 4" /></>,
    flag: <><path d="M5 22V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" /><circle cx="15" cy="17" r="3" fill="currentColor" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    back: <path d="m14 5-7 7 7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    locate: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 1v4m0 14v4M1 12h4m14 0h4" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function GameShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${styles.shell} ${className}`}>
    {children}
    <footer className={styles.footer}>練習用の想定です。災害時は公的情報に従ってください。</footer>
  </div>;
}

export function GameHeader({ title, subtitle, step, onBack, onHelp, actions }: {
  title: string; subtitle?: string; step: 1 | 2 | 3; onBack?: () => void; onHelp?: () => void; actions?: ReactNode;
}) {
  return <header className="shrink-0 px-4 pt-3 pb-2">
    <div className="flex items-center gap-2">
      {onBack ? <button type="button" onClick={onBack} aria-label="戻る" className="grid size-11 shrink-0 place-items-center rounded-full bg-white"><GameIcon name="back" /></button> : <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary"><GameIcon name="route" /></span>}
      <div className="min-w-0 flex-1"><h1 className="font-display text-lg font-bold leading-snug"><Furigana text={title} /></h1>{subtitle ? <p className="truncate text-11 text-ink-muted" title={subtitle}><Furigana text={subtitle} /></p> : null}</div>
      {actions}
      {onHelp ? <button type="button" onClick={onHelp} aria-label="遊び方・設定" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-white"><GameIcon name="settings" /></button> : null}
    </div>
    <ol aria-label="体験の進み具合" className="mt-2 flex items-center gap-2">
      {(["準備", "体験", "ふりかえり"] as const).map((label, i) => <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={`flex flex-1 items-center gap-1.5 text-[10px] font-bold ${step >= i + 1 ? "text-primary-ink" : "text-ink-soft"}`}><span className={`h-1 flex-1 rounded-full ${step >= i + 1 ? "bg-primary-mid" : "bg-border"}`} /><span>{label}</span></li>)}
    </ol>
  </header>;
}

/** Native modal provides focus trapping, Escape dismissal and focus restoration. */
export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (open) dialog.querySelector('[data-sheet-body]')?.scrollTo({ top: 0 });
    if (!open && dialog.open) dialog.close();
  }, [open, title]);
  return <dialog ref={ref} className={styles.sheet} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientY < r.top || event.clientX < r.left || event.clientX > r.right || event.clientY > r.bottom) onClose(); } }}>
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3"><h2 id={titleId} className="flex-1 text-base font-bold"><Furigana text={title} /></h2><button type="button" onClick={onClose} aria-label="閉じる" className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas"><GameIcon name="close" /></button></div>
    <div data-sheet-body className={styles.sheetBody}>{open ? children : null}</div>
  </dialog>;
}

export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => dismiss.current(), 5000); return () => clearTimeout(timer); }, [message]);
  return <div aria-live="polite" aria-atomic="true" className={styles.toastSlot}>{message ? <div className={styles.toast}><GameIcon name="check" className="size-4 shrink-0" /><p className="flex-1"><Furigana text={message} /></p><button type="button" aria-label="通知を閉じる" onClick={onDismiss} className="grid min-h-11 min-w-11 place-items-center"><GameIcon name="close" className="size-4" /></button></div> : null}</div>;
}
