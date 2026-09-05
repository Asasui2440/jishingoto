"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { EvacMap } from "@/components/evac/EvacMap";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { findChoice, findEvent } from "@/lib/evac-content";
import {
  avoidanceCount,
  formatDistance,
  formatDuration,
  getEvac,
  totalSeconds,
  useEvac,
} from "@/lib/evac";

/**
 * フェーズ2 ④：結果レポート。
 *
 * 点数を主役にしない（仕様 8）。
 * 「避けられた危険」と「次回の判断基準」、そして
 * 平常時にひとつ確認することを持ち帰ってもらうのが目的。
 */
export default function EvacReportPage() {
  const router = useRouter();
  const evac = useEvac();
  const { home, shelter, routes, startRouteId, takenRouteIds, decisions, followUp, update, reset } =
    evac;

  useEffect(() => {
    if (!getEvac().finishedAt) router.replace("/evac");
  }, [router]);

  const startRoute = routes.find((r) => r.id === startRouteId) ?? null;
  const changed = takenRouteIds.length > 1;

  const rows = useMemo(
    () =>
      decisions.flatMap((d) => {
        const event = findEvent(d.eventId);
        const choice = findChoice(d.eventId, d.choiceId);
        return event && choice ? [{ d, event, choice }] : [];
      }),
    [decisions],
  );

  // 「良かった判断」＝安全上の優先順位が高かったもの。
  // 低かったものは名指しせず、「次に試したいこと」として言い換える（仕様 8）。
  const good = rows.filter((r) => r.choice.priority === 3);
  const improve = rows.filter((r) => r.choice.priority === 1);

  const followUps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.event.followUp))),
    [rows],
  );

  const arrival = totalSeconds(evac);

  return (
    <Screen>
      <main className="animate-rise flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
        <header>
          <div className="flex items-center gap-2">
            <span className="rounded-field bg-primary-soft px-2 py-0.5 font-display text-11 font-black text-primary-ink">
              フェーズ2
            </span>
            <h1 className="font-display text-lg font-bold text-ink">
              <Furigana text="ひなん経路[けいろ]のふりかえり" />
            </h1>
          </div>
        </header>

        <Card className="p-[18px]">
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text="通[とお]った経路[けいろ]" />
          </p>
          <div className="mt-2 overflow-hidden rounded-tile">
            <EvacMap
              center={home ?? { lat: 35.7186, lng: 139.7237 }}
              home={home}
              shelters={shelter ? [shelter] : []}
              selectedShelterId={shelter?.id ?? null}
              routes={routes}
              activeRouteId={takenRouteIds[takenRouteIds.length - 1] ?? startRouteId}
              height={190}
            />
          </div>
          <div className="mt-2.5 flex flex-col gap-1 text-13 text-ink-muted">
            <p>
              <Furigana text="選[えら]んだ避難場所[ひなんばしょ]" />：
              <span className="font-display font-bold text-ink">
                <Furigana text={shelter?.name ?? "—"} />
              </span>
            </p>
            <p>
              <Furigana text="はじめに選[えら]んだ経路[けいろ]" />：
              <Furigana text={startRoute?.label ?? "—"} />（
              {startRoute ? formatDistance(startRoute.distanceM) : "—"}）
            </p>
            <p>
              <Furigana text="実際[じっさい]に通[とお]った経路[けいろ]" />：
              {changed ? (
                <span className="font-display font-bold text-safe">
                  <Furigana text="途中[とちゅう]で別[べつ]ルートに変更[へんこう]" />
                </span>
              ) : (
                <Furigana text="最初[さいしょ]の経路[けいろ]のまま" />
              )}
            </p>
            <p>
              <Furigana text="到着[とうちゃく]までの想定[そうてい]時間[じかん]" />：
              <span className="font-display font-bold text-ink">{formatDuration(arrival)}</span>
              <span className="text-11 text-ink-soft">
                （<Furigana text="判断[はんだん]でかかった時間[じかん]を含[ふく]む" />）
              </span>
            </p>
          </div>
        </Card>

        <div className="rounded-tile bg-safe-soft p-4">
          <p className="font-display text-sm font-bold text-safe">
            ◎ <Furigana text="避[さ]けられた危険[きけん]" />
          </p>
          <p className="mt-1 text-13 text-ink-muted">
            <Furigana text="危険[きけん]に近[ちか]づかない判断[はんだん]（距離[きょり]を取[と]る・待[ま]つ・迂回[うかい]する）は" />{" "}
            <span className="font-display font-bold text-ink">
              {avoidanceCount(evac)} / {rows.length}
            </span>{" "}
            <Furigana text="回[かい]でした。" />
          </p>
          {good.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {good.map(({ d, event, choice }) => (
                <li key={d.pointId} className="text-13 text-ink-muted">
                  ・<Furigana text={event.title} />
                  では「<Furigana text={choice.label} />」
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="それぞれの判断[はんだん]" />
          </p>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="「正解[せいかい]」ではなく、その場[ば]での優先順位[ゆうせんじゅんい]の話[はなし]です。どの選択[せんたく]にも利点[りてん]と注意点[ちゅういてん]があります。" />
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {rows.map(({ d, event, choice }, i) => (
              <details key={d.pointId} className="rounded-field bg-canvas p-3">
                <summary className="cursor-pointer list-none">
                  <span className="font-display text-11 font-bold text-primary-ink">
                    <Furigana text="判断[はんだん]" />
                    {i + 1}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="flex-1 font-display text-13 font-bold text-ink">
                      {d.timedOut ? "時間切れ：" : ""}
                      <Furigana text={choice.label} />
                    </span>
                    <span aria-hidden className="text-ink-soft">
                      ＋
                    </span>
                  </span>
                </summary>
                <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                  <p className="text-11 text-ink-soft">
                    <Furigana text={event.situation} />
                  </p>
                  <div>
                    <p className="font-display text-11 font-bold text-safe">
                      <Furigana text="この選択[せんたく]の利点[りてん]" />
                    </p>
                    {choice.pros.map((t) => (
                      <p key={t} className="text-13 text-ink-muted">
                        ・<Furigana text={t} />
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="font-display text-11 font-bold text-warn">
                      <Furigana text="気[き]をつけたい点[てん]" />
                    </p>
                    {choice.cons.map((t) => (
                      <p key={t} className="text-13 text-ink-muted">
                        ・<Furigana text={t} />
                      </p>
                    ))}
                  </div>
                  <p className="text-11 text-ink-soft">
                    <Furigana text={event.hint} />
                  </p>
                  <a
                    href={event.reference.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-11 text-primary-ink underline underline-offset-2"
                  >
                    {event.reference.label}
                  </a>
                </div>
              </details>
            ))}
          </div>
        </Card>

        {improve.length > 0 ? (
          <div className="rounded-tile bg-warn-soft p-4">
            <p className="font-display text-sm font-bold text-warn">
              <Furigana text="次[つぎ]に試[ため]したい判断[はんだん]" />
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {improve.map(({ d, event }) => {
                const better = event.choices.find((c) => c.priority === 3);
                return (
                  <li key={d.pointId} className="text-13 text-ink-muted">
                    ・<Furigana text={event.title} />
                    では「<Furigana text={better?.label ?? ""} />」も選[えら]べました
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="平常時[へいじょうじ]に確[たし]かめること をひとつ選[えら]ぶ" />
          </p>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="この体験[たいけん]でいちばん気[き]になったものを選[えら]んでおくと、次[つぎ]にこの道[みち]を通[とお]るときに思[おも]い出[だ]せます。" />
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {followUps.map((f) => {
              const on = followUp === f;
              return (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => update({ followUp: on ? null : f })}
                    aria-pressed={on}
                    className={[
                      "w-full rounded-tile border p-3 text-left text-13 transition-colors",
                      on
                        ? "border-primary-mid bg-primary-soft text-ink"
                        : "border-border bg-surface text-ink-muted",
                    ].join(" ")}
                  >
                    <Furigana text={f} />
                  </button>
                </li>
              );
            })}
          </ul>
          {followUp ? (
            <p className="mt-3 rounded-field bg-safe-soft p-3 text-13 font-semibold text-ink-muted">
              <Furigana text="今度[こんど]この道[みち]を通[とお]るとき：" />
              <Furigana text={followUp} />
            </p>
          ) : null}
        </Card>

        <Card className="bg-canvas p-[18px] shadow-none">
          <p className="text-11 leading-[1.6] text-ink-muted">
            <Furigana text="このシミュレーションの危険[きけん]はすべて想定[そうてい]です。実在[じつざい]の建物[たてもの]・塀[へい]・道路[どうろ]が壊[こわ]れると判定[はんてい]したものではありません。実際[じっさい]の避難[ひなん]では、自治体[じちたい]や気象庁[きしょうちょう]の情報[じょうほう]に従[したが]ってください。" />
          </p>
        </Card>

        <div className="flex gap-3">
          <Button
            size="md"
            variant="outline"
            onClick={() => {
              const h = home;
              const s = shelter;
              reset();
              update({ home: h, shelter: s });
              router.push("/evac/routes");
            }}
          >
            <Furigana text="別[べつ]の経路[けいろ]で試[ため]す" />
          </Button>
          <Button size="md" onClick={() => router.push("/")}>
            <Furigana text="ホームへ" />
          </Button>
        </div>
      </main>
    </Screen>
  );
}
