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
import { useSettings, type Audience } from "@/lib/settings";

type InfoItem = { Icon: typeof CameraBlueIcon; bg: string; fg: string; title: string; body: string };

const INFO = {
  child: [
    { Icon: CameraBlueIcon, bg: "var(--color-primary-soft)", fg: "var(--color-primary-ink)", title: "部屋[へや]の写真[しゃしん]を撮[と]って、安全[あんぜん]をチェックするよ", body: "AI（人工知能[じんこうちのう]）が、危[あぶ]ないところを自動[じどう]で見[み]つけるよ" },
    { Icon: ShieldCheckIcon, bg: "var(--color-safe-soft)", fg: "var(--color-safe)", title: "写真[しゃしん]はすぐ消[け]せるから安心[あんしん]してね", body: "ぼかした写真[しゃしん]だけを、解析[かいせき]と予想図[よそうず]のためOpenAI APIへ送[おく]るよ。端末[たんまつ]には保存[ほぞん]しないよ" },
  ],
  adult: [
    { Icon: CameraBlueIcon, bg: "var(--color-primary-soft)", fg: "var(--color-primary-ink)", title: "室内写真から地震時の危険箇所を確認", body: "AIが家具の転倒、ガラスの飛散、避難経路の閉塞などを検出します" },
    { Icon: ShieldCheckIcon, bg: "var(--color-safe-soft)", fg: "var(--color-safe)", title: "写真は端末に保存されず、いつでも削除可能", body: "マスク後の写真だけを解析と予想図作成のためOpenAI APIへ送信し、人物の特定や住所の読み取りは行いません" },
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
          <p className="font-display text-base font-bold text-ink">地震＋自分事</p>
        </header>

        <div role="radiogroup" aria-label="表示モード" className="grid grid-cols-2 gap-1 rounded-tile bg-border p-1">
          {([ ["child", "こども向け"], ["adult", "大人向け"] ] as const).map(([value, label]) => {
            const active = audience === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => settings.update({ audience: value, ...(value === "adult" ? { furigana: false } : {}) })}
                className={[
                  "min-h-10 rounded-field px-3 font-display text-sm font-bold transition-colors",
                  active ? "bg-surface text-ink shadow-sm" : "text-ink-soft",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative h-[210px] w-full overflow-hidden rounded-panel shadow-[0_10px_24px_-8px_rgba(0,0,0,0.07)]">
          <Image src={heroRoom} alt="部屋の家具を固定して安全対策をする様子" fill priority sizes="402px" className="object-cover" />
          <span aria-hidden className="absolute inset-0 bg-white/[0.18]" />
        </div>

        <h1 className="text-center font-display text-28 leading-[1.3] font-extrabold text-ink">
          {adult ? "室内の地震リスクを確認しましょう" : <Furigana text="自分[じぶん]の部屋[へや]の安全[あんぜん]、確[たし]かめよう" />}
        </h1>

        <ol aria-label="体験の流れ" className="grid grid-cols-2 gap-2 text-center text-13 font-bold text-primary-ink">
          <li className="rounded-field bg-primary-soft p-3"><span className="block text-11">フェーズ1</span><Furigana text="部屋[へや]での行動[こうどう]" /></li>
          <li className="rounded-field bg-primary-soft p-3"><span className="block text-11">フェーズ2</span><Furigana text="家[いえ]の外[そと]の避難[ひなん]" /></li>
        </ol>

        <Button onClick={start}>
          <ArrowRightIcon className="size-5 text-ink" />
          {adult ? "安全診断を始める" : <Furigana text="体験[たいけん]を始[はじ]める" />}
        </Button>

        <Button variant="outline" size="md" onClick={() => router.push("/evac?from=standalone")}>
          {adult ? "避難ルートから体験する（フェーズ2）" : <Furigana text="避難[ひなん]ルートから体験[たいけん]する（フェーズ2）" />}
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
          {adult ? "表示・アクセシビリティ設定" : "ふりがな・文字の大きさをかえる"}
        </button>
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}
