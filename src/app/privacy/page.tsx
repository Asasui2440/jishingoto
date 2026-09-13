"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import roomDesk from "@/../public/figma/img/room-desk.jpg";
import {
  CheckCircleWhiteIcon,
  EyeOffIcon,
  MousePointerIcon,
  RefreshCwIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { TitleBlock } from "@/components/ui/Bits";
import { useHaptics, useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { applyPrivacyMasks } from "@/lib/camera";
import { prepareMaskedRoom } from "@/lib/room-preparation";
import { setRoomTestOptions } from "@/lib/room-test";

/** 新しく足すぼかしの大きさ（％） */
const NEW_BLUR = { w: 22, h: 18 };

export default function PrivacyBlurPage() {
  const { audience } = useSettings();
  const router = useRouter();
  const { photoUrl, blurRegions, update } = useSession();
  const vibrate = useHaptics();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  /** 写真をタップした位置にぼかしを足す */
  const addBlur = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    vibrate();
    // ひとつ前の値から作る（続けてタップしたとき取りこぼさないように）
    update((prev) => ({
      ...prev,
      blurRegions: [
        ...prev.blurRegions,
        {
          id: `u${Date.now()}`,
          x: Math.max(0, x - NEW_BLUR.w / 2),
          y: Math.max(0, y - NEW_BLUR.h / 2),
          w: NEW_BLUR.w,
          h: NEW_BLUR.h,
          shape: "rect",
        },
      ],
    }));
  };

  const removeBlur = (id: string) => {
    vibrate();
    update((prev) => ({ ...prev, blurRegions: prev.blurRegions.filter((b) => b.id !== id) }));
  };

  const continueWithMaskedPhoto = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      setRoomTestOptions({ mode: "live", analysisMs: 0, imageMs: 0 });
      if (photoUrl) {
        const masked = await applyPrivacyMasks(photoUrl, blurRegions);
        update({ photoUrl: masked, blurRegions: [] });
        void prepareMaskedRoom(masked);
      }
      router.push("/analyzing");
    } catch {
      setError("画像を準備できませんでした。もう一度お試しください。");
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <StatusBar />
        <TitleBlock
          title="プライバシーの確認[かくにん]"
          lead="送信する前に、写真の内容を確認[かくにん]しよう。"
        />
      </div>

      <div className="px-5">
        <div
          ref={canvasRef}
          onClick={addBlur}
          className="relative w-full cursor-crosshair overflow-hidden rounded-panel bg-ink"
        >
          {photoUrl ? (
            // 撮影した写真は data URL なので next/image の最適化は通さない
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="撮影した部屋の写真" className="block h-auto w-full" />
          ) : (
            <Image src={roomDesk} alt="部屋のサンプル写真" sizes="362px" className="h-auto w-full" />
          )}

          {blurRegions.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeBlur(b.id);
              }}
              aria-label={audience === "adult" ? "このマスクを削除する" : "このぼかしを消す"}
              className={[
                "absolute grid place-items-center border-2 border-white bg-primary/85 backdrop-blur-md",
                b.shape === "circle" ? "rounded-full" : "rounded-field",
              ].join(" ")}
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
            >
              <span className="flex flex-col items-center gap-0.5">
                <EyeOffIcon className="size-4 text-ink" />
                <span className="font-display text-11 font-bold text-ink">ぼかし済</span>
              </span>
            </button>
          ))}

          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-[20px] bg-black/70 px-3 py-1.5">
            <MousePointerIcon className="size-3.5 text-white" />
            <span className="text-11 text-white">
              <Furigana text="顔[かお]や住所[じゅうしょ]をタップして隠[かく]す" />
            </span>
          </div>
        </div>
      </div>

      <div className="mx-5 rounded-panel bg-primary-soft p-5">
        <p className="font-display text-lg font-bold text-ink">
          <Furigana text="アニメ風の地震後の予想図を生成できます" adult="アニメ風の地震後の予想図をSNSで共有できます" />
        </p>
        <p className="mt-3 text-base leading-relaxed text-ink">
          <Furigana text="顔や住所が写っていたら、タップして隠[かく]そう。もう一度タップすると元に戻せます。" adult="顔や住所が写っていたら、タップして隠してください。再度タップすると元に戻せます。" />
        </p>
        <p className="mt-3 text-base leading-relaxed">
          <Furigana text="隠[かく]すところがなければ、そのまま進めます。" />
        </p>
      </div>

      <div className="flex flex-col gap-3 px-6 pb-5">
        <p className="text-sm leading-relaxed text-ink-muted">
          <Furigana text="「OK」を押すと、隠[かく]した部分を除いた画像をOpenAIに送り、部屋の確認と予想図づくりに使います。" />
        </p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button disabled={busy} onClick={() => void continueWithMaskedPhoto()}>
          <CheckCircleWhiteIcon className="size-5 text-ink" /><Furigana text="OK、このまますすむ" /></Button>
        <Button variant="outline" onClick={() => router.push("/camera")}>
          <RefreshCwIcon className="size-5 text-primary-ink" />
          <Furigana text="写真[しゃしん]を選[えら]び直[なお]す" />
        </Button>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
