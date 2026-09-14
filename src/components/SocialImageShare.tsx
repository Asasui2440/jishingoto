"use client";

import { Furigana } from "@/components/ui/Furigana";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { shareImages } from "@/lib/share-images";
import { socialTextUrl } from "@/lib/social-share";
import { downloadImage } from "@/lib/download-image";

export function SocialImageShare({ platform, file, text, url, includeImage = true }: { platform: "X" | "LINE"; file: File | null; text: string; url: string; includeImage?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState(false);
  const ready = !includeImage || !!file;
  const textUrl = socialTextUrl(platform, text, url);
  const share = async () => {
    if (!includeImage) { window.open(textUrl, "_blank", "noopener,noreferrer"); return; }
    if (!file) return;
    setBusy(true);
    setStatus("");
    setFallback(false);
    try {
      const outcome = await shareImages([file], `${text}\n${url}`);
      if (outcome === "unsupported") { setFallback(true); setStatus("この端末では画像を直接添付できません。予想図を保存し、点数とリンクの共有画面で添付してください。"); }
      if (outcome === "shared") setStatus(`共有メニューでの操作を終了しました。内容は${platform}で確認してください。`);
    } catch {
      setFallback(true); setStatus("画像を直接共有できませんでした。予想図を保存し、点数とリンクの共有画面で添付してください。");
    } finally { setBusy(false); }
  };
  return <section className="space-y-3" aria-label={`${includeImage ? "画像付きで" : "点数とリンクを"}${platform}に共有`}>
    <Button size="md" variant={platform === "X" ? "x" : "line"} onClick={() => void share()} disabled={!ready || busy}><Furigana text={busy ? "準備中…" : `${platform}で共有`} /></Button>
    {status && <p role="status" className="text-sm"><Furigana text={status} /></p>}
    {fallback && includeImage && file && <div className="flex flex-wrap gap-3 text-sm font-bold text-primary-ink">
      <button type="button" className="underline" onClick={() => downloadImage(file, file.name)}><Furigana text="予想図を保存" /></button>
      <a href={textUrl} target="_blank" rel="noopener noreferrer" className="underline"><Furigana text="点数とリンクの共有画面を開く" /></a>
    </div>}
  </section>;
}
