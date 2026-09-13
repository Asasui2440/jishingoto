"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { shareImages } from "@/lib/share-images";

export function SocialImageShare({ platform, room, result, text, url }: { platform: "X" | "LINE"; room: File | null; result: File | null; text: string; url: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const ready = !!room && !!result;
  const share = async () => {
    if (!room || !result) return;
    setBusy(true);
    setStatus("");
    try {
      const outcome = await shareImages([room, result], `${text}\n${url}`);
      if (outcome === "unsupported") setStatus("この端末では画像を直接共有できません。予想図と結果サマリーを保存して添付してください。");
      if (outcome === "shared") setStatus(`共有メニューでの操作を終了しました。内容は${platform}で確認してください。`);
    } catch {
      setStatus("画像を直接共有できませんでした。予想図と結果サマリーを保存して添付してください。");
    } finally { setBusy(false); }
  };
  return <section className="space-y-3" aria-label={`画像付きで${platform}に共有`}>
    <Button size="md" variant={platform === "X" ? "x" : "line"} onClick={() => void share()} disabled={!ready || busy}>{busy ? "準備中…" : `${platform}で共有`}</Button>
    {status && <p role="status" className="text-sm">{status}</p>}
  </section>;
}
