"use client";

import { useRouter } from "next/navigation";
import { ArrowRightIcon, LogoCircleXIcon } from "@/components/icons";
import { useSettings, type Audience } from "@/lib/settings";

export default function AudiencePage() {
  const router = useRouter();
  const settings = useSettings();

  const start = (audience: Audience) => {
    settings.update({ audience, ...(audience === "adult" ? { furigana: false } : {}) });
    router.push("/home");
  };

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-12 px-6 py-12">
      <header className="flex flex-col items-center gap-4">
        <span className="grid size-20 place-items-center rounded-full bg-primary-soft">
          <LogoCircleXIcon className="size-9 text-primary-ink" />
        </span>
        <p className="font-display text-40 font-black leading-none text-primary-ink">ジシンゴト！</p>
        <p className="text-sm font-bold text-ink-muted">地震＋自分事</p>
      </header>
        <section aria-labelledby="audience-heading" className="flex flex-col gap-4">
          <div className="text-center">
            <p className="mb-2 text-sm font-bold text-primary-ink">じぶんの「もしも」を、ためしてみよう</p>
            <h1 id="audience-heading" className="font-display text-28 font-extrabold text-ink">どちらではじめる？</h1>
            <p className="mt-2 text-sm text-ink-muted">あなたにあわせたことばで、ゲームがはじまるよ。</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => start("child")}
              className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-panel border-2 border-primary bg-primary-soft px-3 py-5 text-ink transition-colors hover:bg-primary/30 active:bg-primary/50"
            >
              <span className="text-xs font-bold text-primary-ink">こども</span>
              <span className="font-display text-28 font-extrabold">子供</span>
              <span className="flex items-center gap-1 text-sm font-bold">はじめる<ArrowRightIcon className="size-4 [&_path]:stroke-current" /></span>
            </button>
            <button
              type="button"
              onClick={() => start("adult")}
              className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-panel border-2 border-[#9fc9df] bg-glass-soft px-3 py-5 text-ink transition-colors hover:border-glass hover:bg-[#d5eaf7] active:bg-[#c4e1f3]"
            >
              <span className="text-xs font-bold text-ink-muted">おとな</span>
              <span className="font-display text-28 font-extrabold">大人</span>
              <span className="flex items-center gap-1 text-sm font-bold">はじめる<ArrowRightIcon className="size-4 [&_path]:stroke-current" /></span>
            </button>
          </div>
          <p className="text-center text-xs text-ink-muted">えらぶと、ゲームのホーム画面にすすみます</p>
        </section>

    </main>
  );
}
