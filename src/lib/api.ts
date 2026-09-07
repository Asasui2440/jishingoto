/** Same-origin backend boundary. API keys are never sent to the browser. */
import { DETECTED_RISKS, QUESTIONS, type Question, type Risk } from "./content";
export type BlurRegion = { id: string; x: number; y: number; w: number; h: number; shape: "rect" | "circle" };
export type Aftermath = { imageUrl: string | null; events: { riskId: string; text: string }[] };

/** Privacy regions are selected locally, before any photo is uploaded. */
export async function detectBlurRegions(): Promise<BlurRegion[]> { return []; }

async function post<T>(path: string, body: FormData, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { method: "POST", body, signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(240_000)]) : AbortSignal.timeout(240_000) });
  } catch {
    throw new Error("通信が中断されました。接続を確認して再試行してください。");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("サーバーの応答を読み取れませんでした。再試行してください。"); }
  if (!response.ok) throw new Error(data.error?.message || "AIの処理に失敗しました。");
  return data;
}

export async function analyzeRoom(photo?: Blob, signal?: AbortSignal): Promise<Risk[]> {
  if (!photo) return DETECTED_RISKS.map((r) => ({ ...r }));
  const body = new FormData();
  body.set("photo", photo, "room.jpg");
  return post<Risk[]>("analyze", body, signal);
}

/** Keep the authored questions and scoring stable; select by confirmed risk kind. */
export async function fetchQuestions(risks: Risk[]): Promise<Question[]> {
  const kinds = new Set(risks.filter((r) => r.confirmed).map((r) => r.kind));
  const forRisks = QUESTIONS.filter((q) => q.riskKind && kinds.has(q.riskKind));
  const common = QUESTIONS.filter((q) => !q.riskKind);
  const leading = forRisks.length > 0 ? forRisks : QUESTIONS.filter((q) => q.riskKind);
  return [...leading, ...common];
}

// Keep only the most recent result in memory, including in-flight work. React
// remounts/result-page revisits must not silently generate another paid image.
let latest: { key: string; promise: Promise<Aftermath> } | undefined;
export async function generateAftermath(photo: string | null, risks: Risk[]): Promise<Aftermath> {
  const confirmed = risks.filter((r) => r.confirmed);
  if (!photo || !confirmed.length) return { imageUrl: null, events: [] };
  const key = JSON.stringify([photo, confirmed]);
  if (latest?.key === key) return latest.promise;
  const promise = (async () => {
    const response = await fetch(photo);
    if (!response.ok) throw new Error("写真が見つかりません。もう一度撮影してください。");
    const body = new FormData();
    body.set("photo", await response.blob(), "room.jpg");
    body.set("risks", JSON.stringify(confirmed));
    return post<Aftermath>("aftermath", body);
  })();
  latest = { key, promise };
  try { return await promise; }
  catch (error) { if (latest?.promise === promise) latest = undefined; throw error; }
}
