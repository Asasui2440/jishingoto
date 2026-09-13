"use client";

import { Furigana } from "@/components/ui/Furigana";

import { AlertCircleIcon } from "@/components/icons";
import { DISCLAIMER } from "@/lib/content";

/** 端末のステータス表示はOSに任せ、アプリ内には重ねない。 */
export function StatusBar(_props: { tone?: "dark" | "light" }) {
  return null;
}

/** 全画面の下端にある注意書き＋ホームインジケータ */
export function DisclaimerFooter() {
  return (
    <div className="shrink-0 bg-surface">
      <div className="flex items-center gap-2 border-y border-warn bg-warn-soft px-4 py-2.5">
        <AlertCircleIcon className="size-4 shrink-0" />
        <p className="text-11 leading-[1.4] font-semibold text-ink-muted"><Furigana text={DISCLAIMER} /></p>
      </div>
      <div className="safe-bottom flex justify-center pt-4">
        <span className="h-[5px] w-[134px] rounded-[10px] bg-ink" />
      </div>
    </div>
  );
}

/**
 * 1画面ぶんの枠。
 * status-bar → 中身 → disclaimer の並びは全画面で共通。
 */
export function Screen({
  children,
  tone = "dark",
  className = "",
}: {
  children: React.ReactNode;
  /** 背景が暗い画面では status-bar を白抜きにする */
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <div className={["flex min-h-dvh flex-col", className].join(" ")}>
      <StatusBar tone={tone} />
      {children}
      <DisclaimerFooter />
    </div>
  );
}
