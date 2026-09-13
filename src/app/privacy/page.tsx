"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import roomDesk from "@/../public/figma/img/room-desk.jpg";
import {
  CheckCircleWhiteIcon,
  EyeOffIcon,
  MousePointerIcon,
  RefreshCwIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter } from "@/components/ui/Screen";
import { TitleBlock } from "@/components/ui/Bits";
import { useHaptics, useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { applyPrivacyMasks } from "@/lib/camera";
import { prepareRoom } from "@/lib/room-preparation";
import { setRoomTestOptions } from "@/lib/room-test";

/** 新しく足すぼかしの大きさ（％） */
const NEW_BLUR = { w: 22, h: 18 };

export default function PrivacyBlurPage() {
  const { audience } = useSettings();
  const router = useRouter();
  const { photoUrl, blurRegions, update } = useSession();
  const vibrate = useHaptics();
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
    setRoomTestOptions({ mode: "live", analysisMs: 0, imageMs: 0 });
    if (photoUrl) {
      const masked = await applyPrivacyMasks(photoUrl, blurRegions);
      update({ photoUrl: masked });
      void prepareRoom(masked);
    }
    router.push("/analyzing");
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between">
      <div>
        <TitleBlock
          title="プライバシーの確認[かくにん]"
          lead="顔[かお]や個人情報[こじんじょうほう]がうつっていないかチェックしよう！"
        />
      </div>

      <div className="h-[340px] px-5">
        <div
          ref={canvasRef}
          onClick={addBlur}
          className="relative h-full w-full cursor-crosshair overflow-hidden rounded-panel bg-ink"
        >
          {photoUrl ? (
            // 撮影した写真は data URL なので next/image の最適化は通さない
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="撮影した部屋の写真" className="size-full object-cover" />
          ) : (
            <Image src={roomDesk} alt="部屋のサンプル写真" fill sizes="362px" className="object-cover" />
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
              <Furigana text="タップして「ぼかし」を追加[ついか]・消去[しょうきょ]" />
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 text-center">
        <p className="font-display text-15 font-bold text-primary-ink">
          <Furigana text="「ぼかし」がちゃんと入[はい]っているかたしかめてね！" />
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          <Furigana text="かくしたい場所[ばしょ]をタップすると、じぶんで新[あたら]しくぼかすこともできるよ。" />
        </p>
        <p className="mt-2 text-11 text-ink-soft">
          <Furigana text="ぼかした画像[がぞう]だけを、解析[かいせき]と予想図[よそうず]の作成[さくせい]のためOpenAI APIへ送[おく]ります。端末[たんまつ]には保存[ほぞん]しません。" />
        </p>
      </div>

      <div className="flex flex-col gap-3 px-6 pb-5">
        <Button onClick={() => void continueWithMaskedPhoto()}>
          <CheckCircleWhiteIcon className="size-5 text-ink" /><Furigana text="OK、このまますすむ" /></Button>
        <Button variant="outline" onClick={() => router.push("/camera")}>
          <RefreshCwIcon className="size-5 text-primary-ink" />
          <Furigana text="もういちどさつえいする" />
        </Button>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
