"use client";

import { useCallback, useEffect, useRef } from "react";
import { Furigana } from "@/components/ui/Furigana";
import styles from "./QuizResultTransition.module.css";

const DURATION_MS = 3_000;
const WAVE_HEIGHTS = [8, 15, 29, 14, 40, 23, 34, 17, 26, 12, 6];

/** 全問回答後の場面転換。画像の生成完了を待たずに進める。 */
export function QuizResultTransition({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const completed = useRef(false);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    dialogRef.current?.close();
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      finish();
      return;
    }
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus();
    const timer = window.setTimeout(finish, DURATION_MS);
    const onPreferenceChange = () => { if (reducedMotion.matches) finish(); };
    reducedMotion.addEventListener("change", onPreferenceChange);
    return () => {
      clearTimeout(timer);
      reducedMotion.removeEventListener("change", onPreferenceChange);
      dialog?.close();
    };
  }, [finish]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.scene}
      aria-labelledby="quiz-outro-title"
      aria-describedby="quiz-outro-description"
      onCancel={(event) => { event.preventDefault(); finish(); }}
    >
      <div className={styles.content}>
        <header>
          <p className={styles.brand}>ジシンゴト！</p>
          <p className={styles.eyebrow}><Furigana text="室内[しつない]での体験[たいけん]を終[お]えました" /></p>
        </header>
        <div className={styles.message}>
          <div className={styles.illustration} aria-hidden="true">
            {/* ホームと同じ固定イラスト。結果の画像生成には依存しない。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/illustrations/textbook/room-v3.webp" alt="" />
          </div>
          <div className={styles.wave} aria-hidden="true">
            {WAVE_HEIGHTS.map((height, index) => <span key={index} style={{ height }} />)}
          </div>
          <h2 ref={titleRef} tabIndex={-1} id="quiz-outro-title" className={styles.title}>
            <Furigana text="あのとき、" /><br /><span className={styles.underlined}><Furigana text="どう動[うご]けた？" /></span>
          </h2>
          <p id="quiz-outro-description" className={styles.description}>
            <Furigana text="あなたが選[えら]んだ行動[こうどう]を、" /><br />
            <Furigana text="ひとつずつ確[たし]かめてみよう。" adult="ひとつずつ振り返ります。" />
          </p>
        </div>
        <div className={styles.footer}>
          <p><Furigana text="まもなく振[ふ]り返[かえ]りへ" /></p>
        </div>
      </div>
    </dialog>
  );
}
