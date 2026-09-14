import { analyzeRoom, aftermathEvents, generateAftermath, type Aftermath, type RoomAnalysis } from "./api";
import type { Risk } from "./content";
import { DETECTED_RISKS } from "./content";
import { roomTestOptions, resetRoomTimings, startRoomTiming } from "./room-test";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 写真と生成画像はメモリ内だけに保持する。画面のアンマウントでは処理を止めない。
type Preparation = {
  analysisJob: { photo: string | null; promise: Promise<RoomAnalysis> } | null;
  imageJob: { photo: string | null; promise: Promise<Aftermath>; result: Aftermath | null } | null;
};
const empty = (): Preparation => ({ analysisJob: null, imageJob: null });
// ブラウザーの同じページ内だけで共有し、開発中の更新でも生成済み画像を再利用する。
const jobs: Preparation = typeof window === "undefined" ? empty() : (() => {
  const scope = globalThis as typeof globalThis & { __jishingotoPreparation?: Preparation };
  return scope.__jishingotoPreparation ??= empty();
})();

export function prepareAftermath(photo: string | null, risks: Risk[], retry = false): Promise<Aftermath> {
  if (!photo && roomTestOptions().mode !== "fixture") return generateAftermath(null);
  if (jobs.imageJob?.photo === photo && !(retry && jobs.imageJob.result?.source === "preview")) return jobs.imageJob.promise.then((result) => ({ ...result, events: aftermathEvents(risks) }));
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
  jobs.imageJob = job;
  void job.promise.then((result) => { job.result = result; });
  return job.promise.then((result) => ({ ...result, events: aftermathEvents(risks) }));
}

export function preparedAftermath(photo: string | null, risks: Risk[]) {
  return jobs.imageJob?.photo === photo && jobs.imageJob.result ? { ...jobs.imageJob.result, events: aftermathEvents(risks) } : null;
}

/** マスク確定後、部屋の危険候補だけを解析する。 */
export function prepareRoom(photo: string | null): Promise<RoomAnalysis> {
  if (jobs.analysisJob?.photo === photo) return jobs.analysisJob.promise;
  resetRoomTimings();
  const options = roomTestOptions();
  const finish = startRoomTiming("analysis");
  const work: Promise<RoomAnalysis> = options.mode === "fixture"
    ? delay(options.analysisMs).then(() => ({ risks: DETECTED_RISKS.map((risk) => ({ ...risk })), source: "demo", warning: "APIなしの固定テストデータです。実際の写真の解析ではありません。" }))
    : analyzeRoom(photo);
  const promise = work.then((result) => { finish(options.mode === "fixture" || result.source === "ai"); return result; });
  jobs.analysisJob = { photo, promise };
  return promise;
}

export function clearRoomPreparation() {
  jobs.analysisJob = null;
  jobs.imageJob = null;
  resetRoomTimings();
}

/** 同意・マスク確定後の画像だけで、解析と予想図生成を並行して開始する。 */
export function prepareMaskedRoom(photo: string, aftermathPhoto = photo): Promise<RoomAnalysis> {
  const analysis = prepareRoom(photo);
  void prepareAftermath(aftermathPhoto, []);
  return analysis;
}
