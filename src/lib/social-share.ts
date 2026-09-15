import type { Axis } from "./content";

export const APP_SHARE_URL = "https://jishingoto.vercel.app";

/** 新しい採点方式は作らず、リザルトと同じ行動クイズの3項目を載せる。 */
export function quizShareText(scores: Record<Axis, number | null>, mock = false) {
  const rows = ([ ["initial", "初動対応"], ["judgement", "判断力"], ["evacuation", "避難時の安全性"] ] as const)
    .filter(([axis]) => scores[axis] !== null)
    .map(([axis, label]) => `・${label}：${scores[axis]}/5点`);
  return ["「ジシンゴト！」 で部屋の安全をチェックしました！", "【行動クイズの結果】", ...rows, ...(rows.length ? [] : ["行動クイズ：未回答"]), ...(mock ? ["添付の予想図はサンプルです。自分の部屋の再現ではありません。"] : []), "#ジシンゴト"].join("\n");
}

export function socialTextUrl(platform: "X" | "LINE", text: string, appUrl: string) {
  const message = `${text}\n${appUrl}`;
  return platform === "X" ? `https://x.com/intent/tweet?text=${encodeURIComponent(message)}` : `https://line.me/R/share?text=${encodeURIComponent(message)}`;
}
