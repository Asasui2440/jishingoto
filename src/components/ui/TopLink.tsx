import Link from "next/link";

/** フェーズ共通のホームへのリンク。表示と行き先をそろえる。 */
export function TopLink({ onClick }: { onClick?: () => void }) {
  return <Link href="/home" onClick={onClick} aria-label="トップページへ戻る" title="トップページへ戻る" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"><HomeIcon /></Link>;
}

function HomeIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" /></svg>;
}
