"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";
import { setRoomTestOptions } from "@/lib/room-test";

export default function DemoPage() {
  const router = useRouter();
  const { reset, update } = useSession();
  return <main className="flex min-h-dvh flex-col gap-5 p-6">
    <h1 className="text-xl font-bold">サンプルで最後まで体験</h1>
    <p>写真・危険候補・設問・避難ルートを用意しています。APIキーやカメラがなくても、最後のふりかえりまで進めます。</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/figma/img/room-risk.jpg" alt="体験に使うサンプルの部屋" className="aspect-[4/3] w-full rounded-panel object-cover" />
    <p className="text-13 text-ink-muted">サンプルの想定シナリオです。写真の確認 → 危険候補の確認 → 行動クイズ → 結果・シェア → 避難ルート → 最後のふりかえり、と進みます。AIへの写真送信はありません。</p>
    <Button onClick={() => {
      reset();
      setRoomTestOptions({ mode: "fixture", analysisMs: 0, imageMs: 0 });
      update({ photoUrl: "/figma/img/room-risk.jpg", analysisSource: "demo", startedAt: Date.now() });
      router.push("/privacy");
    }}>サンプル体験を始める</Button>
    <div className="flex flex-wrap gap-4 text-13 text-primary-ink underline">
      <a href="/figma/img/room-risk.jpg" download="sample-room.jpg">サンプル写真を保存</a>
      <a href="/demo/room.json" download>サンプルデータを保存</a>
    </div>
  </main>;
}
