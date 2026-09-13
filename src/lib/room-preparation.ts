import { analyzeRoom, aftermathEvents, generateAftermath, type Aftermath, type RoomAnalysis } from "./api";
import type { Risk } from "./content";
import { DETECTED_RISKS } from "./content";
import { roomTestOptions, resetRoomTimings, startRoomTiming } from "./room-test";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 写真と生成画像はメモリ内だけに保持する。画面のアンマウントでは処理を止めない。
let analysisJob: { photo: string | null; promise: Promise<RoomAnalysis> } | null = null;
let imageJob: { photo: string | null; promise: Promise<Aftermath>; result: Aftermath | null } | null = null;

export function prepareAftermath(photo: string | null, risks: Risk[], retry = false): Promise<Aftermath> {
  if (!photo && roomTestOptions().mode !== "fixture") return generateAftermath(null);
  if (imageJob?.photo === photo && !(retry && imageJob.result?.source === "preview")) return imageJob.promise.then((result) => ({ ...result, events: aftermathEvents(risks) }));
  const options = roomTestOptions();
  const finish = startRoomTiming("image");
  const promise: Promise<Aftermath> = options.mode === "fixture"
    ? delay(options.imageMs).then(() => ({ imageUrl: "/figma/img/room-risk.jpg", events: [], source: "test" }))
    : generateAftermath(photo);
  const job = {
    photo,
    result: null as Aftermath | null,
    promise: promise.then((result) => { finish(result.source === "ai" || result.source === "test"); return result; }),
  };
  imageJob = job;
  void job.promise.then((result) => { job.result = result; });
  return job.promise.then((result) => ({ ...result, events: aftermathEvents(risks) }));
}

export function preparedAftermath(photo: string | null, risks: Risk[]) {
  return imageJob?.photo === photo && imageJob.result ? { ...imageJob.result, events: aftermathEvents(risks) } : null;
}

/** マスク確定後、部屋の危険候補だけを解析する。 */
export function prepareRoom(photo: string | null): Promise<RoomAnalysis> {
  if (analysisJob?.photo === photo) return analysisJob.promise;
  resetRoomTimings();
  const options = roomTestOptions();
  const finish = startRoomTiming("analysis");
  const work: Promise<RoomAnalysis> = options.mode === "fixture"
    ? delay(options.analysisMs).then(() => ({ risks: DETECTED_RISKS.map((risk) => ({ ...risk })), source: "demo", warning: "APIなしの固定テストデータです。実際の写真の解析ではありません。" }))
    : analyzeRoom(photo);
  const promise = work.then((result) => { finish(options.mode === "fixture" || result.source === "ai"); return result; });
  analysisJob = { photo, promise };
  return promise;
}

export function clearRoomPreparation() {
  analysisJob = null;
  imageJob = null;
  resetRoomTimings();
}

/** 同意・マスク確定後の画像だけで、解析と予想図生成を並行して開始する。 */
export function prepareMaskedRoom(photo: string): Promise<RoomAnalysis> {
  const analysis = prepareRoom(photo);
  void prepareAftermath(photo, []);
  return analysis;
}
