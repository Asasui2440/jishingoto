import type { ReadingToken } from "./furigana-tokens";

const cache = new Map<string, ReadingToken[]>();
const pending = new Map<string, { promise: Promise<ReadingToken[]>; inFlight?: boolean; resolve: (value: ReadingToken[]) => void; reject: (reason: unknown) => void }>();
let scheduled = false;
export const cachedReadings = (text: string) => cache.get(text);

export function requestReadings(text: string): Promise<ReadingToken[]> {
  const cached = cache.get(text);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(text);
  if (existing) return existing.promise;
  let resolve!: (value: ReadingToken[]) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReadingToken[]>((yes, no) => { resolve = yes; reject = no; });
  pending.set(text, { promise, resolve, reject });
  if (!scheduled) {
    scheduled = true;
    setTimeout(() => { scheduled = false; void flush(); }, 20);
  }
  return promise;
}
async function flush() {
  const entries = [...pending.entries()].filter(([, job]) => !job.inFlight);
  entries.forEach(([, job]) => { job.inFlight = true; });
  // 一画面分をまとめて取得し、同じラベルは再利用する。
  for (let offset = 0; offset < entries.length; offset += 12) {
    const batch = entries.slice(offset, offset + 12);
    try {
      const response = await fetch("/api/readings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: batch.map(([text]) => text) }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("readings unavailable");
      const result = await response.json() as { readings: ReadingToken[][] };
      if (!Array.isArray(result.readings) || result.readings.length !== batch.length) throw new Error("invalid readings");
      batch.forEach(([text, job], index) => {
        cache.set(text, result.readings[index]);
        if (cache.size > 1000) cache.delete(cache.keys().next().value!);
        pending.delete(text);
        job.resolve(result.readings[index]);
      });
    } catch (error) {
      batch.forEach(([text, job]) => { pending.delete(text); job.reject(error); });
    }
  }
}
