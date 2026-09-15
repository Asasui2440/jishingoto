"use client";

import Link from "next/link";
import { HomeIcon } from "./DetailSheet";
import { usePathname } from "next/navigation";
import { TopLink } from "./TopLink";

export function PhaseOneNavigation() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/home" || pathname.startsWith("/evac")) return null;
  return <><div aria-hidden className="h-[calc(52px+env(safe-area-inset-top))]" /><nav aria-label="共通ナビゲーション" className="phase-one-navigation">
    <TopPageLink />
  </nav></>;
}

export function TopPageLink() {
  return <TopLink />;
}

/** 避難画面のヘッダー内に配置する。 */
export function HeaderHomeLink() {
  return <nav aria-label="共通ナビゲーション" className="shrink-0">
    <Link href="/home" aria-label="トップページへ戻る" title="トップページへ戻る" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"><HomeIcon /></Link>
  </nav>;
}
