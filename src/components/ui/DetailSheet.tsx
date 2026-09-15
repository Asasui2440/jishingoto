"use client";

import Link from "next/link";
import { Furigana } from "./Furigana";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** 詳細を読む間は背景を固定し、閉じると元のボタンへ戻す。 */
export function DetailSheet({ title, summary, children, onOpenChange }: { title: string; summary?: string; children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const previousOverflow = useRef("");
  const locked = useRef(false);
  useEffect(() => () => {
    if (locked.current) document.body.style.overflow = previousOverflow.current;
  }, []);
  const close = () => dialog.current?.close();
  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => {
      previousOverflow.current = document.body.style.overflow;
      dialog.current?.showModal();
      document.body.style.overflow = "hidden";
      locked.current = true;
      onOpenChange?.(true);
    }} className="detail-trigger flex min-h-12 w-full items-center gap-3 border-b border-border bg-transparent px-1 py-3 text-left">
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-primary-ink"><Furigana text={title} /></span>{summary && <span className="mt-1 block text-xs leading-relaxed text-ink-muted"><Furigana text={summary} /></span>}</span>
      <span aria-hidden className="text-glass">＋</span>
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} className="detail-sheet" onClick={event => { if (event.target === event.currentTarget) close(); }} onClose={() => {
      document.body.style.overflow = previousOverflow.current;
      locked.current = false;
      onOpenChange?.(false);
    }}>
      <div className="detail-sheet-panel">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface p-3">
          <Link href="/" aria-label="トップページへ戻る" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink"><HomeIcon /></Link>
          <h2 id={titleId} className="min-w-0 flex-1 text-base font-bold"><Furigana text={title} /></h2>
          <button type="button" autoFocus onClick={close} className="min-h-11 shrink-0 rounded-field px-3 text-sm font-bold text-primary-ink"><Furigana text="閉じる" /></button>
        </header>
        <div className="detail-sheet-content space-y-4 p-4">{children}</div>
      </div>
    </dialog>
  </>;
}

export function HomeIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" /></svg>;
}
