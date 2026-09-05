"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck2Icon, XCircleDarkIcon } from "@/components/icons";
import { Tag } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { AXIS_LABEL, safetyBand, type Axis } from "@/lib/content";
import { axisRows, drawShareCard } from "@/lib/share-card";
import { getSession, scoreByAxis, useSession } from "@/lib/session";

const AXES: Axis[] = ["initial", "judgement", "room", "evacuation"];
const SHARE_TEXT = "じぶんの部屋の安全チェック、したよ！ #ジシンゴト";

/**
 * シェアに載せる URL。
 * デプロイ先が変わっても直さなくていいように、実行時のオリジンから組み立てる。
 */
function shareUrl() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export default function SharePage() {
  const router = useRouter();
  const { answers, risks } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState(false);

  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const date = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!getSession().finishedAt) router.replace("/");
  }, [router]);

  // 画面に見えているカードと同じ内容を、書き出し用に Canvas にも描いておく
  useEffect(() => {
    if (canvasRef.current) {
      drawShareCard(canvasRef.current, { rows: axisRows(scores), date });
    }
  }, [scores, date]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    canvas.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jishingoto-result.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const openShare = (href: string) => window.open(href, "_blank", "noopener,noreferrer");

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 pt-3">
          <h1 className="font-display text-lg font-bold text-ink">
            <Furigana text="けっかを友達[ともだち]にシェア" />
          </h1>
          <button type="button" onClick={() => router.push("/result")} aria-label="とじる">
            <XCircleDarkIcon className="size-6 text-ink" />
          </button>
        </div>
      </div>

      <div className="animate-rise flex flex-col gap-4 px-6 pt-3 pb-6">
        {/* プレビュー。書き出す PNG と同じ中身を HTML で組んでいる */}
        <div className="rounded-panel border-[3px] border-primary-mid bg-surface p-5 shadow-[0_8px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between">
            <span className="rounded-chip bg-primary-soft px-2 py-0.5 font-display text-11 font-black text-primary-ink">
              ジシンゴト
            </span>
            <span className="text-11 text-ink-soft">
              {date.getFullYear()}/{date.getMonth() + 1}/{date.getDate()} 挑戦！
            </span>
          </div>

          <div className="mt-4 text-center">
            <p className="font-display text-xl font-black text-primary-ink">
              <Furigana text="じぶんの部屋[へや]の安全[あんぜん]チェック、したよ！" />
            </p>
            <p className="mt-1 text-13 text-ink-muted">シミュレーション結果サマリー</p>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-tile bg-canvas p-3">
            {AXES.map((axis) => {
              const score = scores[axis];
              // 出題されなかった軸は載せない
              if (score === null) return null;
              const band = safetyBand(score / 5);
              return (
                <div key={axis} className="flex items-center justify-between gap-2">
                  <span className="font-display text-13 font-bold text-ink-muted">
                    <Furigana text={AXIS_LABEL[axis]} />
                  </span>
                  <Tag color={band.color}>
                    <Furigana text={band.label} />
                  </Tag>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center font-display text-13 font-bold text-primary-ink">
            <Furigana text="みんなもスマホで「ジシンゴト」を検索[けんさく]してみてね！" />
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-field bg-safe-soft p-3">
          <ShieldCheck2Icon className="size-4 shrink-0" />
          <p className="text-11 font-semibold text-ink-muted">
            <Furigana text="この画像[がぞう]にはお部屋[へや]の写真[しゃしん]や個人情報[こじんじょうほう]は一切[いっさい]ふくまれません" />
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button
            size="md"
            variant="line"
            onClick={() =>
              openShare(
                `https://line.me/R/msg/text/?${encodeURIComponent(`${SHARE_TEXT}\n${shareUrl()}`)}`,
              )
            }
          >
            LINEで送る
          </Button>
          <Button
            size="md"
            variant="x"
            onClick={() =>
              openShare(
                `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(shareUrl())}`,
              )
            }
          >
            X（旧Twitter）にポスト
          </Button>
          <Button size="md" variant="outline" onClick={download} disabled={saving}>
            <Furigana text={saving ? "作成中[さくせいちゅう]..." : "画像[がぞう]としてスマホに保存[ほぞん]する"} />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mx-auto p-2 font-display text-sm font-bold text-primary-ink underline underline-offset-2"
        >
          ホームにもどる
        </button>
      </div>

      {/* 書き出し用。画面には出さない */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      <DisclaimerFooter />
    </div>
  );
}
