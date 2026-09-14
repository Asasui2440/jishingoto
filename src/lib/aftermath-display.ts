import type { Aftermath } from "./api";

export const MOCK_AFTERMATH = "/illustrations/aftermath-sample-v3.png";
export const MOCK_NOTE = "生成できなかったためサンプルを表示しています。あなたの部屋を再現した画像ではありません。";
export const MOCK_NOTE_CHILD = "これはサンプルの予想図だよ。あなたの部屋を再現した画像ではないよ。";

/** 表示と保存で同じ代替画像を使い、生成成功とは区別する。 */
export function aftermathDisplay(result: Aftermath) {
  const mock = result.source !== "ai" || !result.imageUrl;
  return { mock, imageUrl: mock ? MOCK_AFTERMATH : result.imageUrl! };
}
