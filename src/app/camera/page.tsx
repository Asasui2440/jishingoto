"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import roomCamera from "@/../public/figma/img/room-camera.jpg";
import {
  AlertOctagonIcon,
  CameraWhiteIcon,
  CheckCheckIcon,
  XCircleRedIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter } from "@/components/ui/Screen";
import { preparePhoto, useCamera } from "@/lib/camera";
import { detectBlurRegions } from "@/lib/api";
import { useHaptics } from "@/lib/settings";
import { useSession } from "@/lib/session";

const GUIDES = [
  { n: "1", bg: "var(--color-primary-soft)", fg: "var(--color-primary-ink)", text: "部屋[へや]ぜんたいがうつるようにしよう" },
  { n: "2", bg: "var(--color-safe-soft)", fg: "var(--color-safe)", text: "ドアや出入[でい]り口[ぐち]もいれてね" },
  { n: "3", bg: "var(--color-warn-soft)", fg: "var(--color-warn)", text: "背[せ]の高[たか]い家具[かぐ]もわすれずに！" },
];

export default function CameraGuidePage() {
  const router = useRouter();
  const { update } = useSession();
  const vibrate = useHaptics();
  const { videoRef, state, start, capture } = useCamera();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void start();
  }, [start]);

  // カメラが使えないときはサンプル写真で先に進める
  const usingFallback = state === "denied" || state === "unavailable";

  const proceed = async (photoUrl: string | null, photo?: Blob) => {
    setBusy(true);
    vibrate([10, 40, 10]);
    const blurRegions = await detectBlurRegions(photo);
    update({ photoUrl, blurRegions, startedAt: Date.now() });
    router.push("/privacy");
  };

  const onShoot = async () => {
    if (busy) return;
    const shot = await capture();
    void proceed(shot?.url ?? null, shot?.blob);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void proceed(await preparePhoto(file), file);
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-ink">
      <div>
        <div className="flex items-center gap-2 bg-danger-soft px-4 py-3">
          <AlertOctagonIcon className="size-[18px] shrink-0" />
          <p className="font-display text-13 font-bold text-danger">
            <Furigana text="人[ひと]やじゅうしょ（郵便物[ゆうびんぶつ]など）がうつらないようにしよう" />
          </p>
        </div>
      </div>

      <div className="h-[330px] px-5">
        <div className="relative h-full w-full overflow-hidden rounded-panel bg-black">
          {usingFallback ? (
            <Image
              src={roomCamera}
              alt="部屋のサンプル写真"
              fill
              sizes="362px"
              className="object-cover"
              priority
            />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="size-full object-cover"
            />
          )}

          <div className="absolute inset-0 flex flex-col items-start gap-3 p-4">
            {GUIDES.map((g) => (
              <div
                key={g.n}
                className="flex items-center gap-2 rounded-tile bg-white/90 px-3.5 py-2.5 shadow-[0_4px_8px_rgba(0,0,0,0.16)] backdrop-blur-sm"
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-xl font-display text-sm font-bold"
                  style={{ background: g.bg, color: g.fg }}
                >
                  {g.n}
                </span>
                <p className="font-display text-13 font-bold text-ink">
                  <Furigana text={g.text} />
                </p>
              </div>
            ))}
          </div>

          {usingFallback ? (
            <p className="absolute right-3 bottom-3 rounded-full bg-black/65 px-3 py-1.5 text-11 text-white"><Furigana text="カメラが使えないので サンプル写真" /></p>
          ) : null}
        </div>
      </div>

      <div className="flex justify-center gap-4 px-6">
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="grid size-[72px] place-items-center rounded-tile border-[3px] border-safe bg-white/15">
            <CheckCheckIcon className="size-10" />
          </div>
          <p className="font-display text-xs font-bold text-safe">
            <Furigana text="ひろく撮[と]る (OK)" />
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="grid size-[72px] place-items-center rounded-tile border-2 border-danger bg-white/5">
            <XCircleRedIcon className="size-10" />
          </div>
          <p className="font-display text-xs font-bold text-ink-faint">
            <Furigana text="ちかすぎる (ダメ)" />
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 pb-5">
        <button type="button" onClick={() => router.push("/test-room")} className="min-h-11 text-sm text-white underline">APIを使わずテストする</button>
        {usingFallback ? (
          <>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              <CameraWhiteIcon className="size-5 text-ink" />
              <Furigana text="写真[しゃしん]をえらぶ" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPick}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => void proceed(null)}
              className="font-display text-sm font-bold text-white underline underline-offset-2"
            >
              <Furigana text="サンプルの部屋[へや]ですすむ" />
            </button>
          </>
        ) : (
          <>
            <Button onClick={onShoot} disabled={busy || state !== "live"}>
              <CameraWhiteIcon className="size-5 text-ink" />
              <Furigana text="さつえいする" />
            </Button>
            <button
              type="button"
              onClick={() => router.back()}
              className="font-display text-sm font-bold text-white underline underline-offset-2"
            >
              <Furigana text="もういちどやり直[なお]す" />
            </button>
          </>
        )}
      </div>

      <DisclaimerFooter />
    </div>
  );
}
