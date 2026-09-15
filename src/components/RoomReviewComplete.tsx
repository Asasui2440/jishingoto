"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";

/** 全物体の説明を確認してから、クイズへ進むか読み直すかを選ぶ。 */
export function RoomReviewComplete({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby="room-review-complete-title" aria-describedby="room-review-complete-description"
    onCancel={event => { event.preventDefault(); onBack(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-panel bg-surface p-6 text-ink shadow-xl backdrop:bg-black/55">
    <div className="space-y-4 text-center">
      <h2 id="room-review-complete-title" className="font-display text-xl font-bold text-balance"><Furigana text="すべての物体[ぶったい]を確認[かくにん]しました" /></h2>
      <p id="room-review-complete-description" className="text-sm leading-relaxed text-ink-muted"><Furigana text="次[つぎ]は、地震[じしん]が起[お]きたときの行動[こうどう]クイズです。揺[ゆ]れている間[あいだ]と、収[おさ]まった後[あと]の行動[こうどう]を考[かんが]えよう。" /></p>
      <Button size="md" autoFocus onClick={onStart}><Furigana text="行動クイズへ" /></Button>
      <Button size="md" variant="outline" onClick={onBack}><Furigana text="説明[せつめい]に戻[もど]る" /></Button>
    </div>
  </dialog>;
}
