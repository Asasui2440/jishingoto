"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import heroRoom from "@/../public/figma/img/hero-room.jpg";
import { ArrowRightIcon, CameraBlueIcon, LogoCircleXIcon, ShieldCheckIcon } from "@/components/icons";
import { SettingsSheet } from "@/components/SettingsSheet";
import { IconChip } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { useSession } from "@/lib/session";

const INFO = [
  {
    Icon: CameraBlueIcon,
    bg: "var(--color-primary-soft)",
    fg: "var(--color-primary-ink)",
    title: "部屋[へや]の写真[しゃしん]を撮[と]って、安全[あんぜん]をチェックするよ",
    body: "AI（人工知能[じんこうちのう]）が、危[あぶ]ないところを自動[じどう]で見[み]つけるよ",
  },
  {
    Icon: ShieldCheckIcon,
    bg: "var(--color-safe-soft)",
    fg: "var(--color-safe)",
    title: "写真[しゃしん]はすぐ消[け]せるから安心[あんしん]してね",
    body: "個人情報[こじんじょうほう]や位置情報[いちじょうほう]はアプリの外[そと]に送信[そうしん]されないよ",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { reset } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const start = () => {
    reset();
    router.push("/camera");
  };

  return (
    <Screen>
      <main className="flex flex-1 flex-col gap-5 px-6 pt-2 pb-6">
        <header className="flex flex-col items-center gap-2.5">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-primary-soft">
              <LogoCircleXIcon className="size-6 text-primary-ink" />
            </span>
            <p className="font-display text-40 leading-none font-black text-accent">
              ジシンゴト
            </p>
          </div>
          <p className="font-display text-base font-bold text-ink">地震＋自分事</p>
        </header>

        <div className="relative h-[210px] w-full overflow-hidden rounded-panel shadow-[0_10px_24px_-8px_rgba(0,0,0,0.07)]">
          <Image
            src={heroRoom}
            alt="部屋の家具を固定している子どものイラスト"
            fill
            priority
            sizes="402px"
            className="object-cover"
          />
          <span aria-hidden className="absolute inset-0 bg-white/[0.18]" />
        </div>

        <h1 className="text-center font-display text-28 leading-[1.3] font-extrabold text-ink">
          <Furigana text="自分[じぶん]の部屋[へや]の安全[あんぜん]、確[たし]かめよう" />
        </h1>

        <Button onClick={start}>
          <ArrowRightIcon className="size-5 text-ink" />
          <Furigana text="体験[たいけん]を始[はじ]める" />
        </Button>

        <Card className="flex flex-col gap-3 p-[18px]">
          {INFO.map(({ Icon, bg, fg, title, body }) => (
            <div key={title} className="flex items-center gap-3">
              <IconChip bg={bg}>
                <Icon className="size-5" style={{ color: fg }} />
              </IconChip>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-ink">
                  <Furigana text={title} />
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  <Furigana text={body} />
                </p>
              </div>
            </div>
          ))}
        </Card>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="mx-auto font-display text-13 font-bold text-ink-soft underline underline-offset-2"
        >
          ふりがな・文字の大きさをかえる
        </button>
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}
