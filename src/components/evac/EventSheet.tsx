"use client";

import { useEffect, useState } from "react";
import { HazardSketch } from "./HazardSketch";
import { ChevronRightIcon } from "@/components/icons";
import { Meter } from "@/components/ui/Bits";
import { Furigana } from "@/components/ui/Furigana";
import {
  SCENARIO_BADGE,
  SCENARIO_NOTE,
  STREETVIEW_NOTE,
  type EvacChoice,
  type HazardEvent,
} from "@/lib/evac-content";

/**
 * 判断イベントの下部シート。
 *
 * ストリートビューの上には重ねず、パノラマの下に置く。
 * Google の帰属表示を隠さないため（仕様 7・14）。
 */
export function EventSheet({
  event,
  index,
  total,
  seconds,
  onExtend,
  onDisableTimer,
  onChoose,
}: {
  event: HazardEvent;
  index: number;
  total: number;
  /** 制限時間（秒）。0 なら無効 */
  seconds: number;
  onExtend: () => void;
  onDisableTimer: () => void;
  onChoose: (choice: EvacChoice, timedOut: boolean) => void;
}) {
  // 制限時間を延ばしたときは、親が key を変えてこの木ごと作り直す
  const [remaining, setRemaining] = useState<number | null>(seconds > 0 ? seconds : null);
  const [showSketch, setShowSketch] = useState(false);

  useEffect(() => {
    if (remaining === null) return;
    const id = setTimeout(() => {
      // 時間切れは「迷っているうちに、そのまま進んでしまった」として扱う。
      // 安全な選択を自動で選ばない（それでは判断を体験したことにならない）。
      if (remaining <= 1) onChoose(event.choices[0], true);
      else setRemaining(remaining - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [remaining, event, onChoose]);

  return (
    <div className="flex flex-col gap-3 rounded-t-panel bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgba(26,32,44,0.10)]">
      <div className="flex items-center justify-between">
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
              残り{remaining}秒
            </span>
            <button
              type="button"
              onClick={onExtend}
              className="rounded-chip bg-canvas px-2 py-1 font-display text-11 font-bold text-primary-ink"
            >
              ＋10秒
            </button>
            <button
              type="button"
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

      <ul className="flex flex-col gap-2">
        {event.choices.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onChoose(c, false)}
              className="flex w-full items-center gap-3 rounded-tile border border-border bg-surface p-3 text-left transition-colors active:border-primary-mid active:bg-primary-soft"
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
        <Furigana text={STREETVIEW_NOTE} />
      </p>
    </div>
  );
}
