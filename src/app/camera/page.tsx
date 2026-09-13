"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import roomCamera from "@/../public/figma/img/room-camera.jpg";
import {
  AlertOctagonIcon,
  CameraWhiteIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
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
  const { videoRef, state, start, stop, capture } = useCamera();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"choose" | "camera">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "camera") void start();
  }, [start, mode]);

  // カメラが使えないときはサンプル写真で先に進める
  const usingFallback = state === "denied" || state === "unavailable";

  const proceed = async (photoUrl: string | null, photo?: Blob) => {
    setBusy(true);
    vibrate([10, 40, 10]);
    const blurRegions = await detectBlurRegions(photo);
    update({ photoUrl, blurRegions, checked: [], startedAt: Date.now() });
    router.push("/privacy");
  };

  const onShoot = async () => {
    if (busy) return;
    const shot = await capture();
    void proceed(shot?.url ?? null, shot?.blob);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await proceed(await preparePhoto(file), file);
    } catch {
      setError("写真[しゃしん]を読[よ]み込[こ]めませんでした。別[べつ]の写真[しゃしん]（JPEG・PNGなど）を選[えら]んでね。");
      setBusy(false);
    }
  };

  if (mode === "choose") return (
    <div className="flex min-h-dvh flex-col">
      <StatusBar />
      <main className="flex flex-1 flex-col justify-center gap-6 px-6 py-8">
        <h1 className="text-center font-display text-28 font-bold"><Furigana text="部屋の写真を用意しよう" adult="部屋の写真を用意する" /></h1>
        <Image src="/illustrations/actions/room-wide-v7.png" width={1536} height={1024} alt="床・出入口・背の高い家具まで広く入れた部屋のイラスト" className="h-auto w-full rounded-panel" priority />
        <div className="rounded-panel bg-primary-soft p-4 text-base leading-relaxed">
          <p className="font-bold"><Furigana text="部屋全体が入るように撮[と]ろう" adult="部屋全体を撮影してください" /></p>
          <p className="mt-2"><Furigana text="床から家具の上まで、部屋が広く写るようにしよう！" adult="床から家具の上まで、部屋を広く写しましょう。" /></p>
          <div className="mt-3 grid grid-cols-3 gap-2">{["床", "出入口", "家具の上"].map((label, i) => <div key={label} className="flex flex-col items-center gap-1 rounded-field bg-surface px-2 py-3 font-bold"><span className="grid size-7 place-items-center rounded-full bg-primary text-sm">{i + 1}</span><span>{label}</span></div>)}</div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => setMode("camera")} disabled={busy}><CameraWhiteIcon className="size-5" /><Furigana text="写真[しゃしん]を撮[と]る" /></Button>
          <Button variant="outline" size="md" className="max-w-44" onClick={() => fileRef.current?.click()} disabled={busy}><Furigana text="画像[がぞう]を選[えら]ぶ" /></Button>
          <input ref={fileRef} type="file" accept="image/*" aria-label="画像を選ぶ" onChange={onPick} disabled={busy} hidden />
        </div>
        {busy && <p role="status" className="text-center text-base">画像を準備しています…</p>}
        {error && <p role="alert" className="text-base text-danger"><Furigana text={error} /></p>}
        <button type="button" onClick={() => router.push("/")} className="min-h-11 text-sm underline">ホームへ戻る</button>
      </main>
      <DisclaimerFooter />
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-ink">
      <div>
        <StatusBar tone="light" />
        <div className="flex items-center gap-2 bg-primary-soft px-4 py-3">
          <AlertOctagonIcon className="size-[18px] shrink-0" />
          <p className="font-display text-13 font-bold text-primary-ink">
            <Furigana text="顔や住所が写った場合は、次の画面で隠せます" />
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

      <div className="flex flex-col items-center gap-4 px-6 pb-5">
        <button type="button" onClick={() => router.push("/test-room")} className="min-h-11 text-sm text-white underline">APIを使わずテストする</button>
        {!usingFallback ? (
          <Button onClick={onShoot} disabled={busy || state !== "live"}>
            <CameraWhiteIcon className="size-5 text-ink" />
            <Furigana text="撮影する" />
          </Button>
        ) : null}
        {busy ? <p role="status" className="text-sm text-white"><Furigana text="写真[しゃしん]を準備中[じゅんびちゅう]…" /></p> : null}
        {error ? <p role="alert" className="text-sm text-white"><Furigana text={error} /></p> : null}
        {usingFallback ? (
            <button
              type="button"
              onClick={() => void proceed(null)}
              disabled={busy}
              className="font-display text-sm font-bold text-white underline underline-offset-2"
            >
              <Furigana text="サンプルの部屋[へや]ですすむ" />
            </button>
        ) : null}
            <button
              type="button"
              onClick={() => { stop(); setMode("choose"); }}
              className="font-display text-sm font-bold text-white underline underline-offset-2"
            >
              <Furigana text="戻る" adult="戻る" />
            </button>
      </div>

      <DisclaimerFooter />
    </div>
  );
}
