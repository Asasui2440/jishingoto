import Link from "next/link";
import { HomeIcon } from "./DetailSheet";

/** フェーズ共通のホームへのリンク。表示と行き先をそろえる。 */
export function TopLink() {
  return <Link href="/home" aria-label="トップページへ戻る" title="トップページへ戻る" className="flex min-h-11 items-center gap-2 rounded-full border border-[#bfd6e2] bg-glass-soft px-3 text-glass"><HomeIcon /><span className="text-xs font-bold">トップへ</span></Link>;
}
