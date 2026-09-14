"use client";

import { usePathname } from "next/navigation";
import { TopLink } from "./TopLink";

export function PhaseOneNavigation() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/evac")) return null;
  return <><div aria-hidden className="h-[calc(52px+env(safe-area-inset-top))]" /><nav aria-label="共通ナビゲーション" className="phase-one-navigation">
    <TopLink />
  </nav></>;
}
