"use client";

import { createAftermathShareFile } from "@/lib/aftermath-share";
import { useEffect, useState } from "react";
import { prepareAftermath } from "@/lib/room-preparation";
import type { Risk } from "@/lib/content";
import { Button } from "@/components/ui/Button";


export function AftermathShare({ photoUrl, risks }: { photoUrl: string | null; risks: Risk[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState("予想図を準備しています…");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    void prepareAftermath(photoUrl, risks).then(async result => {
      if (!alive) return;
      if (result.source !== "ai" || !result.imageUrl) {
        setStatus("共有できるAI予想図がありません。写真から予想図を作成できた場合に表示します。");
        return;
      }
      const next = await createAftermathShareFile(result.imageUrl);
      if (!alive) return;
      objectUrl = URL.createObjectURL(next);
      setPreview(objectUrl);
      setFile(next);
      setStatus("");
    }).catch(() => { if (alive) setStatus("予想図を準備できませんでした。もう一度画面を開いてください。"); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoUrl, risks]);

  const save = () => {
    if (!preview) return;
    const link = document.createElement("a");
    link.href = preview;
    link.download = "jishingoto-ai-room.png";
    link.click();
    setStatus("画像の保存を開始しました。保存後、SNSの投稿画面で添付できます。");
  };
  const share = async () => {
    if (!file) return;
    if (!navigator.canShare?.({ files: [file] })) { save(); return; }
    setBusy(true);
    try {
      await navigator.share({ files: [file], title: "地震後の部屋の予想図", text: "AIによる予想図です。実際の被害写真ではありません。 #ジシンゴト" });
      setStatus("共有メニューでの操作を終了しました。");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("共有メニューを開けませんでした。「予想図を保存」から画像を添付できます。");
    } finally { setBusy(false); }
  };
  return <section className="mt-4 space-y-3 border-t border-border pt-4" aria-label="予想図の共有">
    <h2 className="text-lg font-bold">この部屋の地震後の予想図</h2>
    {preview && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="AIによる地震後の部屋の予想図。実際の被害写真ではありません" className="h-auto w-full rounded-field" />
      <p className="text-sm leading-relaxed">公開前に、顔・名前・住所などが残っていないか確認してください。</p>
      <div className="grid grid-cols-2 gap-2"><Button size="md" onClick={() => void share()} disabled={busy}>予想図を共有</Button><Button size="md" variant="outline" onClick={save} disabled={busy}>予想図を保存</Button></div>
      <p className="text-xs text-ink-muted">画像共有に対応していない端末では、保存した画像をSNSに添付できます。</p>
    </>}
    {status && <p role="status" className="text-sm leading-relaxed text-ink-muted">{status}</p>}
  </section>;
}
