"use client";

import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  StatusBatteryDarkIcon,
  StatusSignalDarkIcon,
  StatusWifiDarkIcon,
} from "@/components/icons";
import { DISCLAIMER } from "@/lib/content";

/**
 * Figma の status-bar。実機では OS のバーが出るのでダミーだが、
 * デザイン確認のためデスクトップ幅でも同じ見た目になるようにしている。
 */
export function StatusBar({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("ja-JP", {
          hour: "numeric",
          minute: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={[
        "flex h-11 shrink-0 items-center justify-between px-6",
        tone === "light" ? "text-white" : "text-ink",
      ].join(" ")}
    >
      {/* SSR と時刻がずれるので、hydration 後に出す */}
      <span className="text-15 font-semibold tabular-nums">{time ?? " "}</span>
      <span className="flex items-start gap-1.5">
        <StatusSignalDarkIcon className="h-[11px] w-[17px]" />
        <StatusWifiDarkIcon className="h-[11px] w-[15px]" />
        <StatusBatteryDarkIcon className="h-[11px] w-[25px]" />
      </span>
    </div>
  );
}

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
