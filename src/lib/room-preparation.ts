import { aftermathKey } from "./aftermath-plan";
import { analyzeRoom, aftermathEvents, generateAftermath, type Aftermath, type RoomAnalysis } from "./api";
import type { Risk } from "./content";
import { DETECTED_RISKS } from "./content";
import { roomTestOptions, resetRoomTimings, startRoomTiming } from "./room-test";
import type { RoomView } from "./room-views";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 写真と生成画像はメモリ内だけに保持する。画面のアンマウントでは処理を止めない。
type Preparation = {
  analysisJob: { photo: string | null; views: RoomView[]; promise: Promise<RoomAnalysis> } | null;
  imageJob: { startedAt: number; key: string; photo: string | null; promise: Promise<Aftermath>; result: Aftermath | null } | null;
};
const empty = (): Preparation => ({ analysisJob: null, imageJob: null });
const jobs: Preparation = typeof window === "undefined" ? empty() : (() => {
  const scope = globalThis as typeof globalThis & { __jishingotoPreparationV3?: Preparation };
  return scope.__jishingotoPreparationV3 ??= empty();
})();

export function prepareAftermath(photo: string | null, risks: Risk[], retry = false): Promise<Aftermath> {
  if (!photo && roomTestOptions().mode !== "fixture") return generateAftermath(null);
  const key = aftermathKey(risks);
  if (jobs.imageJob?.photo === photo && jobs.imageJob.key === key && !(retry && jobs.imageJob.result?.source === "preview")) return jobs.imageJob.promise.then((result) => ({ ...result, events: aftermathEvents(risks) }));
  const options = roomTestOptions();
  const finish = startRoomTiming("image");
  const promise: Promise<Aftermath> = options.mode === "fixture"
    ? delay(options.imageMs).then(() => ({ imageUrl: "/figma/img/room-risk.jpg", events: [], source: "test" }))
    : generateAftermath(photo, risks);
  const job = {
    photo, key, startedAt: Date.now(),
    result: null as Aftermath | null,
    promise: promise.then((result) => { finish(result.source === "ai" || result.source === "test"); return result; }),
  };
  jobs.imageJob = job;
  void job.promise.then((result) => { job.result = result; });
  return job.promise.then((result) => ({ ...result, events: aftermathEvents(risks) }));
}

/** クイズ中に始めた処理の経過時間を、結果画面でも引き継ぐ。 */
export function aftermathStartedAt(photo: string | null, risks: Risk[]): number | null {
  return jobs.imageJob?.photo === photo && jobs.imageJob.key === aftermathKey(risks) ? jobs.imageJob.startedAt : null;
}

export function preparedAftermath(photo: string | null, risks: Risk[]) {
  return jobs.imageJob?.photo === photo && jobs.imageJob.key === aftermathKey(risks) && jobs.imageJob.result ? { ...jobs.imageJob.result, events: aftermathEvents(risks) } : null;
}

/** マスク確定後、部屋の危険候補だけを解析する。 */
export function prepareRoom(photo: string | null, views: RoomView[] = []): Promise<RoomAnalysis> {
  const previous = jobs.analysisJob;
  if (previous?.photo === photo && previous.views.length === views.length && views.every((view, i) => {
    const cached = previous.views[i];
    return view.url === cached.url && (["x", "y", "w", "h"] as const).every(key => view.bounds[key] === cached.bounds[key]);
  })) return previous.promise;
  const snapshot = views.map(view => ({ url: view.url, bounds: { ...view.bounds } }));
  resetRoomTimings();
  const options = roomTestOptions();
  const finish = startRoomTiming("analysis");
  const work: Promise<RoomAnalysis> = options.mode === "fixture"
    ? delay(options.analysisMs).then(() => ({ risks: DETECTED_RISKS.map((risk) => ({ ...risk })), source: "demo", warning: "APIなしの固定テストデータです。実際の写真の解析ではありません。" }))
    : analyzeRoom(photo, snapshot);
  const promise = work.then((result) => { finish(options.mode === "fixture" || result.source === "ai"); return result; });
  jobs.analysisJob = { photo, views: snapshot, promise };
  return promise;
}

export function clearRoomPreparation() {
  jobs.analysisJob = null;
  jobs.imageJob = null;
  resetRoomTimings();
}

/** マスク確定後は認識のみ。画像生成は家具の確認・修正を終えてから開始する。 */
export function prepareMaskedRoom(photo: string, views: RoomView[] = []): Promise<RoomAnalysis> {
  return prepareRoom(photo, views);
}
