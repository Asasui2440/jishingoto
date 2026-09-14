"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import heroRoom from "@/../public/figma/img/hero-room.jpg";
import { ArrowRightIcon, CameraBlueIcon, LogoCircleXIcon } from "@/components/icons";
import { SettingsSheet } from "@/components/SettingsSheet";
import { IconChip } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Furigana } from "@/components/ui/Furigana";
import { Screen } from "@/components/ui/Screen";
import { useSession } from "@/lib/session";
import { useSettings, type Audience } from "@/lib/settings";

type InfoItem = { Icon: typeof CameraBlueIcon; bg: string; fg: string; title: string; body: string };

const INFO = {
  child: [
    { Icon: CameraBlueIcon, bg: "var(--color-primary-soft)", fg: "var(--color-primary-ink)", title: "部屋の写真や動画から、地震[じしん]への備[そな]えを考えよう", body: "AIが見つけた気になる場所を確認[かくにん]し、行動をシミュレーション" },
  ],
  adult: [
    { Icon: CameraBlueIcon, bg: "var(--color-primary-soft)", fg: "var(--color-primary-ink)", title: "室内の写真や動画から地震時に気になる箇所を確認", body: "AIが家具の転倒やガラスの飛散などの可能性がある箇所を候補として示します" },
  ],
} satisfies Record<Audience, InfoItem[]>;

export default function OnboardingPage() {
  const router = useRouter();
  const { reset } = useSession();
  const settings = useSettings();
  const { audience } = settings;
  const adult = audience === "adult";
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
            <p className="font-display text-40 leading-none font-black text-accent">ジシンゴト</p>
          </div>
          <p className="font-display text-base font-bold text-ink"><Furigana text={"地震＋自分事"} /></p>
        </header>

        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-ink"><Furigana text={adult ? "大人向け" : "子供向け"} /></span>
          <Link href="/" className="py-2 font-bold text-ink-muted underline underline-offset-4">えらびなおす</Link>
        </div>

        <div className="relative h-[210px] w-full overflow-hidden rounded-panel shadow-[0_10px_24px_-8px_rgba(0,0,0,0.07)]">
          <Image src={heroRoom} alt="部屋の家具を固定して安全対策をする様子" fill priority sizes="402px" className="object-cover" />
          <span aria-hidden className="absolute inset-0 bg-white/[0.18]" />
        </div>

        <h1 className={`text-center text-balance font-display leading-[1.3] font-extrabold text-ink text-xl`}>
          <Furigana text="自分[じぶん]の部屋[へや]の安全[あんぜん]、確[たし]かめよう" adult="室内の地震リスクを確認" />
        </h1>

        <Button onClick={start}>
          <ArrowRightIcon className="size-5 text-ink" />
          <Furigana text="体験[たいけん]を始[はじ]める" adult="体験を始める" />
        </Button>

        <Button variant="outline" size="md" onClick={() => router.push("/evac")}>
          <Furigana text="避難経路をためす（フェーズ2）" adult="避難経路をシミュレーション（フェーズ2）" />
        </Button>

        <Card className="flex flex-col gap-3 p-[18px]">
          {INFO[audience].map(({ Icon, bg, fg, title, body }) => (
            <div key={title} className="flex items-center gap-3">
              <IconChip bg={bg}><Icon className="size-5" style={{ color: fg }} /></IconChip>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-ink"><Furigana text={title} /></p>
                <p className="mt-0.5 text-xs text-ink-muted"><Furigana text={body} /></p>
              </div>
            </div>
          ))}
        </Card>

        <button type="button" onClick={() => setSettingsOpen(true)} className="mx-auto font-display text-13 font-bold text-ink-soft underline underline-offset-2">
          <Furigana text={adult ? "表示・アクセシビリティ設定" : "ふりがな・文字の大きさをかえる"} />
        </button>
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}
