import { AlertCircleIcon } from "@/components/icons";
import { DISCLAIMER } from "@/lib/content";

/** 全画面の下端にある注意書き＋ホームインジケータ */
export function DisclaimerFooter() {
  return (
    <div className="shrink-0 bg-surface">
      <div className="flex items-center gap-2 border-y border-warn bg-warn-soft px-4 py-2.5">
        <AlertCircleIcon className="size-4 shrink-0" />
        <p className="text-11 leading-[1.4] font-semibold text-ink-muted">{DISCLAIMER}</p>
      </div>
      <div className="safe-bottom flex justify-center pt-4">
        <span className="h-[5px] w-[134px] rounded-[10px] bg-ink" />
      </div>
    </div>
  );
}

/**
 * 1画面ぶんの枠。
 * 本文と注意書きの並びは全画面で共通。
 */
export function Screen({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex min-h-dvh flex-col", className].join(" ")}>
      {children}
      <DisclaimerFooter />
    </div>
  );
}
