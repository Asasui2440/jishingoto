"use client";
import { upperElementaryText } from "./reading-level";
import { adultText, plain } from "./adult-copy";
import type { Audience } from "./settings";
import { AXIS_LABEL, type Axis } from "./content";
import { MOCK_NOTE, MOCK_NOTE_CHILD } from "./aftermath-display";

/** 4項目を同じ落ち着いた色で表示する。画面と保存PNGで共有する。 */
const SCORE_COLOR = { background: "#ffffff", bar: "#ffcf3f" };
export const AXIS_COLORS: Record<Axis, { background: string; bar: string }> = {
  initial: SCORE_COLOR,
  judgement: SCORE_COLOR,
  room: SCORE_COLOR,
  evacuation: SCORE_COLOR,
};

export type ShareRow = { label: string; score: number | null };
export const SUMMARY_COPY = {
  title: "あなたの防災4つのチカラ",
  description: "選んだ行動を振り返り、次の備えにつなげよう。",
  adultDescription: "今回の判断を振り返り、次の備えにつなげましょう。",
  prediction: "震度6の地震後の予想図",
  note: "震度6強・固定不明の家具は未固定を想定したAIの一例です。実際の被害とは限りません。",
  childNote: "震度6強で、固定が見えない家具は固定していないとしたAIの一例だよ。この通りとは限らないよ。",
};

/** 未出題の項目も、画面と同じく「今回はなし／対象なし」で表示する。 */
export function axisRows(scores: Record<Axis, number | null>): ShareRow[] {
  return (["initial", "judgement", "room", "evacuation"] as Axis[]).map(a => ({ label: AXIS_LABEL[a], score: scores[a] }));
}

/** リザルトのまとめ画面と同じ順序・バー・予想図で、1枚のPNGを作る。 */
export async function createResultSummaryFile({ rows, audience, imageUrl, mock = false, comparisonUnavailable = false }: { rows: ShareRow[]; audience: Audience; imageUrl: string; mock?: boolean; comparisonUnavailable?: boolean }): Promise<File> {
  await document.fonts.ready;
  const image = new Image();
  image.src = imageUrl;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("prediction unavailable");
  const canvas = document.createElement("canvas");
  const w = 1080, pictureW = 968;
  const predictionY = 260, pictureY = predictionY + 216;
  const pictureH = Math.round(pictureW * image.naturalHeight / image.naturalWidth);
  const summaryY = pictureY + pictureH + 64;
  canvas.width = w;
  canvas.height = summaryY + 660;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const copy = (value: string) => audience === "adult" ? adultText(value) : plain(upperElementaryText(value));
  const rect = (x: number, y: number, width: number, height: number, radius: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  };
  const text = (value: string, x: number, y: number, size = 30, color = "#182d3b", weight = 700) => {
    ctx.font = `${weight} ${size}px "Noto Sans JP", system-ui, sans-serif`;
    ctx.fillStyle = color; ctx.fillText(copy(value), x, y);
  };
  ctx.fillStyle = "#f8f7f0"; ctx.fillRect(0, 0, w, canvas.height);
  rect(40, 28, 250, 60, 28, "#fff3c8");
  text("ジシンゴト！", 62, 68, 32, "#5d4612");
  text("防災シミュレーション結果", 284, 70, 40);
  text("今回のまとめ", 48, 156, 36, "#5d4612");
  rect(48, 202, 984, 18, 9, "#ffcf3f");
  rect(16, predictionY, 1048, pictureY + pictureH + 24 - predictionY, 44, "#ffffff");
  text(mock ? "地震後の部屋の予想図（サンプル）" : SUMMARY_COPY.prediction, 56, predictionY + 60, 34);
  rect(16, predictionY + 90, 1048, 90, 0, "#e4eff7");
  const note = copy(mock ? audience === "adult" ? MOCK_NOTE : MOCK_NOTE_CHILD : audience === "adult" ? SUMMARY_COPY.note : SUMMARY_COPY.childNote);
  ctx.font = `700 23px "Noto Sans JP", system-ui, sans-serif`;
  ctx.fillStyle = "#405868";
  let noteLine = "", noteY = predictionY + 124;
  for (const character of note) {
    if (noteLine && ctx.measureText(noteLine + character).width > 1016) {
      ctx.fillText(noteLine, 32, noteY); noteY += 30; noteLine = "";
    }
    noteLine += character;
  }
  ctx.fillText(noteLine, 32, noteY);
  if (!mock && comparisonUnavailable) text("元写真との自動比較は未完了です。部屋の形や家具を確認してください。", 32, predictionY + 199, 21, "#405868");
  ctx.save(); ctx.beginPath(); ctx.roundRect(56, pictureY, pictureW, pictureH, 32); ctx.clip();
  ctx.drawImage(image, 56, pictureY, pictureW, pictureH); ctx.restore();
  rect(48, summaryY, 984, 620, 48, "#ffffff");
  text(SUMMARY_COPY.title, 88, summaryY + 70, 34);
  text(audience === "adult" ? SUMMARY_COPY.adultDescription : SUMMARY_COPY.description, 88, summaryY + 126, 28, "#405868", 400);
  // 白い4項目の間を、ページ背景と同じ色の細線で区切る。
  ctx.strokeStyle = "#f8f7f0"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(540, summaryY + 166); ctx.lineTo(540, summaryY + 578);
  ctx.moveTo(88, summaryY + 372); ctx.lineTo(992, summaryY + 372);
  ctx.stroke();
  const colors = Object.values(AXIS_COLORS);
  rows.forEach((row, i) => {
    const x = 88 + (i % 2) * 464, y = summaryY + 166 + Math.floor(i / 2) * 216;
    const color = colors[i % colors.length];
    rect(x, y, 440, 196, 16, color.background);
    text(row.label, x + 24, y + 42, 28, "#405868");
    text(row.score === null ? "—" : `${row.score}/5`, x + 24, y + 114, 56);
    if (row.score === null) text(audience === "adult" ? "対象なし" : "今回はなし", x + 112, y + 112, 25, "#526775", 400);
    rect(x + 24, y + 156, 392, 12, 6, "#d8e2df");
    if (row.score !== null && row.score > 0) rect(x + 24, y + 156, 392 * Math.max(0, Math.min(5, row.score)) / 5, 12, 6, color.bar);
  });
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("export failed")), "image/png"));
  return new File([blob], mock ? "jishingoto-result-sample.png" : "jishingoto-result-and-room.png", { type: "image/png" });
}
