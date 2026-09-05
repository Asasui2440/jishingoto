"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventSheet } from "@/components/evac/EventSheet";
import { EvacMap } from "@/components/evac/EvacMap";
import { StreetStage } from "@/components/evac/StreetStage";
import { XCircleDarkIcon } from "@/components/icons";
import { Meter } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { buildWalkSteps, fetchDecisionPoints, type WalkStep } from "@/lib/evac-api";
import { SCENARIO_BADGE, type EvacChoice } from "@/lib/evac-content";
import { formatDistance, formatDuration, getEvac, useEvac } from "@/lib/evac";
import { useHaptics } from "@/lib/settings";

/**
 * フェーズ2 ③：自宅付近から避難場所まで、ストリートビューで実際に歩く。
 *
 * 経路を約70mごとに区切り、「進む」でパノラマを次の地点へ移す。
 * 判断地点に着いた回だけ、下部シートに想定シナリオと3択が出る。
 *
 * 画面の並び（仕様 7）:
 *   [ 想定シナリオ帯 ]
 *   [ ストリートビュー ＋ HUD（危険範囲・番号はイベント時だけ） ]
 *   [ 下部：進む／判断シート ]  ← パノラマの上には重ねない（帰属表示を隠さない）
 */
export default function EvacWalkPage() {
  const router = useRouter();
  const { home, shelter, routes, startRouteId, timerSeconds, decide, pushTakenRoute, update } =
    useEvac();
  const vibrate = useHaptics();

  const [steps, setSteps] = useState<WalkStep[] | null>(null);
  const [index, setIndex] = useState(0);
  /** 迂回して切り替わったあとの経路。null なら最初に選んだ経路のまま。 */
  const [reroutedTo, setReroutedTo] = useState<string | null>(null);
  const [extraSeconds, setExtraSeconds] = useState(0);
  /** この地点だけ制限時間を延ばした・なくしたときの値 */
  const [timerOverride, setTimerOverride] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [answered, setAnswered] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    choice: EvacChoice;
    timedOut: boolean;
    rerouted: boolean;
  } | null>(null);

  // 経路を選んでいなければ戻す
  useEffect(() => {
    const s = getEvac();
    if (!s.startRouteId || s.routes.length === 0) router.replace("/evac");
  }, [router]);

  const routeId = reroutedTo ?? startRouteId;
  const route = useMemo(() => routes.find((r) => r.id === routeId) ?? null, [routes, routeId]);
  const timerFor = timerOverride ?? timerSeconds;

  // 経路を「歩ける粒度」に割る
  useEffect(() => {
    if (!route || steps) return;
    let alive = true;
    void fetchDecisionPoints(route).then((points) => {
      if (alive) setSteps(buildWalkSteps(route, points));
    });
    return () => {
      alive = false;
    };
  }, [route, steps]);

  const step = steps?.[index] ?? null;
  const decisionSteps = useMemo(() => steps?.filter((s) => s.event) ?? [], [steps]);
  const decisionNo = step?.event
    ? decisionSteps.findIndex((s) => s.id === step.id) + 1
    : decisionSteps.filter((s) => s.t < (step?.t ?? 0)).length;

  /** いま判断シートを出すべきか（まだ答えていないイベント地点） */
  const pendingEvent =
    step?.event && step.pointId && !answered.includes(step.pointId) && !feedback
      ? step.event
      : null;

  const arrived = steps !== null && index >= steps.length - 1 && !pendingEvent && !feedback;

  const onChoose = useCallback(
    async (choice: EvacChoice, timedOut: boolean) => {
      if (!steps || !step?.event || !step.pointId) return;
      const pointId = step.pointId;
      vibrate(12);

      const other = routes.find((r) => r.id !== routeId) ?? null;
      const rerouted = choice.reroute && other !== null;

      decide({
        pointId,
        eventId: step.event.id,
        choiceId: choice.id,
        rerouted,
        timedOut,
        extraSeconds: choice.extraSeconds,
      });
      setAnswered((prev) => [...prev, pointId]);
      setExtraSeconds((s) => s + choice.extraSeconds);

      if (rerouted && other) {
        // 迂回したら、この先の道のりと判断地点を別ルートのものに差し替える
        const altPoints = await fetchDecisionPoints(other);
        const altSteps = buildWalkSteps(other, altPoints).filter((s) => s.t > step.t);
        setSteps([...steps.slice(0, index + 1), ...altSteps]);
        setReroutedTo(other.id);
        pushTakenRoute(other.id);
      }

      setFeedback({ choice, timedOut, rerouted });
    },
    [decide, index, pushTakenRoute, routeId, routes, step, steps, vibrate],
  );

  const forward = () => {
    if (!steps) return;
    setFeedback(null);
    setTimerOverride(null);
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  if (!route || !steps || !step) {
    return (
      <div className="flex min-h-dvh flex-col justify-between">
        <StatusBar />
        <p className="px-6 text-center text-13 text-ink-muted">経路を用意しています...</p>
        <DisclaimerFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />

        {/* 常時表示：これは想定シナリオである（仕様 14） */}
        <div className="flex items-center gap-2 border-y border-warn bg-warn-soft px-5 py-2">
          <span className="rounded-chip bg-warn px-2 py-0.5 font-display text-11 font-black text-ink">
            <Furigana text={SCENARIO_BADGE} />
          </span>
          <p className="text-11 font-semibold text-ink-muted">
            <Furigana text="実際[じっさい]にこの場所[ばしょ]が壊[こわ]れたという意味[いみ]ではありません" />
          </p>
        </div>

        <div className="px-5 pt-3">
          <StreetStage
            position={step.position}
            heading={step.heading}
            kind={step.event?.kind ?? null}
            zone={pendingEvent ? pendingEvent.zone : null}
            zoneNumber={decisionNo}
            height={250}
          >
            {/* HUD。下端は Google の帰属表示のために空けている。 */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
              <span className="flex flex-col items-start gap-1.5">
                <span className="rounded-chip bg-black/65 px-2 py-1 text-11 font-bold text-white">
                  <Furigana text="避難場所[ひなんばしょ]まで" /> {formatDistance(step.remainingM)}・
                  {formatDuration(step.remainingS)}
                </span>
                {extraSeconds > 0 ? (
                  <span className="rounded-chip bg-warn/90 px-2 py-1 text-11 font-bold text-ink">
                    <Furigana text="判断[はんだん]でついた遅[おく]れ" /> ＋
                    {Math.max(1, Math.round(extraSeconds / 60))}分
                  </span>
                ) : null}
              </span>
              <span className="flex flex-col items-end gap-1.5">
                <span className="rounded-chip bg-black/65 px-2 py-1 text-11 font-bold text-white">
                  <Furigana text="判断[はんだん]" /> {Math.max(decisionNo, 0)}/
                  {decisionSteps.length}
                </span>
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className="pointer-events-auto rounded-chip bg-surface/95 px-2 py-1 font-display text-11 font-bold text-primary-ink shadow-sm"
                >
                  <Furigana text="地図[ちず]へ戻[もど]る" />
                </button>
              </span>
            </div>

            <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 rounded-chip bg-black/55 px-2 py-1 text-11 font-bold text-white">
              ↑ <Furigana text="進[すす]む向[む]き" />
            </span>
          </StreetStage>

          {/* 家からの進み具合 */}
          <div className="mt-2">
            <Meter value={step.t} height={5} track="var(--color-border)" />
            <div className="mt-1 flex justify-between text-11 text-ink-soft">
              <span>
                <Furigana text="家[いえ]の近[ちか]く" />
              </span>
              <span>
                <Furigana text={shelter?.name ?? "避難場所[ひなんばしょ]"} />
              </span>
            </div>
          </div>
          <p className="mt-1 text-11 text-ink-soft">
            <Furigana text="背景[はいけい]はストリートビュー（Google）。重[かさ]ねているのは想定[そうてい]の範囲[はんい]だけです。" />
          </p>
        </div>
      </div>

      {/* 下部：判断シート → フィードバック → 進む／到着 */}
      {pendingEvent ? (
        <EventSheet
          // 制限時間を変えたら作り直して、カウントを入れ替える
          key={`${step.id}:${timerFor}`}
          event={pendingEvent}
          index={Math.max(decisionNo - 1, 0)}
          total={decisionSteps.length}
          seconds={timerFor}
          onExtend={() => setTimerOverride(timerFor > 0 ? timerFor + 10 : 10)}
          onDisableTimer={() => {
            setTimerOverride(0);
            update({ timerSeconds: 0 });
          }}
          onChoose={onChoose}
        />
      ) : feedback ? (
        <div className="animate-rise flex flex-col gap-3 rounded-t-panel bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgba(26,32,44,0.10)]">
          <p className="font-display text-13 font-bold text-primary-ink">
            {feedback.timedOut ? (
              <Furigana text="時間切[じかんぎ]れ：そのまま進[すす]みました" />
            ) : (
              <Furigana text="えらんだ行動[こうどう]" />
            )}
          </p>
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text={feedback.choice.label} />
          </p>
          {/* 選択直後は短く。詳しい利点・注意点は結果レポートでまとめる（仕様 6.3） */}
          <p className="text-13 leading-[1.6] text-ink-muted">
            <Furigana text={feedback.choice.feedback} />
          </p>
          {feedback.rerouted ? (
            <p className="rounded-field bg-safe-soft px-3 py-2 text-13 font-semibold text-ink-muted">
              <Furigana text="別[べつ]ルートに切[き]り替[か]えました。ここから先[さき]の道[みち]も変[か]わります。" />
            </p>
          ) : null}
          <Button onClick={forward}>
            <Furigana text="先[さき]へ進[すす]む" />
          </Button>
        </div>
      ) : arrived ? (
        <div className="animate-rise flex flex-col gap-3 rounded-t-panel bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgba(26,32,44,0.10)]">
          <p className="font-display text-15 font-bold text-ink">
            <Furigana text={shelter?.name ?? "避難場所[ひなんばしょ]"} />
            <Furigana text=" に着[つ]きました" />
          </p>
          <p className="text-13 text-ink-muted">
            <Furigana text="ここまでの判断[はんだん]と、通[とお]った道[みち]をふりかえります。" />
          </p>
          <Button
            onClick={() => {
              update({ finishedAt: Date.now() });
              router.push("/evac/report");
            }}
          >
            <Furigana text="ふりかえりを見[み]る" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-t-panel bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgba(26,32,44,0.10)]">
          <p className="text-13 text-ink-muted">
            <Furigana text="ストリートビューを見回[みまわ]して、進[すす]む道[みち]を確[たし]かめてね。" />
          </p>
          <Button onClick={forward}>
            <Furigana text="次[つぎ]の地点[ちてん]まで進[すす]む" />
          </Button>
        </div>
      )}

      <DisclaimerFooter />

      {mapOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[402px] rounded-t-panel bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="font-display text-15 font-bold text-ink">
                <Furigana text="いまいる場所[ばしょ]" />
              </p>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="閉じる">
                <XCircleDarkIcon className="size-6" />
              </button>
            </div>
            <div className="mt-3">
              <EvacMap
                center={step.position}
                home={home}
                shelters={shelter ? [shelter] : []}
                selectedShelterId={shelter?.id ?? null}
                routes={routes}
                activeRouteId={routeId}
                walker={step.position}
                height={240}
              />
            </div>
            <p className="mt-2 text-11 text-ink-soft">
              <Furigana text="太[ふと]い線[せん]がいま進[すす]んでいる経路[けいろ]です。" />
            </p>
            <div className="mt-3">
              <Button size="md" variant="quiet" onClick={() => setMapOpen(false)}>
                <Furigana text="ストリートビューにもどる" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
