"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon } from "./DetailSheet";

export function PhaseOneNavigation() {
  const pathname = usePathname();
  if (pathname.startsWith("/evac")) return null;
  return <><div aria-hidden className="h-[calc(52px+env(safe-area-inset-top))]" /><nav aria-label="共通ナビゲーション" className="phase-one-navigation">
    <Link href="/" aria-label="トップページへ戻る" title="トップページへ戻る" className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3 text-primary-ink shadow-sm"><HomeIcon /><span className="text-xs font-bold">トップ</span></Link>
  </nav></>;
}
