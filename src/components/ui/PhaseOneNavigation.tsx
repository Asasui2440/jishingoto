"use client";

import Link from "next/link";
import { HomeIcon } from "./DetailSheet";

/** 各画面のヘッダー内に配置し、専用の行を増やさない。 */
export function HeaderHomeLink() {
  return <nav aria-label="共通ナビゲーション" className="shrink-0">
    <Link href="/home" aria-label="トップページへ戻る" title="トップページへ戻る" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"><HomeIcon /></Link>
  </nav>;
}
