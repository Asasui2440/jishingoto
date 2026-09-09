"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import roomQuiz from "@/../public/figma/img/room-quiz.jpg";
import { ChevronRightIcon, Volume2Icon } from "@/components/icons";
import { Meter, Tag } from "@/components/ui/Bits";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { fetchQuestions } from "@/lib/api";
import { RISK_KINDS, type Choice, type Question } from "@/lib/content";
import { useHaptics, useSettings } from "@/lib/settings";
import { getSession, useSession } from "@/lib/session";
import { playRumble, playTick } from "@/lib/audio";

/** 揺れの演出を出す長さ。最初の1問だけ鳴らす */
const SHAKE_MS = 2600;

/**
 * 1問ぶんの出題。
 *
 * カウントダウンの状態は「その設問だけのもの」なので、
 * 親から key={question.id} で貼り替えて初期化する。
 */
function QuestionView({
  question,
  index,
  total,
  shake,
  onAnswer,
  photoUrl,
}: {
  question: Question;
  index: number;
  total: number;
  /** 地震の演出を出すか。最初の1問だけ true */
  shake: boolean;
  onAnswer: (choice: Choice, timedOut: boolean) => void;
  photoUrl: string | null;
}) {
  const { sound, audience } = useSettings();
  const vibrate = useHaptics();
  const [remaining, setRemaining] = useState(question.seconds > 0 ? question.seconds : null);
  const [shaking, setShaking] = useState(shake);

  // 地震の演出は最初の1問だけ。毎問やると体験が間延びする。
  useEffect(() => {
    if (!shake) return;
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

  const kind = question.riskKind ? RISK_KINDS[question.riskKind] : null;

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 pt-3">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-black text-primary-ink">Q{index + 1}</span>
            <span className="text-13 text-ink-muted">
              <Furigana text={question.category} />
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            <Volume2Icon className="size-4" />
            音・振動: {sound ? "ON" : "OFF"}
          </span>
        </div>
        {/* 全問終わるまで結果は出さないので、進み具合だけ見せる */}
        <div className="mt-2 px-6">
          <p className="mb-2 text-13 font-bold text-primary-ink" aria-live="polite">
            <Furigana text={question.phase === "after" ? "② ゆれがおさまったあと → まわりを確認[かくにん]" : "① 地震[じしん]が発生[はっせい] → 身[み]を守[まも]る"} adult={question.phase === "after" ? "② 揺れが収まった後：周囲の確認・避難の判断" : "① 地震発生：揺れている間の初動"} />
          </p>
          <Meter value={(index + 1) / total} height={6} track="var(--color-border)" />
          <p className="mt-1 text-right text-11 text-ink-soft">
            {index + 1} / {total}
          </p>
        </div>
      </div>

      <div className={["flex flex-col gap-4 px-6 pt-2", shaking ? "animate-quake" : ""].join(" ")}>
        {/* 部屋で「あぶない」と確認した場所が、そのまま問題になる */}
        {kind && question.place ? (
          <div className="flex items-center gap-2">
            <Tag color={kind.text} soft={kind.soft}>
              <Furigana text={kind.label} />
            </Tag>
            <span className="font-display text-13 font-bold text-ink-muted">
              {audience === "adult" ? "あなたの部屋で検出した「" : "きみの部屋の「"}
              <Furigana text={question.place} adult={question.adultPlace} />」{audience === "adult" ? "について" : "の話"}
            </span>
          </div>
        ) : null}

        <Card className="p-4">
          <p className="font-display text-lg font-bold text-ink">
            <Furigana text={question.situation} adult={question.adultSituation} />
          </p>
        </Card>

        <div className="relative h-[190px] w-full overflow-hidden rounded-panel bg-ink">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="あなたの部屋" className="size-full object-cover" />
          ) : (
            <Image src={roomQuiz} alt="部屋のサンプル" fill sizes="354px" className="object-cover" priority />
          )}

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
                <Furigana text={question.highlight.label} />
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

export default function QuizPage() {
  const router = useRouter();
  const { answer, photoUrl, update } = useSession();
  const { sound } = useSettings();
  const vibrate = useHaptics();

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);

  // 部屋で確認した危険にひもづく設問を取りに行く
  useEffect(() => {
    const risks = getSession().risks;
    if (!getSession().analysisSource) {
      router.replace("/analyzing");
      return;
    }
    let alive = true;
    void fetchQuestions(risks).then((qs) => {
      if (alive) {
        setQuestions(qs);
        update({ questions: qs });
      }
    });
    return () => {
      alive = false;
    };
  }, [router, update]);

  const total = questions?.length ?? 0;

  const onAnswer = useCallback(
    (choice: Choice, timedOut: boolean) => {
      if (!questions) return;
      const question = questions[index];

      // answer は同じ設問への回答を上書きするので、進む前に記録しておく
      answer({
        questionId: question.id,
        choiceId: choice.id,
        safety: choice.safety,
        axis: question.axis,
        timedOut,
      });

      // 正解／不正解を示さないよう、音も振動も選択によらず同じにする
      vibrate(12);
      if (sound) playTick(660);

      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        update({ finishedAt: Date.now() });
        router.push("/result");
      }
    },
    [answer, index, questions, router, sound, update, vibrate],
  );

  if (!questions) {
    return (
      <div className="flex min-h-dvh flex-col justify-between">
        <StatusBar />
        <p className="px-6 text-center text-13 text-ink-muted">問題を用意しています...</p>
        <DisclaimerFooter />
      </div>
    );
  }

  return (
    <QuestionView
      key={questions[index].id}
      question={questions[index]}
      index={index}
      total={total}
      shake={index === 0}
      onAnswer={onAnswer}
      photoUrl={photoUrl}
    />
  );
}
