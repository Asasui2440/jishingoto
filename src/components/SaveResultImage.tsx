"use client";
import { aftermathInput } from "@/lib/aftermath-plan";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { useSession, scoreByAxis } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import { axisRows } from "@/lib/share-card";
import { downloadImage } from "@/lib/download-image";
import { prepareResultImage, resultImageError } from "@/lib/result-image";
export function SaveResultImage() {
  const { answers, risks, photoUrl, aftermathPhotoUrl, roomViews } = useSession();
  const { audience } = useSettings();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const save = async () => {
    setBusy(true); setStatus("");
    try {
      const combined = await prepareResultImage({ ...aftermathInput({ photoUrl, aftermathPhotoUrl, roomViews, risks }), rows: axisRows(scoreByAxis(answers, risks)), audience, retry: true });
      downloadImage(combined, combined.name); setStatus("結果と予想図をまとめた画像の保存を開始しました。");
    } catch (error) { setStatus(resultImageError(error).message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}><Furigana text={busy ? "画像を作成中…" : "結果と予想図を1枚で保存"} /></Button>{status && <p role="status" className="text-sm"><Furigana text={status} /></p>}</div>;
}
