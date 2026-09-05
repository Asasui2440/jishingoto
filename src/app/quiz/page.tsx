"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import roomQuiz from "@/../public/figma/img/room-quiz.jpg";
import {
  ArrowRight2Icon,
  CheckSmallIcon,
  ChevronRightIcon,
  LightbulbBlueIcon,
  PolygonIcon,
  Volume2Icon,
} from "@/components/icons";
import { Tag } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana, plain } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { playRumble, playTick } from "@/lib/audio";
import { QUESTIONS, safetyBand, type Choice, type Question } from "@/lib/content";
import { useHaptics, useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";

/** 揺れの演出を出す長さ */
const SHAKE_MS = 2600;

/* ------------------------------------------------------------------ */
/* 出題                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 1問ぶんの出題。
 *
 * 揺れ・カウントダウンの状態は「その設問だけのもの」なので、
 * 親から key={question.id} で貼り替えて初期化する。
 */
function QuestionView({
  question,
  index,
  total,
  onAnswer,
}: {
  question: Question;
  index: number;
  total: number;
  onAnswer: (choice: Choice, timedOut: boolean) => void;
}) {
  const { sound } = useSettings();
  const vibrate = useHaptics();
  const [remaining, setRemaining] = useState(question.seconds > 0 ? question.seconds : null);
  const [shaking, setShaking] = useState(true);

  // 設問が出た瞬間に、揺れの音と振動を始める
  useEffect(() => {
    const stopSound = sound ? playRumble(SHAKE_MS / 1000 + 1) : null;
    vibrate([0, 200, 80, 200, 80, 300]);
    const id = setTimeout(() => setShaking(false), SHAKE_MS);
    return () => {
      clearTimeout(id);
      stopSound?.();
    };
    // 出題ごとに1回だけ。音の設定を途中で変えても鳴らし直さない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 制限時間。0 になったら「迷っているうちに時間切れ」として最後の選択肢で進む。
  useEffect(() => {
    if (remaining === null) return;
    const id = setTimeout(() => {
      if (remaining <= 1) onAnswer(question.choices[question.choices.length - 1], true);
      else setRemaining(remaining - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [remaining, question, onAnswer]);

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 pt-3">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-black text-primary-ink">Q{index + 1}</span>
            <span className="text-13 text-ink-muted">
              <Furigana text={question.category} /> ({index + 1}/{total})
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            <Volume2Icon className="size-4" />
            音・振動: {sound ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      <div className={["flex flex-col gap-4 px-6 pt-3", shaking ? "animate-quake" : ""].join(" ")}>
        <Card className="p-4">
          <p className="font-display text-lg font-bold text-ink">
            <Furigana text={question.situation} />
          </p>
        </Card>

        <div className="relative h-[190px] w-full overflow-hidden rounded-panel bg-ink">
          <Image src={roomQuiz} alt="" fill sizes="354px" className="object-cover" priority />

          {question.highlight ? (
            <>
              <span
                aria-hidden
                className="absolute rounded-field border-[3px] border-warn bg-warn/20"
                style={{
                  left: `${question.highlight.x}%`,
                  top: `${question.highlight.y}%`,
                  width: `${question.highlight.w}%`,
                  height: `${question.highlight.h}%`,
                }}
              />
              <Tag
                color="var(--color-warn)"
                className="absolute rounded-chip"
                style={{
                  left: `${question.highlight.x + question.highlight.w / 2}%`,
                  top: `${question.highlight.y + question.highlight.h / 2}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {question.highlight.label}
              </Tag>
            </>
          ) : null}

          {remaining !== null ? (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-[20px] bg-black/70 px-3 py-2">
              <span
                aria-hidden
                className={[
                  "size-2 rounded-full",
                  remaining <= 3 ? "animate-pulse bg-danger" : "bg-white",
                ].join(" ")}
              />
              <span className="font-display text-13 font-bold tabular-nums text-white">
                {remaining}秒
              </span>
            </div>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2.5">
          {question.choices.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onAnswer(c, false)}
                className="flex w-full items-center gap-3 rounded-tile border border-border bg-surface p-3.5 text-left transition-colors active:border-primary-mid active:bg-primary-soft"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-base font-bold text-primary-ink">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-15 font-bold text-ink">
                    <Furigana text={c.label} />
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    <Furigana text={c.detail} />
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-ink-soft" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <DisclaimerFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* フィードバック                                                        */
/* ------------------------------------------------------------------ */

function SafetyScale({ safety }: { safety: number }) {
  const band = safetyBand(safety);
  return (
    <Card className="rounded-tile">
      <p className="font-display text-13 font-bold text-ink">
        <Furigana text="えらんだ行動[こうどう]の安全度[あんぜんど]" />
      </p>
      {/* 「◯✕」ではなく、どのくらい安全寄りかを帯で見せる */}
      <div
        className="mt-2.5 flex h-3 overflow-hidden rounded-md"
        role="img"
        aria-label={`安全度は「${plain(band.label)}」`}
      >
        <span className="w-[28%] bg-danger" />
        <span className="w-[28%] bg-warn" />
        <span className="flex-1 bg-safe" />
      </div>
      {/* 目盛りの端のラベルと、いまの位置を指すラベルは行を分ける。
          同じ行に置くと、安全度が両端に寄ったときに重なる。 */}
      <div className="relative mt-1 h-6">
        <span
          className="absolute flex -translate-x-1/2 flex-col items-center gap-0.5"
          style={{ left: `${Math.min(85, Math.max(15, safety * 100))}%` }}
        >
          <PolygonIcon className="h-1.5 w-2 rotate-180" style={{ color: band.color }} />
          <span
            className="font-display text-11 font-bold whitespace-nowrap"
            style={{ color: band.color }}
          >
            <Furigana text={band.label} />
          </span>
        </span>
      </div>
      <div className="flex justify-between text-11 text-ink-soft">
        <span>あぶない</span>
        <span>安全！</span>
      </div>
    </Card>
  );
}

function FeedbackView({
  choice,
  timedOut,
  index,
  total,
  onNext,
}: {
  choice: Choice;
  /** 時間切れで自動的に選ばれた場合。「きみが選んだ」とは書かない */
  timedOut: boolean;
  index: number;
  total: number;
  onNext: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 pt-3">
          <h1 className="font-display text-base font-bold text-ink">
            <Furigana text="行動[こうどう]のふりかえり" />
          </h1>
          <p className="text-13 text-ink-muted">
            問題 {index + 1}/{total}
          </p>
        </div>
      </div>

      <div className="animate-rise flex flex-col gap-4 px-6 pt-3">
        <div
          className={[
            "rounded-card border-2 p-4",
            timedOut ? "border-warn bg-warn-soft" : "border-safe bg-safe-soft",
          ].join(" ")}
        >
          <p className="flex items-center gap-2">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-xl"
              style={{ background: timedOut ? "var(--color-warn)" : "var(--color-safe)" }}
            >
              {timedOut ? (
                // Figma の ring アイコンは中身が空だったので、記号で代用する
                <span className="font-display text-sm leading-none font-black text-white">!</span>
              ) : (
                <CheckSmallIcon className="size-3.5 text-white" />
              )}
            </span>
            <span
              className="font-display text-xs font-bold"
              style={{ color: timedOut ? "var(--color-warn)" : "var(--color-safe)" }}
            >
              <Furigana
                text={
                  timedOut
                    ? "時間切[じかんぎ]れ！ こうなったよ"
                    : "きみのえらんだ行動[こうどう]"
                }
              />
            </span>
          </p>
          <p className="mt-2 font-display text-base font-bold text-ink">
            <Furigana text={choice.label} />
          </p>
        </div>

        <SafetyScale safety={choice.safety} />

        <Card className="p-[18px]">
          <p className="flex items-center gap-1.5 font-display text-sm font-bold text-primary-ink">
            <LightbulbBlueIcon className="size-[18px] shrink-0 text-primary-ink" />
            <Furigana text="AI解説[かいせつ]アドバイス" />
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {choice.explanation.map((p, i) => (
              <p key={i} className="text-sm leading-[1.6] text-ink-muted">
                <Furigana text={p} />
              </p>
            ))}
          </div>
        </Card>

        <Button onClick={onNext}>
          {index + 1 < total ? "つぎの問題へ" : "けっかを見る"}
          <ArrowRight2Icon className="size-5 text-ink" />
        </Button>
      </div>

      <DisclaimerFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function QuizPage() {
  const router = useRouter();
  const { answer } = useSession();
  const { sound } = useSettings();
  const vibrate = useHaptics();

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<{ choice: Choice; timedOut: boolean } | null>(null);

  const question = QUESTIONS[index];
  const total = QUESTIONS.length;

  const onAnswer = useCallback(
    (choice: Choice, timedOut: boolean) => {
      setPicked({ choice, timedOut });
      vibrate(choice.safety >= 0.7 ? [14, 60, 14] : 24);
      if (sound) playTick(choice.safety >= 0.7 ? 780 : 320);
      answer({
        questionId: question.id,
        choiceId: choice.id,
        safety: choice.safety,
        axis: question.axis,
        timedOut,
      });
    },
    [answer, question, sound, vibrate],
  );

  const next = () => {
    setPicked(null);
    if (index + 1 < total) setIndex(index + 1);
    else router.push("/result");
  };

  if (picked) {
    return (
      <FeedbackView
        choice={picked.choice}
        timedOut={picked.timedOut}
        index={index}
        total={total}
        onNext={next}
      />
    );
  }

  return (
    <QuestionView
      key={question.id}
      question={question}
      index={index}
      total={total}
      onAnswer={onAnswer}
    />
  );
}
