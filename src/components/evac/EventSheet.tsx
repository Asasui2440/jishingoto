"use client";

import { useEffect, useState } from "react";
import { HazardSketch } from "./HazardSketch";
import { ChevronRightIcon } from "@/components/icons";
import { Meter } from "@/components/ui/Bits";
import { Furigana } from "@/components/ui/Furigana";
import {
  SCENARIO_BADGE,
  SCENARIO_NOTE,
  MAP_NOTE,
  type EvacChoice,
  type HazardEvent,
} from "@/lib/evac-content";

/**
 * 判断イベントの下部シート。
 *
 * 地図の外に配置する。時間切れでも本人の選択を待ち、結果は最後にまとめる。
 */
export function EventSheet({
  event,
  viewingStreet = false,
  index,
  total,
  seconds,
  busy = false,
  onExtend,
  onDisableTimer,
  onChoose,
}: {
  event: HazardEvent;
  viewingStreet?: boolean;
  index: number;
  total: number;
  /** 制限時間（秒）。0 なら無効 */
  seconds: number;
  busy?: boolean;
  onExtend: () => void;
  onDisableTimer: () => void;
  onChoose: (choice: EvacChoice, timedOut: boolean) => void;
}) {
  // 制限時間を延ばしたときは、親が key を変えてこの木ごと作り直す
  const [remaining, setRemaining] = useState<number | null>(seconds > 0 ? seconds : null);
  const [showSketch, setShowSketch] = useState(false);

  useEffect(() => {
    if (remaining === null || remaining <= 0 || busy || viewingStreet) return;
    const id = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, busy, viewingStreet]);

  return (
    <div className="flex flex-col gap-3 rounded-panel mx-4 border border-border bg-surface px-5 pt-4 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="rounded-chip bg-warn-soft px-2 py-0.5 font-display text-11 font-black text-warn">
            <Furigana text={SCENARIO_BADGE} />
          </span>
          <span className="font-display text-11 font-bold text-ink-soft">
            {index + 1} / {total}
          </span>
        </span>
        {remaining !== null ? (
          <span className="flex items-center gap-2">
            <span
              className={[
                "font-display text-13 font-bold tabular-nums",
                remaining <= 3 ? "text-danger" : "text-ink-muted",
              ].join(" ")}
            >
              {viewingStreet ? `停止中・残り${remaining}秒` : `残り${remaining}秒`}
            </span>
            <button
              type="button"
              disabled={busy || viewingStreet}
              onClick={onExtend}
              className="rounded-chip bg-canvas px-2 py-1 font-display text-11 font-bold text-primary-ink"
            >
              ＋10秒
            </button>
            <button
              type="button"
              disabled={busy || viewingStreet}
              onClick={onDisableTimer}
              className="rounded-chip bg-canvas px-2 py-1 font-display text-11 font-bold text-primary-ink"
            ><Furigana text="なくす" /></button>
          </span>
        ) : (
          <span className="text-11 text-ink-soft">
            <Furigana text="制限時間[せいげんじかん]なし" />
          </span>
        )}
      </div>

      {remaining !== null ? (
        <Meter
          value={seconds > 0 ? remaining / seconds : 0}
          color={remaining <= 3 ? "var(--color-danger)" : "var(--color-primary-mid)"}
          height={4}
          track="var(--color-border)"
        />
      ) : null}

      <div>
        <p className="font-display text-15 font-bold text-ink">
          <Furigana text={event.title} />
        </p>
        <p className="mt-1 text-13 leading-[1.6] text-ink-muted">
          <Furigana text={event.situation} />
        </p>
      </div>

      {viewingStreet ? <p role="status" className="text-11 text-primary-ink"><Furigana text="風景[ふうけい]を確認中[かくにんちゅう]です。タイマーは止[と]まっています。" /></p> : null}

      <button
        type="button"
        onClick={() => setShowSketch((v) => !v)}
        className="self-start font-display text-11 font-bold text-primary-ink underline underline-offset-2"
      >
        <Furigana text={showSketch ? "想定図をとじる" : "想定図（イラスト）を見る"} />
      </button>
      {showSketch ? (
        <div className="overflow-hidden rounded-tile">
          <HazardSketch kind={event.kind} className="h-[130px] w-full" />
          <p className="bg-canvas px-2 py-1.5 text-11 text-ink-soft">
            <Furigana text="この図[ず]は想定[そうてい]を説明[せつめい]するためのイラストです。" />
          </p>
        </div>
      ) : null}

      {remaining === 0 ? <p role="status" className="rounded-field bg-primary-soft p-3 text-13 text-ink"><Furigana text="時間[じかん]になりました。あわてず、行動[こうどう]を選[えら]んでみましょう。" /></p> : null}
      {busy ? <p role="status" className="text-13 text-primary-ink"><Furigana text="ここからの迂回路[うかいろ]を確認中[かくにんちゅう]…" /></p> : null}

      <ul className="flex flex-col gap-2">
        {event.choices.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy || viewingStreet}
              onClick={() => onChoose(c, remaining === 0)}
              className="flex w-full items-center gap-3 rounded-tile border border-border bg-surface p-3 text-left transition-colors active:border-primary-mid active:bg-primary-soft disabled:opacity-50"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary-ink">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-15 font-bold text-ink">
                  <Furigana text={c.label} />
                </span>
                <span className="mt-0.5 block text-11 text-ink-soft">
                  <Furigana text={c.detail} />
                </span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-ink-soft" />
            </button>
          </li>
        ))}
      </ul>

      <p className="text-11 leading-[1.5] text-ink-soft">
        <Furigana text={SCENARIO_NOTE} />
        <br />
        <Furigana text={MAP_NOTE} />
      </p>
    </div>
  );
}
