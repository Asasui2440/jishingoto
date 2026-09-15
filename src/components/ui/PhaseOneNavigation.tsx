"use client";

import { usePathname } from "next/navigation";
import { TopLink } from "./TopLink";

export function PhaseOneNavigation() {
  const pathname = usePathname();
  if (pathname.startsWith("/evac")) return null;
  return <><div aria-hidden className="h-[calc(64px+env(safe-area-inset-top))]" /><nav aria-label="共通ナビゲーション" className="phase-one-navigation">
    <TopLink />
  </nav></>;
}

/** 避難画面のヘッダー内に配置する。 */
export function HeaderHomeLink() {
  return <nav aria-label="共通ナビゲーション" className="shrink-0">
    <TopLink />
  </nav>;
}
