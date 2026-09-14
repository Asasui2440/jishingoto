"use client";

import { HeaderHomeLink } from "@/components/ui/PhaseOneNavigation";
import { SocialImageShare } from "@/components/SocialImageShare";
import { preparePredictionImage, resultImageError } from "@/lib/result-image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { XCircleDarkIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { getSession, scoreByAxis, useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import { APP_SHARE_URL, quizShareText } from "@/lib/social-share";

export default function SharePage() {
  const router = useRouter();
  const { audience } = useSettings();
  const { answers, risks, photoUrl, aftermathPhotoUrl } = useSession();
  const [includeImage, setIncludeImage] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const scores = useMemo(() => scoreByAxis(answers, risks), [answers, risks]);
  const exportInput = useMemo(() => ({ scores, audience, photoUrl, aftermathPhotoUrl, risks, attempt }), [scores, audience, photoUrl, aftermathPhotoUrl, risks, attempt]);
  const [rendered, setRendered] = useState<{ input: typeof exportInput; predictionFile: File | null; predictionUrl: string | null; error: string } | null>(null);
  const current = rendered?.input === exportInput ? rendered : null;
  const mock = current?.predictionFile?.name === "jishingoto-sample-room.png";
  const imageShareText = quizShareText(scores, includeImage && mock);
  const error = current?.error ?? "";

  useEffect(() => {
    if (!getSession().finishedAt) router.replace("/");
  }, [router]);

  useEffect(() => {
    if (!includeImage) return;
    let alive = true;
    let predictionUrl: string | null = null;
    const { photoUrl, aftermathPhotoUrl, risks, attempt } = exportInput;
    void (async () => {
      const photo = aftermathPhotoUrl ?? photoUrl;
      const confirmed = aftermathPhotoUrl ? [] : risks.filter(r => r.confirmed);
      const predictionFile = await preparePredictionImage(photo, confirmed, attempt > 0);
      if (!alive) return;
      predictionUrl = URL.createObjectURL(predictionFile);
      setRendered({ input: exportInput, predictionFile, predictionUrl, error: "" });
    })().catch(error => { if (alive) setRendered({ input: exportInput, predictionFile: null, predictionUrl: null, error: resultImageError(error).message }); });
    return () => { alive = false; if (predictionUrl) URL.revokeObjectURL(predictionUrl); };
  }, [exportInput, includeImage]);

  return (
    <div className="flex min-h-dvh flex-col">
      <div>
        <StatusBar />
        <div className="flex items-center justify-between px-6 pt-3">
          <h1 className="min-w-0 flex-1 font-display text-lg font-bold text-ink">
            <Furigana text="結果を共有" />
          </h1>
          <button type="button" onClick={() => router.push("/result")} aria-label={audience === "adult" ? "閉じる" : "とじる"} className="grid size-11 shrink-0 place-items-center">
            <XCircleDarkIcon className="size-6 text-ink" />
          </button>
          <HeaderHomeLink />
        </div>
      </div>

      <div className="animate-rise flex flex-col gap-4 px-6 pt-3 pb-6">
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-lg font-bold text-ink"><Furigana text={audience === "adult" ? "SNSでの共有" : "結果を共有"} /></h2>
          <div className="rounded-field bg-surface p-4">
            <p className="mb-2 text-sm font-bold"><Furigana text="共有する内容" /></p>
            <p className="whitespace-pre-line text-base leading-relaxed">{imageShareText}</p>
            <a href={APP_SHARE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-sm text-primary-ink underline">{APP_SHARE_URL}</a>
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-field border border-border bg-surface p-3">
            <input type="checkbox" checked={includeImage} onChange={event => setIncludeImage(event.target.checked)} className="size-5 accent-cyan-700" />
            <span className="text-base font-bold"><Furigana text="予想図も共有する" /></span>
          </label>
          {includeImage && (current?.predictionUrl ? <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.predictionUrl} alt={mock ? "共有するサンプルの予想図" : "共有する地震後の予想図"} className="mx-auto h-auto w-[88%] rounded-field" />
          </figure> : <p role="status" className="text-sm"><Furigana text={error || "共有する予想図を準備しているよ。点数とリンクだけなら、チェックを外して共有できるよ。"} /></p>)}
          {includeImage && error && <Button variant="outline" size="sm" onClick={() => setAttempt(n => n + 1)}><Furigana text="もう一度試す" /></Button>}
          <SocialImageShare platform="LINE" file={current?.predictionFile ?? null} includeImage={includeImage} text={imageShareText} url={APP_SHARE_URL} />
          {audience === "adult" && <SocialImageShare platform="X" file={current?.predictionFile ?? null} includeImage={includeImage} text={imageShareText} url={APP_SHARE_URL} />}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/result")}><Furigana text={"戻る"} /></Button>
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


      <div className="mt-auto"><DisclaimerFooter /></div>
    </div>
  );
}
