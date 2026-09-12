"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RoomConnectionSummary } from "@/components/evac/RoomConnectionSummary";
import { RouteLegend } from "@/components/evac/RouteLegend";
import { walkedPath, walkDistance } from "@/lib/evac-walk";
import { EvacModeBadge } from "@/components/evac/EvacMode";
import { EvacMap } from "@/components/evac/EvacMap";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { findChoice, findEvent } from "@/lib/evac-content";
import {
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
 * 通った道と選んだ行動を並べ、
 * 平常時にひとつ確認することを持ち帰ってもらうのが目的。
 */
export default function EvacReportPage() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const evac = useEvac();
  const { mode, home, shelter, routes, startRouteId, takenRouteIds, decisions, walk, followUp, update, reset } =
    evac;

  useEffect(() => {
    if (!getEvac().finishedAt) router.replace("/evac");
  }, [router]);

  const startRoute = routes.find((r) => r.id === startRouteId) ?? null;
  const changed = takenRouteIds.length > 1;

  const rows = useMemo(
    () =>
      decisions.flatMap((d) => {
        const event = walk?.steps.find((s) => s.pointId === d.pointId)?.event ?? findEvent(d.eventId);
        const choice = event?.choices.find((c) => c.id === d.choiceId) ?? findChoice(d.eventId, d.choiceId);
        return event && choice ? [{ d, event, choice }] : [];
      }),
    [decisions, walk],
  );

  const trail = walkedPath(walk);
  const selectDecision = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => document.getElementById(`decision-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const followUps = useMemo(
    () => rows.length ? Array.from(new Set(rows.map((r) => r.event.followUp))) : ["自治体の防災マップで、この経路と避難先の指定を平常時に確認する"],
    [rows],
  );

  const arrival = totalSeconds(evac);

  return (
    <Screen>
      <main className="animate-rise flex flex-1 flex-col gap-4 px-6 pt-3 pb-6">
        <header>
          <EvacModeBadge mode={mode} />
          <div className="flex items-center gap-2">
            <span className="rounded-field bg-primary-soft px-2 py-0.5 font-display text-11 font-black text-primary-ink">
              フェーズ2
            </span>
            <h1 className="font-display text-lg font-bold text-ink">
              <Furigana text="ひなん経路[けいろ]のふりかえり" />
            </h1>
          </div>
        </header>

        <RoomConnectionSummary complete />

        <div className="grid grid-cols-2 gap-3 rounded-panel bg-primary-soft p-4">
          <div><p className="text-11 text-primary-ink"><Furigana text="考[かんが]えた場面[ばめん]" /></p><p className="mt-1 font-display text-28 font-bold text-ink">{rows.length}<span className="ml-1 text-13">地点</span></p></div>
          <div><p className="text-11 text-primary-ink"><Furigana text="通[とお]った道[みち]の長[なが]さ" /></p><p className="mt-2 font-display text-xl font-bold text-ink">{formatDistance(walk ? walkDistance(walk) : startRoute?.distanceM ?? 0)}</p></div>
          <p className="col-span-2 text-11 text-ink-muted"><Furigana text="これは地図[ちず]の上[うえ]で体験[たいけん]した記録[きろく]です。" /></p>
        </div>

        <Card className="p-[18px]">
          <p className="font-display text-sm font-bold text-ink">
            <Furigana text="通[とお]った経路[けいろ]" />
          </p>
          <div className="mt-2 overflow-hidden rounded-tile">
            <EvacMap
              mode={mode}
              center={home ?? { lat: 35.7186, lng: 139.7237 }}
              home={home}
              shelters={shelter ? [shelter] : []}
              selectedShelterId={shelter?.id ?? null}
              routes={startRoute ? [startRoute] : []}
              activeRouteId={startRouteId}
              traveledPath={walk ? trail : undefined}
              markers={rows.flatMap(({ d }, i) => d.position ? [{ id: d.pointId, position: d.position, label: String(i + 1), color: selectedId === d.pointId ? "#ffcc00" : "#fff6d6", title: `判断${i + 1}の記録を見る`, onClick: () => selectDecision(d.pointId) }] : [])}
              height={250}
            />
          </div>
          <div className="mt-3"><RouteLegend /></div>
          <p className="mt-2 text-11 text-ink-soft"><Furigana text="番号[ばんごう]をタップすると、その場所[ばしょ]での選択[せんたく]を読[よ]めます。" /></p>
          {startRoute?.demo ? <p className="mt-2 text-11 text-primary-ink">練習用の経路です。実際の道路とは異なります。</p> : null}
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
              <Furigana text="体験中[たいけんちゅう]に通[とお]った経路[けいろ]" />：
              {changed ? (
                <span className="font-display font-bold text-primary-ink">
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

        {walk?.source === "geo-ai" && rows.length === 0 ? <p className="rounded-field bg-primary-soft p-3 text-13 leading-relaxed text-ink-muted">今回の地形データから出題できる候補は見つかりませんでした。危険がないことや、この経路の安全を確認した意味ではありません。</p> : null}

        <Card className="p-[18px]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text="それぞれの判断[はんだん]" />
          </p>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="道[みち]を選[えら]ぶときに、何[なに]を考[かんが]えましたか？それぞれの場面[ばめん]で確[たし]かめたいことを見[み]てみましょう。" />
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {rows.map(({ d, event, choice }, i) => (
              <details id={`decision-${d.pointId}`} key={d.pointId} open={selectedId === d.pointId} className="scroll-mt-4 rounded-field bg-canvas p-3">
                <summary onClick={(e) => { e.preventDefault(); setSelectedId(selectedId === d.pointId ? null : d.pointId); }} className="cursor-pointer list-none">
                  <span className="font-display text-11 font-bold text-primary-ink">
                    <Furigana text="判断[はんだん]" />
                    {i + 1}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="flex-1 font-display text-13 font-bold text-ink">
                      {d.timedOut ? "時間をかけて選択：" : ""}
                      <Furigana text={choice.label} />
                    </span>
                    <span aria-hidden className="text-ink-soft">
                      {selectedId === d.pointId ? "−" : "＋"}
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
                  {event.evidence ? <div className="rounded-field border border-border bg-surface p-3 text-11 leading-relaxed text-ink-muted">
                    <p className="font-bold text-primary-ink">この地点を選んだ根拠</p>
                    <p>地理データの分類：{event.evidence.classification}</p>
                    <p className="mt-1">AIの補足：{event.evidence.aiReason}</p>
                    {event.evidence.uncertainties.map((text, i) => <p key={i}>未確認：{text}</p>)}
                    <p className="mt-1">データ取得日：{event.evidence.downloadedAt}（現地調査日とは異なります）</p>
                  </div> : null}
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
