import type { Risk } from "./content";
import { prepareAftermath } from "./room-preparation";
import { createResultSummaryFile, type ShareRow } from "./share-card";
import type { Audience } from "./settings";
import { aftermathDisplay } from "./aftermath-display";
import { createAftermathShareFile } from "./aftermath-share";

export async function preparePredictionImage(photo: string | null, risks: Risk[], retry = false) {
  const result = aftermathDisplay(await prepareAftermath(photo, risks, retry));
  return createAftermathShareFile(result.imageUrl, result.mock);
}

export class ResultImageError extends Error {
  constructor(public readonly kind: "missing-photo" | "prediction" | "test" | "export", message: string) { super(message); }
}

/** 生成済み画像を再利用し、失敗した生成だけを明示的に再試行する。 */
export async function prepareResultImage({ photo, risks, rows, audience, retry = false }: { photo: string | null; risks: Risk[]; rows: ShareRow[]; audience: Audience; retry?: boolean }) {
  const prediction = await prepareAftermath(photo, risks, retry);
  const display = aftermathDisplay(prediction);
  try { return await createResultSummaryFile({ rows, audience, ...display }); }
  catch { throw new ResultImageError("export", "予想図は生成済みですが、保存用の画像に変換できませんでした。もう一度試すか、別のブラウザーで開いてください。"); }
}

export function resultImageError(error: unknown) {
  return error instanceof ResultImageError ? error : new ResultImageError("export", "画像を保存できませんでした。もう一度試してください。");
}
