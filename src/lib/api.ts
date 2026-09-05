/**
 * バックエンドとの境界。
 *
 * いまは全部モックだが、シグネチャは実装が入れ替わっても変わらない想定。
 * 実装が用意できたら、この中身を fetch に置き換えるだけで済むようにしている。
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

/**
 * 出題する設問を返す。
 *
 * 「あぶない」と確認した危険にひもづく設問を先に出し、
 * そのあとどの部屋でも共通の設問を出す。
 * こうすると、自分の部屋で見つけた場所がそのまま問題になる。
 */
export async function fetchQuestions(risks: Risk[]): Promise<Question[]> {
  await wait(200);
  const kinds = new Set(risks.filter((r) => r.confirmed).map((r) => r.kind));

  const forRisks = QUESTIONS.filter((q) => q.riskKind && kinds.has(q.riskKind));
  const common = QUESTIONS.filter((q) => !q.riskKind);

  // 危険をひとつも確認していないときは、危険ひもづきの設問も一通り出す
  const leading = forRisks.length > 0 ? forRisks : QUESTIONS.filter((q) => q.riskKind);
  return [...leading, ...common];
}

/**
 * 「もし地震がきたら、この部屋はどうなるか」の画像を作る。
 *
 * バックエンドで、撮影した部屋の写真と確認済みの危険をもとに
 * AI に生成してもらう想定。返すのは画像の URL。
 *
 * いまはモックなので、元の写真をそのまま返して
 * 画面側で「何が倒れたか」のマーカーを重ねている。
 */
export type Aftermath = {
  /** 生成された画像。null ならモック（画面側は元の写真を使う） */
  imageUrl: string | null;
  /** 何が起きたかの短い説明。危険ごとに1つ */
  events: { riskId: string; text: string }[];
};

const AFTERMATH_TEXT: Record<Risk["kind"], string> = {
  fall: "たおれて、逃[に]げ道[みち]をふさいだ",
  break: "われて、床[ゆか]にガラスが散[ち]らばった",
  block: "まわりのモノがくずれて、通[とお]れなくなった",
};

export async function generateAftermath(
  _photo: string | null,
  risks: Risk[],
): Promise<Aftermath> {
  await wait(1400);
  return {
    imageUrl: null,
    events: risks
      .filter((r) => r.confirmed)
      .map((r) => ({ riskId: r.id, text: `${r.name}が${AFTERMATH_TEXT[r.kind]}` })),
  };
}
