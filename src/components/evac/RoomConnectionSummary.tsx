"use client";

import Link from "next/link";
import { Furigana } from "@/components/ui/Furigana";
import { useEvac } from "@/lib/evac";
import { useSession } from "@/lib/session";

/** 同じ部屋の体験から進んだ場合だけ、屋内と屋外の振り返りをつなぐ。 */
export function RoomConnectionSummary({
  complete = false,
}: {
  complete?: boolean;
}) {
  const room = useSession();
  const evac = useEvac();
  if (!room.finishedAt || evac.roomFinishedAt !== room.finishedAt) return null;
  const finished = complete || !!evac.finishedAt;

  return (
    <section
      aria-label="部屋から避難までの体験"
      className="rounded-panel border border-primary/40 bg-primary-soft p-4"
    >
      <p className="text-11 font-bold text-primary-ink">
        {finished
          ? "部屋から避難まで、体験をふりかえる"
          : "フェーズ1の続き · 次は家の外へ"}
      </p>
      <h2 className="mt-1 font-display text-lg font-bold text-ink">
        <Furigana
          text={
            finished
              ? "家[いえ]の中[なか]と外[そと]で考[かんが]えたこと"
              : "部屋[へや]での気[き]づきを、次[つぎ]の行動[こうどう]へ"
          }
        />
      </h2>
      <ol className="mt-3 grid grid-cols-2 gap-2 text-13">
        <li className="rounded-field bg-surface p-3">
          <span className="block text-11 font-bold text-primary-ink">
            フェーズ1 · 完了
          </span>
          <span className="mt-1 block font-bold text-ink">部屋の中</span>
          <span className="mt-1 block text-ink-muted">
            {room.answers.length}つの場面を体験
          </span>
        </li>
        <li className="rounded-field border border-primary-mid bg-surface p-3">
          <span className="block text-11 font-bold text-primary-ink">
            フェーズ2 · {finished ? "完了" : evac.walk ? "体験中" : "これから"}
          </span>
          <span className="mt-1 block font-bold text-ink">家の外の避難</span>
          <span className="mt-1 block text-ink-muted">
            {finished
              ? `${evac.decisions.length}つの場面を体験`
              : "道と周囲を確認"}
          </span>
        </li>
      </ol>
      <p className="mt-3 text-13 leading-relaxed text-ink-muted">
        <Furigana
          text={
            finished
              ? "部屋[へや]で選[えら]んだ行動[こうどう]と、避難[ひなん]する道[みち]。平常時[へいじょうじ]に確[たし]かめたいことを見返[みかえ]しましょう。"
              : "揺[ゆ]れがおさまり、家[いえ]から避難[ひなん]する場面[ばめん]を体験[たいけん]します。まずは家[いえ]の近[ちか]くと避難先[ひなんさき]を選[えら]びましょう。"
          }
        />
      </p>
      <Link
        href="/result"
        className="mt-2 inline-flex min-h-11 items-center text-13 font-bold text-primary-ink underline underline-offset-4"
      >
        <Furigana text="部屋[へや]の結果[けっか]を見返[みかえ]す" />
      </Link>
    </section>
  );
}
