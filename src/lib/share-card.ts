"use client";
import { upperElementaryText } from "./reading-level";
import { adultText, plain } from "./adult-copy";
import type { Audience } from "./settings";
import { AXIS_LABEL, type Axis } from "./content";
import { MOCK_NOTE, MOCK_NOTE_CHILD } from "./aftermath-display";

export type ShareRow = { label: string; score: number | null };
export const SUMMARY_COPY = {
  title: "あなたの防災4つのチカラ",
  description: "選んだ行動を振り返り、次の備えにつなげよう。",
  adultDescription: "今回の判断を振り返り、次の備えにつなげましょう。",
  prediction: "地震後の部屋の予想図",
  note: "写真をもとにAIが描いた想像図です。実際の被害を断定するものではありません。",
  childNote: "写真をもとにAIが考えた予想図だよ。本当にこの通りになるとは限らないよ。",
};

/** 未出題の項目も、画面と同じく「今回はなし／対象なし」で表示する。 */
export function axisRows(scores: Record<Axis, number | null>): ShareRow[] {
  return (["initial", "judgement", "room", "evacuation"] as Axis[]).map(a => ({ label: AXIS_LABEL[a], score: scores[a] }));
}

/** リザルトのまとめ画面と同じ順序・バー・予想図で、1枚のPNGを作る。 */
export async function createResultSummaryFile({ rows, audience, imageUrl, mock = false }: { rows: ShareRow[]; audience: Audience; imageUrl: string; mock?: boolean }): Promise<File> {
  await document.fonts.ready;
  const image = new Image();
  image.src = imageUrl;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("prediction unavailable");
  const canvas = document.createElement("canvas");
  const w = 1080, pictureW = 968;
  const pictureH = Math.round(pictureW * image.naturalHeight / image.naturalWidth);
  canvas.width = w;
  canvas.height = 920 + pictureH + 40;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const copy = (value: string) => audience === "adult" ? adultText(value) : plain(upperElementaryText(value));
  const rect = (x: number, y: number, width: number, height: number, radius: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  };
  const text = (value: string, x: number, y: number, size = 30, color = "#1a202c", weight = 700) => {
    ctx.font = `${weight} ${size}px "Noto Sans JP", system-ui, sans-serif`;
    ctx.fillStyle = color; ctx.fillText(copy(value), x, y);
  };
  ctx.fillStyle = "#f4f6f9"; ctx.fillRect(0, 0, w, canvas.height);
  rect(40, 28, 220, 60, 28, "#fff6d6");
  text("ジシンゴト", 62, 68, 32, "#8a5a00");
  text("防災シミュレーション結果", 284, 70, 40);
  text("今回のまとめ", 48, 156, 36, "#8a5a00");
  rect(48, 202, 984, 18, 9, "#ffcc00");
  rect(48, 260, 984, 446, 48, "#ffffff");
  text(SUMMARY_COPY.title, 88, 330, 34);
  text(audience === "adult" ? SUMMARY_COPY.adultDescription : SUMMARY_COPY.description, 88, 386, 28, "#4a5568", 400);
  rows.forEach((row, i) => {
    const y = 455 + i * 66;
    text(row.label, 88, y, 28, "#4a5568");
    rect(342, y - 22, 500, 20, 10, "#f4f6f9");
    if (row.score !== null && row.score > 0) rect(342, y - 22, 500 * Math.max(0, Math.min(5, row.score)) / 5, 20, 10, "#ffcc00");
    text(row.score === null ? audience === "adult" ? "対象なし" : "今回はなし" : `${row.score}/5`, 866, y, 25, row.score === null ? "#718096" : "#8a5a00");
  });
  rect(16, 746, 1048, canvas.height - 762, 44, "#ffffff");
  text(mock ? "地震後の部屋の予想図（サンプル）" : SUMMARY_COPY.prediction, 56, 806, 34);
  rect(16, 836, 1048, 64, 0, "#f4f6f9");
  text(mock ? audience === "adult" ? MOCK_NOTE : MOCK_NOTE_CHILD : audience === "adult" ? SUMMARY_COPY.note : SUMMARY_COPY.childNote, 32, 876, mock ? 21 : 23, "#4a5568");
  ctx.save(); ctx.beginPath(); ctx.roundRect(56, 920, pictureW, pictureH, 32); ctx.clip();
  ctx.drawImage(image, 56, 920, pictureW, pictureH); ctx.restore();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("export failed")), "image/png"));
  return new File([blob], mock ? "jishingoto-result-sample.png" : "jishingoto-result-and-room.png", { type: "image/png" });
}
