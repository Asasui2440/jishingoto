"use client";

import { SocialImageShare } from "@/components/SocialImageShare";
import { AftermathShare } from "@/components/AftermathShare";
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
import { useSettings } from "@/lib/settings";
import { adultText } from "@/lib/adult-copy";

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
  const { audience } = useSettings();
  const shareText = audience === "adult" ? adultText(SHARE_TEXT) : "自分の部屋の安全をチェックしました！ #ジシンゴト";
  const { answers, risks, photoUrl, checked } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState(false);
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);

  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const date = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!getSession().finishedAt) router.replace("/");
  }, [router]);

  // 画面に見えているカードと同じ内容を、書き出し用に Canvas にも描いておく
  useEffect(() => {
    let alive = true;
    if (canvasRef.current) {
      drawShareCard(canvasRef.current, { rows: axisRows(scores), date, audience });
      canvasRef.current.toBlob(blob => {
        if (alive) setResultFile(blob ? new File([blob], "jishingoto-result.png", { type: "image/png" }) : null);
      }, "image/png");
    }
    return () => { alive = false; };
  }, [scores, date, audience]);

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


  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 pt-3">
          <h1 className="font-display text-lg font-bold text-ink">
            <Furigana text="結果を共有" adult="結果を保存・共有" />
          </h1>
          <button type="button" onClick={() => router.push("/result")} aria-label={audience === "adult" ? "閉じる" : "とじる"}>
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
              {date.getFullYear()}/{date.getMonth() + 1}/{date.getDate()} <Furigana text="挑戦！" />
            </span>
          </div>

          <div className="mt-4 text-center">
            <p className="whitespace-nowrap font-display text-[clamp(11px,3.5vw,16px)] font-black text-primary-ink">
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

          <p className="mt-3 text-sm font-bold text-safe">✓ 室内の備え：{risks.filter(r => checked.includes(`prepared:${r.id}`)).length} / {risks.length} か所 対策済み</p>
          <AftermathShare photoUrl={photoUrl} risks={risks} onFileReady={setRoomFile} allowShare={audience === "adult"} />

          <p className="mt-4 whitespace-nowrap text-center font-display text-[clamp(9px,2.9vw,13px)] font-bold text-primary-ink">
            <Furigana text="気づいたことを家族と話して、部屋の備えにつなげよう。" adult="気づいたことを、次の備えにつなげましょう。" />
          </p>
        </div>

        {audience === "adult" && <div className="flex items-center gap-2 rounded-field bg-safe-soft p-3">
          <ShieldCheck2Icon className="size-4 shrink-0" />
          <p className="text-11 font-semibold text-ink-muted">
            <Furigana text="X・LINEに、部屋の予想図とリザルトの2枚を共有できます。" />
          </p>
        </div>}

        <div className="flex flex-col gap-2.5">
          <SocialImageShare platform="LINE" room={roomFile} result={resultFile} text={shareText} url={shareUrl()} />
          {audience === "adult" && <SocialImageShare platform="X" room={roomFile} result={resultFile} text={shareText} url={shareUrl()} />}
          <Button size="md" variant="outline" onClick={download} disabled={saving}>
            <Furigana text={saving ? "作成中[さくせいちゅう]..." : "結果サマリーを画像で保存"} />
          </Button>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/result")}>戻る</Button>
          <Button onClick={() => router.push("/evac")}>フェーズ2へ</Button>
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mx-auto p-2 font-display text-sm font-bold text-primary-ink underline underline-offset-2"
        >
          <Furigana text="ホームにもどる" />
        </button>
      </div>

      {/* 書き出し用。画面には出さない */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      <DisclaimerFooter />
    </div>
  );
}
