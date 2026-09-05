/**
 * バックエンドとの境界。
 *
 * いまは全部モックだが、シグネチャは実装が入れ替わっても変わらない想定。
 * 実装が用意できたら、この中身を fetch に差し替えるだけで済むようにしている。
 */
import { DETECTED_RISKS, QUESTIONS, type Question, type Risk } from "./content";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 撮影した写真から、ぼかすべき領域（顔・書類など）を返す */
export type BlurRegion = {
  id: string;
  /** ％指定。写真の左上が (0, 0) */
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "circle";
};

export async function detectBlurRegions(_photo?: Blob): Promise<BlurRegion[]> {
  await wait(600);
  return [
    { id: "b1", x: 18, y: 14, w: 20, h: 20, shape: "circle" },
    { id: "b2", x: 52, y: 62, w: 26, h: 15, shape: "rect" },
  ];
}

/** 部屋の写真を解析して、危険ポイントを返す */
export async function analyzeRoom(_photo?: Blob): Promise<Risk[]> {
  await wait(400);
  return DETECTED_RISKS.map((r) => ({ ...r }));
}

/** 確認済みの危険ポイントをもとに、出題する設問を返す */
export async function fetchQuestions(_risks: Risk[]): Promise<Question[]> {
  await wait(200);
  return QUESTIONS;
}
